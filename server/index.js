import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import net from 'net';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

dotenv.config();
const DEFAULT_JWT_SECRET = 'manager-coffee-super-secret-key-1234';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

if (IS_PRODUCTION && !process.env.JWT_SECRET) {
  throw new Error('Thiếu JWT_SECRET trong môi trường production.');
}

if (!process.env.JWT_SECRET) {
  console.warn('[AUTH] Dang su dung JWT_SECRET mac dinh cho moi truong local/dev.');
}

const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
const PLATFORM_ADMIN_EMAIL = process.env.PLATFORM_ADMIN_EMAIL || (!IS_PRODUCTION ? 'platform@managercoffee.local' : null);
const PLATFORM_ADMIN_PASSWORD = process.env.PLATFORM_ADMIN_PASSWORD || (!IS_PRODUCTION ? 'platform123456' : null);
const PLATFORM_ADMIN_PASSWORD_HASH = process.env.PLATFORM_ADMIN_PASSWORD_HASH || null;

if (IS_PRODUCTION && !process.env.INTEGRATION_SECRET_KEY) {
  console.warn('[INTEGRATIONS] Nen dat INTEGRATION_SECRET_KEY rieng de ma hoa secret tich hop theo tung store.');
}

const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',') 
  : true; // true reflects the origin to support credentials

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

const prisma = new PrismaClient();
const apiMetrics = {
  startedAt: new Date().toISOString(),
  totalRequests: 0,
  errorResponses: 0,
  slowRequests: 0,
  totalDurationMs: 0,
  maxDurationMs: 0
};

// ===== VIETNAM TIMEZONE HELPERS (UTC+7) =====
// Converts a UTC Date to Vietnam time by adding 7 hours offset
function toVNDate(date = new Date()) {
  return new Date(date.getTime() + 7 * 60 * 60 * 1000);
}

// Returns current date string in YYYY-MM-DD format, Vietnam timezone
function getVNDateStr(date = new Date()) {
  const vn = toVNDate(date);
  return vn.toISOString().split('T')[0];
}

// Returns start of day in UTC for a VN date string (e.g. '2026-06-29' → 2026-06-28T17:00:00Z)
function getVNStartOfDay(dateStr) {
  return new Date(dateStr + 'T00:00:00+07:00');
}

// Returns end of day in UTC for a VN date string (e.g. '2026-06-29' → 2026-06-29T16:59:59.999Z)
function getVNEndOfDay(dateStr) {
  return new Date(dateStr + 'T23:59:59.999+07:00');
}

// Returns time string in HH:MM format, Vietnam timezone
function getVNTimeStr(date = new Date()) {
  const vn = toVNDate(date);
  return vn.toISOString().split('T')[1].substring(0, 5);
}

// Returns date string in dd/M/yyyy format (vi-VN style), Vietnam timezone
function getVNLocaleDateStr(date = new Date()) {
  const vn = toVNDate(date);
  return `${vn.getUTCDate()}/${vn.getUTCMonth() + 1}/${vn.getUTCFullYear()}`;
}
// ===== END TIMEZONE HELPERS =====

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '5mb' }));

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    if (!req.path.startsWith('/api/')) return;
    const durationMs = Date.now() - startedAt;
    apiMetrics.totalRequests += 1;
    apiMetrics.totalDurationMs += durationMs;
    apiMetrics.maxDurationMs = Math.max(apiMetrics.maxDurationMs, durationMs);
    if (res.statusCode >= 500) apiMetrics.errorResponses += 1;
    if (durationMs > 1000) {
      apiMetrics.slowRequests += 1;
      console.warn(`[SLOW_API] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`);
    }
  });
  next();
});

const isAdminUser = (user) => user?.role === 'admin';
const canViewReports = (user) => isAdminUser(user) || user?.canViewReports === true;
const canRefundOrders = (user) => isAdminUser(user) || user?.canRefund === true;
const canManageUserRecord = (user, userId) => isAdminUser(user) || user?.userId === userId;
const BCRYPT_HASH_RE = /^\$2[aby]\$\d{2}\$/;
const storeQueues = new Map();

async function withStoreQueue(storeId, task) {
  const key = storeId || '__global__';
  const previous = storeQueues.get(key) || Promise.resolve();
  let releaseCurrent;
  const current = new Promise((resolve) => {
    releaseCurrent = resolve;
  });
  const queueEntry = previous.catch(() => {}).then(() => current);
  storeQueues.set(key, queueEntry);

  await previous.catch(() => {});
  try {
    return await task();
  } finally {
    releaseCurrent();
    if (storeQueues.get(key) === queueEntry) {
      storeQueues.delete(key);
    }
  }
}

function sanitizeUser(user) {
  if (!user) return user;
  const { password: _password, pin: _pin, pinHash: _pinHash, ...safeUser } = user;
  return {
    ...safeUser,
    hasPin: Boolean(user.pin || user.pinHash)
  };
}

async function userMatchesPin(user, pin) {
  if (!user || !pin) return false;
  if (user.pinHash && await bcrypt.compare(pin, user.pinHash)) return true;
  if (user.pin && BCRYPT_HASH_RE.test(user.pin) && await bcrypt.compare(pin, user.pin)) return true;
  return user.pin === pin;
}

async function findUserByPin(storeId, pin) {
  const users = await prisma.user.findMany({
    where: { storeId },
    include: { store: true }
  });
  for (const user of users) {
    if (await userMatchesPin(user, pin)) return user;
  }
  return null;
}

async function isPinAlreadyUsed(storeId, pin, excludeUserId = null) {
  if (!pin) return false;
  const users = await prisma.user.findMany({
    where: {
      storeId,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {})
    }
  });
  for (const user of users) {
    if (await userMatchesPin(user, pin)) return true;
  }
  return false;
}

async function lockStoreCounter(tx, storeId, key) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${key}:${storeId}`}))`;
}

async function nextOrderNumber(tx, storeId) {
  await lockStoreCounter(tx, storeId, 'order');
  const count = await tx.order.count({ where: { storeId } });
  return `#HD${1001 + count}`;
}

async function nextReturnNumber(tx, storeId) {
  await lockStoreCounter(tx, storeId, 'return');
  const count = await tx.returnOrder.count({ where: { storeId } });
  return `#TH${1001 + count}`;
}

function normalizeCartProductId(item) {
  return item.productId || item.id || null;
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

const INTEGRATION_DEFS = {
  payos: {
    provider: 'payos',
    label: 'payOS',
    category: 'payments',
    configFields: ['mode', 'webhookUrl'],
    secretFields: ['clientId', 'apiKey', 'checksumKey', 'webhookSecret']
  },
  einvoice: {
    provider: 'einvoice',
    label: 'Hóa đơn điện tử',
    category: 'invoice',
    configFields: ['providerName', 'apiUrl', 'taxCode', 'invoiceTemplate', 'invoiceSeries'],
    secretFields: ['apiKey', 'username', 'password', 'signingToken']
  },
  grabfood: {
    provider: 'grabfood',
    label: 'GrabFood',
    category: 'delivery',
    configFields: ['apiUrl', 'merchantId', 'storeCode'],
    secretFields: ['apiKey', 'clientSecret', 'webhookSecret']
  },
  shopeefood: {
    provider: 'shopeefood',
    label: 'ShopeeFood',
    category: 'delivery',
    configFields: ['apiUrl', 'merchantId', 'storeCode'],
    secretFields: ['apiKey', 'clientSecret', 'webhookSecret']
  },
  web_order: {
    provider: 'web_order',
    label: 'Web Order',
    category: 'delivery',
    configFields: ['publicOrderUrl', 'channelName'],
    secretFields: ['webhookSecret']
  }
};

function getIntegrationEncryptionKey() {
  const source = process.env.INTEGRATION_SECRET_KEY || JWT_SECRET;
  return crypto.createHash('sha256').update(source).digest();
}

function encryptIntegrationSecrets(secrets = {}) {
  const cleanedSecrets = Object.fromEntries(
    Object.entries(secrets)
      .filter(([, value]) => hasText(value))
      .map(([key, value]) => [key, String(value).trim()])
  );
  if (Object.keys(cleanedSecrets).length === 0) return null;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getIntegrationEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(cleanedSecrets), 'utf8'),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return JSON.stringify({
    v: 1,
    alg: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64')
  });
}

function decryptIntegrationSecrets(encryptedSecrets) {
  if (!encryptedSecrets) return {};
  try {
    const payload = JSON.parse(encryptedSecrets);
    if (payload?.v !== 1 || payload?.alg !== 'aes-256-gcm') return {};
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      getIntegrationEncryptionKey(),
      Buffer.from(payload.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payload.data, 'base64')),
      decipher.final()
    ]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch (err) {
    console.error('[INTEGRATIONS] Khong the giai ma secret:', err.message);
    return {};
  }
}

function parseIntegrationConfig(value) {
  if (!value) return {};
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return {};
  }
}

function pickAllowedFields(source = {}, allowedFields = []) {
  const result = {};
  for (const field of allowedFields) {
    if (source[field] !== undefined && source[field] !== null) {
      result[field] = typeof source[field] === 'string' ? source[field].trim() : source[field];
    }
  }
  return result;
}

function integrationSecretFlags(provider, encryptedSecrets) {
  const def = INTEGRATION_DEFS[provider];
  const secrets = decryptIntegrationSecrets(encryptedSecrets);
  return Object.fromEntries((def?.secretFields || []).map((field) => [field, hasText(secrets[field])]));
}

function serializeIntegration(provider, record = null) {
  const def = INTEGRATION_DEFS[provider];
  if (!def) {
    return {
      provider,
      label: provider,
      category: record?.category || 'custom',
      isEnabled: Boolean(record?.isEnabled),
      config: parseIntegrationConfig(record?.config),
      secretsConfigured: { any: Boolean(record?.secrets) },
      updatedAt: record?.updatedAt || null
    };
  }
  return {
    provider,
    label: def.label,
    category: def.category,
    isEnabled: Boolean(record?.isEnabled),
    config: parseIntegrationConfig(record?.config),
    secretsConfigured: integrationSecretFlags(provider, record?.secrets),
    updatedAt: record?.updatedAt || null
  };
}

async function getStoreIntegrationRecord(storeId, provider) {
  return prisma.storeIntegration.findUnique({
    where: { storeId_provider: { storeId, provider } }
  });
}

async function getStoreIntegrationMap(storeId) {
  const records = await prisma.storeIntegration.findMany({ where: { storeId } });
  return records.reduce((acc, record) => {
    acc[record.provider] = record;
    return acc;
  }, {});
}

function sanitizeClientRequestId(value) {
  if (!value) return null;
  const clean = String(value).trim();
  if (!clean) return null;
  return clean.replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, 128) || null;
}

function amountsMatch(webhookAmount, orderTotal) {
  if (webhookAmount === undefined || webhookAmount === null || webhookAmount === '') return true;
  const parsedWebhookAmount = Number(webhookAmount);
  const parsedOrderTotal = Number(orderTotal);
  if (!Number.isFinite(parsedWebhookAmount) || !Number.isFinite(parsedOrderTotal)) return false;
  return Math.abs(parsedWebhookAmount - parsedOrderTotal) <= 1;
}

function isPrivateLanIp(ip) {
  const parts = String(ip || '').trim().split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function nullableDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolveCashAmount(order, fallbackPaymentMethod = null, fallbackTotal = null, payments = null) {
  const paymentRows = payments || order?.payments || null;
  if (Array.isArray(paymentRows) && paymentRows.length > 0) {
    return paymentRows
      .filter((payment) => payment.method === 'cash')
      .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
  }
  const method = fallbackPaymentMethod || order?.paymentMethod;
  const totalAmount = Number(fallbackTotal ?? order?.total) || 0;
  return method === 'cash' ? totalAmount : 0;
}

async function deductInventoryForItems(tx, storeId, items, orderNumber) {
  for (const item of items) {
    const productId = normalizeCartProductId(item);
    let product = productId ? await tx.product.findFirst({ where: { id: productId, storeId } }) : null;
    if (!product) {
      product = await tx.product.findFirst({ where: { storeId, name: item.name } });
    }
    if (!product) continue;

    const recipeItems = await tx.recipeItem.findMany({
      where: { productId: product.id },
      include: { inventory: true }
    });

    for (const recipe of recipeItems) {
      const amount = recipe.qty * item.qty;
      const inventory = await tx.inventory.findFirst({
        where: { id: recipe.inventoryId, storeId }
      });
      if (!inventory) continue;

      const updatedInventory = await tx.inventory.update({
        where: { id: recipe.inventoryId },
        data: { qty: { decrement: amount } }
      });

      await tx.stockTransaction.create({
        data: {
          storeId,
          inventoryId: recipe.inventoryId,
          type: 'SALE',
          qtyChange: -amount,
          balance: updatedInventory.qty,
          note: `Bán hàng - HĐ ${orderNumber} (${item.name} x${item.qty})`
        }
      });
    }
  }
}

async function applyPaidOrderEffects(tx, storeId, order, options = {}) {
  const cashAmount = resolveCashAmount(order, order.paymentMethod, order.total, options.payments);

  if (cashAmount > 0 && order.employeeId) {
    const activeShift = await tx.cashShift.findFirst({
      where: { storeId, userId: order.employeeId, status: 'open' }
    });
    if (activeShift) {
      await tx.cashShift.update({
        where: { id: activeShift.id },
        data: {
          cashSales: { increment: cashAmount },
          expectedCash: { increment: cashAmount }
        }
      });
    }
  }

  if (order.customerId) {
    const store = await tx.store.findUnique({ where: { id: storeId } });
    const pointsRate = store?.pointsRate ?? 0.1;
    const pointsToAdd = Math.floor(order.total * pointsRate);
    const customer = await tx.customer.findFirst({ where: { id: order.customerId, storeId } });
    if (customer) {
      let newPoints = customer.points + pointsToAdd;
      if (order.usedPoints && order.usedPoints > 0) {
        newPoints = Math.max(0, newPoints - order.usedPoints);
      }
      let newTier = customer.tier;
      if (newPoints >= 1500) newTier = 'DIAMOND';
      else if (newPoints >= 500) newTier = 'GOLD';

      await tx.customer.update({
        where: { id: customer.id },
        data: { points: newPoints, tier: newTier }
      });
    }
  }

  if (order.tableId) {
    await tx.table.updateMany({
      where: { id: order.tableId, storeId },
      data: { status: 'dirty', occupiedSince: null }
    });
  }

  await deductInventoryForItems(tx, storeId, order.items || [], order.orderNumber);
}

function parseJsonField(value, fieldName) {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(`${fieldName} không đúng định dạng JSON`);
    }
  }
  return value || {};
}

async function validatePromotionPayload(storeId, payload, existingId = null) {
  const cleanName = String(payload.name || '').trim();
  if (!cleanName) throw new Error('Tên chương trình khuyến mãi không được để trống');

  const allowedTypes = ['HAPPY_HOUR', 'COMBO', 'BUY_X_GET_Y'];
  if (!allowedTypes.includes(payload.type)) {
    throw new Error('Loại khuyến mãi không hợp lệ');
  }

  const startDate = payload.startDate ? new Date(payload.startDate) : null;
  const endDate = payload.endDate ? new Date(payload.endDate) : null;
  if (startDate && Number.isNaN(startDate.getTime())) throw new Error('Ngày bắt đầu không hợp lệ');
  if (endDate && Number.isNaN(endDate.getTime())) throw new Error('Ngày kết thúc không hợp lệ');
  if (startDate && endDate && endDate < startDate) {
    throw new Error('Ngày kết thúc phải sau ngày bắt đầu');
  }

  const conditions = parseJsonField(payload.conditions, 'Điều kiện khuyến mãi');
  const rewards = parseJsonField(payload.rewards, 'Phần thưởng khuyến mãi');

  if (payload.type === 'HAPPY_HOUR') {
    const discountPct = Number(rewards.discountPct);
    if (!Number.isFinite(discountPct) || discountPct <= 0 || discountPct > 100) {
      throw new Error('Phần trăm giảm giá Happy Hour phải lớn hơn 0 và không vượt quá 100');
    }
    if (!conditions.startHour || !conditions.endHour || conditions.startHour > conditions.endHour) {
      throw new Error('Khung giờ Happy Hour không hợp lệ');
    }
  }

  if (payload.type === 'COMBO') {
    if (!Array.isArray(conditions.comboProducts) || conditions.comboProducts.length < 2) {
      throw new Error('Combo phải có ít nhất 2 sản phẩm');
    }
    const comboPrice = Number(rewards.comboPrice);
    if (!Number.isFinite(comboPrice) || comboPrice <= 0) {
      throw new Error('Giá combo phải lớn hơn 0');
    }
  }

  if (payload.type === 'BUY_X_GET_Y') {
    if (!conditions.buyProductId || !rewards.getProductId) {
      throw new Error('Khuyến mãi mua X tặng Y cần đủ sản phẩm mua và sản phẩm tặng');
    }
    if ((Number(conditions.minQty) || 0) <= 0 || (Number(rewards.freeQty) || 0) <= 0) {
      throw new Error('Số lượng mua/tặng phải lớn hơn 0');
    }
  }

  const isActive = payload.isActive !== undefined ? Boolean(payload.isActive) : true;
  if (isActive) {
    const duplicate = await prisma.promotion.findFirst({
      where: {
        storeId,
        isActive: true,
        name: { equals: cleanName, mode: 'insensitive' },
        ...(existingId ? { id: { not: existingId } } : {})
      }
    });
    if (duplicate) {
      throw new Error('Đã có chương trình khuyến mãi đang hoạt động cùng tên');
    }
  }

  return {
    name: cleanName,
    type: payload.type,
    conditions: JSON.stringify(conditions),
    rewards: JSON.stringify(rewards),
    startDate,
    endDate,
    isActive
  };
}

async function writeAuditLog(req, action, entity, entityId = null, metadata = {}) {
  if (!req.storeId) return;
  try {
    await prisma.auditLog.create({
      data: {
        storeId: req.storeId,
        userId: req.user?.userId || null,
        userName: req.user?.name || null,
        userRole: req.user?.role || null,
        action,
        entity,
        entityId,
        metadata: JSON.stringify(metadata || {}),
        ip: req.ip || null,
        userAgent: req.headers['user-agent'] || null
      }
    });
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}

function requireAdmin(req, res) {
  if (!isAdminUser(req.user)) {
    res.status(403).json({ error: 'Tài khoản của bạn không có quyền thực hiện thao tác quản trị này.' });
    return false;
  }
  return true;
}

function requireReportAccess(req, res) {
  if (!canViewReports(req.user)) {
    res.status(403).json({ error: 'Tài khoản của bạn không có quyền xem báo cáo.' });
    return false;
  }
  return true;
}

function requireRefundAccess(req, res) {
  if (!canRefundOrders(req.user)) {
    res.status(403).json({ error: 'Tài khoản của bạn không có quyền trả hàng hoặc hoàn tiền.' });
    return false;
  }
  return true;
}

function requirePlatformAdmin(req, res) {
  if (req.platformUser?.scope !== 'platform_admin') {
    res.status(403).json({ error: 'Bạn không có quyền quản trị nền tảng.' });
    return false;
  }
  return true;
}

async function platformPasswordMatches(password) {
  if (!password) return false;
  if (PLATFORM_ADMIN_PASSWORD_HASH) {
    return bcrypt.compare(password, PLATFORM_ADMIN_PASSWORD_HASH);
  }
  return Boolean(PLATFORM_ADMIN_PASSWORD) && password === PLATFORM_ADMIN_PASSWORD;
}

function buildApiMetricsSnapshot() {
  return {
    ...apiMetrics,
    avgDurationMs: apiMetrics.totalRequests > 0
      ? Math.round(apiMetrics.totalDurationMs / apiMetrics.totalRequests)
      : 0,
    uptimeSec: Math.round(process.uptime())
  };
}

// --- IN-MEMORY CARTS (For Realtime Sync) ---
// Structure: { storeId: { tableId: cart, __takeaway__: cart } }
let storeCarts = {};

// --- WEBSOCKETS ---
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  socket.on('joinStore', (storeId) => {
    socket.join(storeId);
    console.log(`Socket ${socket.id} joined store ${storeId}`);
    if (!storeCarts[storeId]) storeCarts[storeId] = {};
    socket.emit('cartSync', storeCarts[storeId]);
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

// Broadcast helper (tenant-scoped)
const broadcast = (event, data, storeId) => {
  if (storeId) {
    io.to(storeId).emit(event, data);
  }
};

// --- MULTI-TENANT & AUTH MIDDLEWARE ---
app.use((req, res, next) => {
  if (req.path === '/api/platform/auth/login') {
    return next();
  }

  if (req.path.startsWith('/api/platform/')) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Thiếu token quản trị nền tảng' });
    }
    try {
      const token = authHeader.substring(7);
      const payload = jwt.verify(token, JWT_SECRET);
      if (payload.scope !== 'platform_admin') {
        return res.status(403).json({ error: 'Token không có quyền quản trị nền tảng' });
      }
      req.platformUser = payload;
      return next();
    } catch {
      return res.status(401).json({ error: 'Phiên quản trị nền tảng hết hạn hoặc không hợp lệ' });
    }
  }

  // Cho phép bỏ qua kiểm tra đăng nhập/đăng ký/webhook PayOS
  if (
    req.path === '/api/health' ||
    req.path === '/api/ready' ||
    req.path === '/api/auth/login' || 
    req.path === '/api/auth/login-admin' ||
    req.path === '/api/auth/register-store' ||
    req.path === '/api/payments/payos-webhook'
  ) {
    return next();
  }
  
  let storeId = null;
  let userPayload = null;
  
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      userPayload = jwt.verify(token, JWT_SECRET);
      storeId = userPayload.storeId;
      req.user = userPayload; // Đính kèm thông tin user giải mã từ token vào req
    } catch (err) {
      return res.status(401).json({ error: 'Phiên làm việc hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.' });
    }
  } else {
    // Fallback cho local development hoặc migration scripts
    if (!IS_PRODUCTION) {
      storeId = req.headers['x-store-id'];
    }
  }
  
  if (!storeId && req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Thiếu thông tin xác thực (JWT Token hoặc x-store-id)' });
  }
  
  req.storeId = storeId;
  next();
});

// --- API ENDPOINTS ---

app.get('/api/health', async (req, res) => {
  res.json({
    ok: true,
    status: 'live',
    service: 'manager-coffee-api',
    env: process.env.NODE_ENV || 'development',
    uptimeSec: Math.round(process.uptime()),
    time: new Date().toISOString()
  });
});

app.get('/api/ready', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      ok: true,
      status: 'ready',
      service: 'manager-coffee-api',
      env: process.env.NODE_ENV || 'development',
      time: new Date().toISOString()
    });
  } catch (err) {
    res.status(503).json({
      ok: false,
      service: 'manager-coffee-api',
      error: err.message,
      time: new Date().toISOString()
    });
  }
});

app.post('/api/platform/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!PLATFORM_ADMIN_EMAIL || (!PLATFORM_ADMIN_PASSWORD && !PLATFORM_ADMIN_PASSWORD_HASH)) {
    return res.status(503).json({ error: 'Chưa cấu hình tài khoản quản trị nền tảng.' });
  }
  if (!email || !password) {
    return res.status(400).json({ error: 'Vui lòng nhập email và mật khẩu quản trị nền tảng.' });
  }
  if (String(email).trim().toLowerCase() !== PLATFORM_ADMIN_EMAIL.toLowerCase() || !(await platformPasswordMatches(password))) {
    return res.status(401).json({ error: 'Email hoặc mật khẩu quản trị nền tảng không đúng.' });
  }

  const token = jwt.sign(
    {
      scope: 'platform_admin',
      email: PLATFORM_ADMIN_EMAIL,
      name: 'Platform Admin'
    },
    JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.json({
    id: 'platform-admin',
    role: 'platform_admin',
    name: 'Platform Admin',
    email: PLATFORM_ADMIN_EMAIL,
    token
  });
});

app.get('/api/platform/overview', async (req, res) => {
  if (!requirePlatformAdmin(req, res)) return;
  try {
    const [
      totalStores,
      activeStores,
      trialStores,
      paidStores,
      totalUsers,
      totalOrders,
      recentStores
    ] = await Promise.all([
      prisma.store.count(),
      prisma.store.count({ where: { isActive: true } }),
      prisma.store.count({ where: { subscriptionStatus: 'trial' } }),
      prisma.store.count({ where: { subscriptionStatus: 'active' } }),
      prisma.user.count(),
      prisma.order.count(),
      prisma.store.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          name: true,
          code: true,
          isActive: true,
          plan: true,
          subscriptionStatus: true,
          createdAt: true
        }
      })
    ]);

    res.json({
      ok: true,
      time: new Date().toISOString(),
      counts: {
        totalStores,
        activeStores,
        inactiveStores: totalStores - activeStores,
        trialStores,
        paidStores,
        totalUsers,
        totalOrders
      },
      api: buildApiMetricsSnapshot(),
      recentStores
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/platform/stores', async (req, res) => {
  if (!requirePlatformAdmin(req, res)) return;
  const search = String(req.query.q || '').trim();
  try {
    const stores = await prisma.store.findMany({
      where: search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } }
        ]
      } : {},
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            users: true,
            products: true,
            orders: true,
            integrations: true
          }
        }
      }
    });
    res.json(stores);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/platform/stores/:id', async (req, res) => {
  if (!requirePlatformAdmin(req, res)) return;
  const allowedPlans = ['trial', 'starter', 'pro', 'enterprise'];
  const allowedStatuses = ['trial', 'active', 'past_due', 'suspended', 'cancelled'];
  const data = {};

  if (req.body?.isActive !== undefined) data.isActive = Boolean(req.body.isActive);
  if (req.body?.plan !== undefined) {
    if (!allowedPlans.includes(req.body.plan)) {
      return res.status(400).json({ error: 'Gói dịch vụ không hợp lệ' });
    }
    data.plan = req.body.plan;
  }
  if (req.body?.subscriptionStatus !== undefined) {
    if (!allowedStatuses.includes(req.body.subscriptionStatus)) {
      return res.status(400).json({ error: 'Trạng thái thuê bao không hợp lệ' });
    }
    data.subscriptionStatus = req.body.subscriptionStatus;
  }
  if (req.body?.subscriptionExpiresAt !== undefined) {
    data.subscriptionExpiresAt = req.body.subscriptionExpiresAt ? new Date(req.body.subscriptionExpiresAt) : null;
    if (data.subscriptionExpiresAt && Number.isNaN(data.subscriptionExpiresAt.getTime())) {
      return res.status(400).json({ error: 'Ngày hết hạn không hợp lệ' });
    }
  }
  if (req.body?.platformNotes !== undefined) {
    data.platformNotes = String(req.body.platformNotes || '').slice(0, 1000);
  }

  try {
    const store = await prisma.store.update({
      where: { id: req.params.id },
      data,
      include: {
        _count: {
          select: {
            users: true,
            products: true,
            orders: true,
            integrations: true
          }
        }
      }
    });
    res.json(store);
  } catch (err) {
    res.status(404).json({ error: 'Không tìm thấy store cần cập nhật' });
  }
});

app.get('/api/system/status', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const [
      users,
      products,
      orders,
      openShifts,
      inventoryForStatus,
      pendingOrders
    ] = await Promise.all([
      prisma.user.count({ where: { storeId: req.storeId } }),
      prisma.product.count({ where: { storeId: req.storeId } }),
      prisma.order.count({ where: { storeId: req.storeId } }),
      prisma.cashShift.count({ where: { storeId: req.storeId, status: 'open' } }),
      prisma.inventory.findMany({ where: { storeId: req.storeId }, select: { qty: true, minQty: true } }),
      prisma.order.count({ where: { storeId: req.storeId, status: 'pending' } })
    ]);
    const lowStockItems = inventoryForStatus.filter((item) => item.qty <= item.minQty).length;

    res.json({
      ok: true,
      time: new Date().toISOString(),
      storeId: req.storeId,
      counts: {
        users,
        products,
        orders,
        openShifts,
        lowStockItems,
        pendingOrders
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/integrations/status', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const storeId = req.storeId;
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: {
        bankId: true,
        bankAccountNo: true,
        bankAccountName: true
      }
    });
    const integrations = await getStoreIntegrationMap(storeId);
    const payos = serializeIntegration('payos', integrations.payos);
    const einvoice = serializeIntegration('einvoice', integrations.einvoice);
    const grabfood = serializeIntegration('grabfood', integrations.grabfood);
    const shopeefood = serializeIntegration('shopeefood', integrations.shopeefood);
    const webOrder = serializeIntegration('web_order', integrations.web_order);

    res.json({
      ok: true,
      time: new Date().toISOString(),
      payments: {
        vietQr: {
          configured: Boolean(store?.bankId && store?.bankAccountNo),
          bankId: store?.bankId || null,
          hasAccountNo: Boolean(store?.bankAccountNo),
          hasAccountName: Boolean(store?.bankAccountName)
        },
        webhook: {
          provider: 'payos',
          configured: payos.isEnabled && payos.secretsConfigured.clientId && payos.secretsConfigured.apiKey && payos.secretsConfigured.checksumKey,
          protected: Boolean(payos.secretsConfigured.webhookSecret),
          scopedByStoreCode: true,
          source: payos.updatedAt ? 'store' : 'not_configured'
        },
        simulation: {
          enabled: !IS_PRODUCTION
        }
      },
      invoice: {
        provider: einvoice.config.providerName || null,
        configured: einvoice.isEnabled && hasText(einvoice.config.providerName) && hasText(einvoice.config.apiUrl) && einvoice.secretsConfigured.apiKey,
        needsRealProviderContract: true
      },
      delivery: {
        grabFood: {
          configured: grabfood.isEnabled && hasText(grabfood.config.merchantId) && grabfood.secretsConfigured.apiKey
        },
        shopeeFood: {
          configured: shopeefood.isEnabled && hasText(shopeefood.config.merchantId) && shopeefood.secretsConfigured.apiKey
        },
        webOrder: {
          configured: webOrder.isEnabled && webOrder.secretsConfigured.webhookSecret
        }
      },
      printer: {
        lanEscpos: true,
        browserFallback: true,
        deviceConfigScope: 'this-browser'
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/integrations/settings', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const records = await getStoreIntegrationMap(req.storeId);
    res.json({
      ok: true,
      integrations: Object.keys(INTEGRATION_DEFS).reduce((acc, provider) => {
        acc[provider] = serializeIntegration(provider, records[provider]);
        return acc;
      }, {})
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.put('/api/integrations/settings/:provider', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const provider = req.params.provider;
  const def = INTEGRATION_DEFS[provider];
  if (!def) {
    return res.status(404).json({ error: 'Nhà cung cấp tích hợp không hợp lệ' });
  }

  try {
    const existing = await getStoreIntegrationRecord(req.storeId, provider);
    const existingSecrets = decryptIntegrationSecrets(existing?.secrets);
    const incomingConfig = pickAllowedFields(req.body?.config || {}, def.configFields);
    const incomingSecrets = pickAllowedFields(req.body?.secrets || {}, def.secretFields);
    const clearSecretFields = Array.isArray(req.body?.clearSecretFields)
      ? req.body.clearSecretFields.filter((field) => def.secretFields.includes(field))
      : [];

    const nextSecrets = { ...existingSecrets };
    for (const field of clearSecretFields) {
      delete nextSecrets[field];
    }
    for (const [field, value] of Object.entries(incomingSecrets)) {
      if (hasText(value)) nextSecrets[field] = String(value).trim();
    }

    const record = await prisma.storeIntegration.upsert({
      where: { storeId_provider: { storeId: req.storeId, provider } },
      update: {
        isEnabled: Boolean(req.body?.isEnabled),
        category: def.category,
        config: JSON.stringify({ ...parseIntegrationConfig(existing?.config), ...incomingConfig }),
        secrets: encryptIntegrationSecrets(nextSecrets)
      },
      create: {
        storeId: req.storeId,
        provider,
        category: def.category,
        isEnabled: Boolean(req.body?.isEnabled),
        config: JSON.stringify(incomingConfig),
        secrets: encryptIntegrationSecrets(nextSecrets)
      }
    });

    await writeAuditLog(req, 'update', 'storeIntegration', record.id, {
      provider,
      isEnabled: record.isEnabled,
      configFields: Object.keys(incomingConfig),
      secretFieldsUpdated: Object.keys(incomingSecrets).filter((field) => hasText(incomingSecrets[field])),
      secretFieldsCleared: clearSecretFields
    });

    res.json({ ok: true, integration: serializeIntegration(provider, record) });
  } catch (err) {
    res.status(500).json({ error: 'Không thể lưu cấu hình tích hợp: ' + err.message });
  }
});

app.get('/api/backup/export', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const storeId = req.storeId;
    const [
      store,
      users,
      products,
      tables,
      inventory,
      suppliers,
      stockTransactions,
      customers,
      vouchers,
      orders,
      returns,
      heldOrders,
      promotions,
      attendances,
      cashShifts,
      integrations,
      auditLogs
    ] = await Promise.all([
      prisma.store.findUnique({ where: { id: storeId } }),
      prisma.user.findMany({ where: { storeId }, orderBy: { name: 'asc' } }),
      prisma.product.findMany({ where: { storeId }, include: { recipes: true }, orderBy: { name: 'asc' } }),
      prisma.table.findMany({ where: { storeId }, orderBy: { name: 'asc' } }),
      prisma.inventory.findMany({ where: { storeId }, orderBy: { name: 'asc' } }),
      prisma.supplier.findMany({ where: { storeId }, orderBy: { name: 'asc' } }),
      prisma.stockTransaction.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' }, take: 5000 }),
      prisma.customer.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' } }),
      prisma.voucher.findMany({ where: { storeId }, orderBy: { code: 'asc' } }),
      prisma.order.findMany({ where: { storeId }, include: { items: true, payments: true }, orderBy: { timestamp: 'desc' }, take: 5000 }),
      prisma.returnOrder.findMany({ where: { storeId }, include: { items: true }, orderBy: { createdAt: 'desc' }, take: 2000 }),
      prisma.heldOrder.findMany({ where: { storeId }, include: { items: true }, orderBy: { createdAt: 'desc' } }),
      prisma.promotion.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' } }),
      prisma.attendance.findMany({ where: { storeId }, orderBy: { clockIn: 'desc' }, take: 5000 }),
      prisma.cashShift.findMany({ where: { storeId }, orderBy: { openedAt: 'desc' }, take: 5000 }),
      prisma.storeIntegration.findMany({ where: { storeId }, orderBy: { provider: 'asc' } }),
      prisma.auditLog.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' }, take: 5000 })
    ]);

    const safeUsers = users.map(sanitizeUser);
    const payload = {
      exportedAt: new Date().toISOString(),
      storeId,
      version: '1.0',
      store,
      users: safeUsers,
      products,
      tables,
      inventory,
      suppliers,
      stockTransactions,
      customers,
      vouchers,
      orders,
      returns,
      heldOrders,
      promotions,
      attendances,
      cashShifts,
      integrations: integrations.map((record) => serializeIntegration(record.provider, record)),
      auditLogs
    };

    await writeAuditLog(req, 'export', 'backup', storeId, {
      orders: orders.length,
      products: products.length,
      inventory: inventory.length
    });

    res.setHeader('Content-Disposition', `attachment; filename="manager-coffee-backup-${store?.code || storeId}-${Date.now()}.json"`);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/backup/restore-catalog', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { backup, confirmStoreCode, dryRun = false } = req.body || {};

  if (!backup || typeof backup !== 'object') {
    return res.status(400).json({ error: 'Thiếu dữ liệu backup hợp lệ để khôi phục' });
  }

  try {
    const storeId = req.storeId;
    const currentStore = await prisma.store.findUnique({ where: { id: storeId } });
    if (!currentStore) return res.status(404).json({ error: 'Cửa hàng không tồn tại' });
    if (confirmStoreCode !== currentStore.code) {
      return res.status(400).json({ error: `Để khôi phục catalog, confirmStoreCode phải đúng bằng "${currentStore.code}"` });
    }

    const products = safeArray(backup.products);
    const tables = safeArray(backup.tables);
    const inventory = safeArray(backup.inventory);
    const suppliers = safeArray(backup.suppliers);
    const vouchers = safeArray(backup.vouchers);
    const promotions = safeArray(backup.promotions);
    const summary = {
      products: products.length,
      tables: tables.length,
      inventory: inventory.length,
      suppliers: suppliers.length,
      vouchers: vouchers.length,
      promotions: promotions.length,
      recipes: products.reduce((sum, product) => sum + safeArray(product.recipes).length, 0)
    };

    if (dryRun) {
      return res.json({ ok: true, dryRun: true, wouldRestore: summary });
    }

    await prisma.$transaction(async (tx) => {
      const existingProducts = await tx.product.findMany({
        where: { storeId },
        select: { id: true }
      });
      const existingProductIds = existingProducts.map((product) => product.id);

      if (existingProductIds.length > 0) {
        await tx.recipeItem.deleteMany({ where: { productId: { in: existingProductIds } } });
      }
      await tx.promotion.deleteMany({ where: { storeId } });
      await tx.voucher.deleteMany({ where: { storeId } });
      await tx.table.deleteMany({ where: { storeId } });
      await tx.stockTransaction.deleteMany({ where: { storeId } });
      await tx.product.deleteMany({ where: { storeId } });
      await tx.inventory.deleteMany({ where: { storeId } });
      await tx.supplier.deleteMany({ where: { storeId } });

      const sourceStore = backup.store || {};
      await tx.store.update({
        where: { id: storeId },
        data: {
          name: sourceStore.name || currentStore.name,
          address: sourceStore.address ?? currentStore.address,
          phone: sourceStore.phone ?? currentStore.phone,
          logo: sourceStore.logo ?? currentStore.logo,
          vatRate: Number.isFinite(Number(sourceStore.vatRate)) ? Number(sourceStore.vatRate) : currentStore.vatRate,
          pointsRate: Number.isFinite(Number(sourceStore.pointsRate)) ? Number(sourceStore.pointsRate) : currentStore.pointsRate,
          currency: sourceStore.currency || currentStore.currency,
          printHeader: sourceStore.printHeader ?? currentStore.printHeader,
          printFooter: sourceStore.printFooter ?? currentStore.printFooter,
          bankId: sourceStore.bankId ?? currentStore.bankId,
          bankAccountNo: sourceStore.bankAccountNo ?? currentStore.bankAccountNo,
          bankAccountName: sourceStore.bankAccountName ?? currentStore.bankAccountName
        }
      });

      if (tables.length > 0) {
        await tx.table.createMany({
          data: tables.map((table) => ({
            id: table.id || undefined,
            storeId,
            name: table.name || 'Bàn',
            zone: table.zone || 'Khu vực chính',
            capacity: Number(table.capacity) || 2,
            status: table.status || 'available',
            occupiedSince: table.occupiedSince || null
          }))
        });
      }

      if (suppliers.length > 0) {
        await tx.supplier.createMany({
          data: suppliers.map((supplier) => ({
            id: supplier.id || undefined,
            storeId,
            name: supplier.name || 'Nhà cung cấp',
            phone: supplier.phone || null,
            email: supplier.email || null,
            address: supplier.address || null,
            createdAt: nullableDate(supplier.createdAt) || new Date()
          }))
        });
      }

      if (inventory.length > 0) {
        await tx.inventory.createMany({
          data: inventory.map((item) => ({
            id: item.id || undefined,
            storeId,
            name: item.name || 'Nguyên liệu',
            unit: item.unit || 'đơn vị',
            qty: Number(item.qty) || 0,
            minQty: Number(item.minQty) || 0,
            icon: item.icon || null
          }))
        });
      }

      if (products.length > 0) {
        await tx.product.createMany({
          data: products.map((product) => ({
            id: product.id || undefined,
            storeId,
            name: product.name || 'Sản phẩm',
            price: Number(product.price) || 0,
            category: product.category || 'Khác',
            description: product.description || null,
            image: product.image || null,
            popular: Boolean(product.popular),
            prepTime: product.prepTime || '5 phút',
            hidden: Boolean(product.hidden)
          }))
        });

        const recipeRows = products.flatMap((product) =>
          safeArray(product.recipes)
            .filter((recipe) => recipe.productId && recipe.inventoryId)
            .map((recipe) => ({
              id: recipe.id || undefined,
              productId: recipe.productId,
              inventoryId: recipe.inventoryId,
              qty: Number(recipe.qty) || 0
            }))
        );
        if (recipeRows.length > 0) {
          await tx.recipeItem.createMany({ data: recipeRows, skipDuplicates: true });
        }
      }

      if (vouchers.length > 0) {
        await tx.voucher.createMany({
          data: vouchers.map((voucher) => ({
            id: voucher.id || undefined,
            storeId,
            code: String(voucher.code || '').trim().toUpperCase(),
            type: voucher.type === 'FIXED' ? 'FIXED' : 'PERCENT',
            value: Number(voucher.value) || 0,
            minOrderValue: Number(voucher.minOrderValue) || 0,
            maxDiscount: voucher.maxDiscount === null || voucher.maxDiscount === undefined ? null : Number(voucher.maxDiscount),
            expiryDate: nullableDate(voucher.expiryDate),
            isActive: voucher.isActive !== false
          })).filter((voucher) => voucher.code)
        });
      }

      if (promotions.length > 0) {
        await tx.promotion.createMany({
          data: promotions.map((promotion) => ({
            id: promotion.id || undefined,
            storeId,
            name: promotion.name || 'Khuyến mãi',
            type: promotion.type || 'HAPPY_HOUR',
            conditions: typeof promotion.conditions === 'string' ? promotion.conditions : JSON.stringify(promotion.conditions || {}),
            rewards: typeof promotion.rewards === 'string' ? promotion.rewards : JSON.stringify(promotion.rewards || {}),
            startDate: nullableDate(promotion.startDate),
            endDate: nullableDate(promotion.endDate),
            isActive: promotion.isActive !== false,
            createdAt: nullableDate(promotion.createdAt) || new Date()
          }))
        });
      }

      await tx.auditLog.create({
        data: {
          storeId,
          userId: req.user?.userId || null,
          userName: req.user?.name || null,
          userRole: req.user?.role || null,
          action: 'restore',
          entity: 'backupCatalog',
          entityId: storeId,
          metadata: JSON.stringify(summary),
          ip: req.ip || null,
          userAgent: req.headers['user-agent'] || null
        }
      });
    }, { maxWait: 10000, timeout: 30000 });

    res.json({ ok: true, restored: summary });
  } catch (err) {
    res.status(500).json({ error: 'Không thể khôi phục catalog: ' + err.message });
  }
});

// Carts
app.get('/api/carts', (req, res) => {
  const storeId = req.storeId;
  if (!storeCarts[storeId]) storeCarts[storeId] = {};
  res.json(storeCarts[storeId]);
});

app.put('/api/carts/:id', (req, res) => {
  const storeId = req.storeId;
  const cartKey = req.params.id; 
  if (!storeCarts[storeId]) storeCarts[storeId] = {};
  storeCarts[storeId][cartKey] = req.body.cart;
  broadcast('cartSync', storeCarts[storeId], storeId);
  res.json({ success: true });
});

app.delete('/api/carts/:id', (req, res) => {
  const storeId = req.storeId;
  const cartKey = req.params.id;
  if (storeCarts[storeId]) {
    delete storeCarts[storeId][cartKey];
    broadcast('cartSync', storeCarts[storeId], storeId);
  }
  res.json({ success: true });
});

app.get('/api/audit-logs', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { limit = '100', action, entity, userId } = req.query;
  const take = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const where = {
    storeId: req.storeId,
    ...(action ? { action: String(action) } : {}),
    ...(entity ? { entity: String(entity) } : {}),
    ...(userId ? { userId: String(userId) } : {})
  };

  try {
    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take
    });
    res.json(logs.map((log) => ({
      ...log,
      metadata: log.metadata ? JSON.parse(log.metadata) : {}
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 1. Auth & Register
app.post('/api/auth/register-store', async (req, res) => {
  const { storeName, storeCode, adminName, adminEmail, adminPassword } = req.body;
  
  if (!storeName || !storeCode || !adminName || !adminEmail || !adminPassword) {
    return res.status(400).json({ error: 'Vui lòng cung cấp đầy đủ thông tin đăng ký.' });
  }
  
  // Kiểm tra định dạng storeCode (chỉ gồm chữ thường, số, dấu gạch nối)
  const codeRegex = /^[a-z0-9-]+$/;
  if (!codeRegex.test(storeCode)) {
    return res.status(400).json({ error: 'Mã cửa hàng chỉ được chứa chữ thường không dấu, số và dấu gạch nối (-).' });
  }
  
  try {
    // Kiểm tra xem mã cửa hàng đã tồn tại chưa
    const existingStore = await prisma.store.findUnique({
      where: { code: storeCode }
    });
    if (existingStore) {
      return res.status(400).json({ error: 'Mã cửa hàng này đã tồn tại trên hệ thống. Vui lòng chọn mã khác.' });
    }

    // Kiểm tra xem email đã được sử dụng chưa
    const existingEmail = await prisma.user.findUnique({
      where: { email: adminEmail }
    });
    if (existingEmail) {
      return res.status(400).json({ error: 'Email này đã được sử dụng. Vui lòng nhập email khác.' });
    }
    
    // Khởi tạo cửa hàng mới
    const store = await prisma.store.create({
      data: {
        name: storeName,
        code: storeCode,
        address: 'Địa chỉ quán của bạn',
        phone: 'Số điện thoại liên hệ',
        plan: 'trial',
        subscriptionStatus: 'trial'
      }
    });

    // Mã hóa mật khẩu của admin
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    
    // Tạo tài khoản Admin cho cửa hàng
    await prisma.user.create({
      data: {
        storeId: store.id,
        name: adminName,
        email: adminEmail,
        password: hashedPassword,
        role: 'admin',
        pin: null // Admin không sử dụng PIN
      }
    });
    
    res.json({ success: true, message: 'Đăng ký cửa hàng thành công!', storeCode });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi hệ thống khi đăng ký cửa hàng: ' + err.message });
  }
});

// Đăng nhập dành cho Admin bằng Email & Mật khẩu
app.post('/api/auth/login-admin', async (req, res) => {
  const { storeCode, email, password } = req.body;
  if (!storeCode || !email || !password) {
    return res.status(400).json({ error: 'Vui lòng điền đầy đủ Mã cửa hàng, Email và Mật khẩu.' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { store: true }
    });

    if (!user || user.role !== 'admin' || !user.password || user.store?.code !== storeCode) {
      return res.status(401).json({ error: 'Email hoặc mật khẩu không chính xác.' });
    }
    if (!user.store?.isActive) {
      return res.status(403).json({ error: 'Cửa hàng đang bị tạm khóa. Vui lòng liên hệ quản trị nền tảng.' });
    }

    // Kiểm tra mật khẩu mã hóa
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Email hoặc mật khẩu không chính xác.' });
    }

    // Tạo token JWT có thời hạn 30 ngày
    const token = jwt.sign(
      {
        userId: user.id,
        storeId: user.storeId,
        role: user.role,
        name: user.name,
        canViewReports: true,
        canRefund: true,
        canApplyDiscount: true,
        maxDiscountPct: 100
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.json({
      ...sanitizeUser(user),
      token
    });
  } catch (err) {
    return res.status(500).json({ error: 'Lỗi đăng nhập Admin: ' + err.message });
  }
});

// Đăng nhập POS / Nhân viên bằng Mã cửa hàng & Mã PIN
app.post('/api/auth/login', async (req, res) => {
  const { storeCode, pin } = req.body;
  
  if (!storeCode || !pin) {
    return res.status(400).json({ error: 'Vui lòng điền đầy đủ Mã cửa hàng và Mã PIN' });
  }
  
  try {
    const store = await prisma.store.findUnique({ where: { code: storeCode } });
    const user = store ? await findUserByPin(store.id, pin) : null;
    
    if (store && !store.isActive) {
      return res.status(403).json({ error: 'Cửa hàng đang bị tạm khóa. Vui lòng liên hệ quản trị nền tảng.' });
    }

    if (!user) {
      return res.status(401).json({ error: 'Mã cửa hàng hoặc mã PIN không chính xác' });
    }

    // Bảo mật: Tài khoản Admin bắt buộc phải đăng nhập bằng Email/Password, chặn đăng nhập bằng PIN
    if (user.role === 'admin') {
      return res.status(403).json({ error: 'Tài khoản Admin không được phép đăng nhập bằng mã PIN. Vui lòng sử dụng đăng nhập Admin.' });
    }
    
    // Tạo token JWT có thời hạn 30 ngày
    const token = jwt.sign(
      {
        userId: user.id,
        storeId: user.storeId,
        role: user.role,
        name: user.name,
        canViewReports: !!user.canViewReports,
        canRefund: !!user.canRefund,
        canApplyDiscount: !!user.canApplyDiscount,
        maxDiscountPct: user.maxDiscountPct ?? 0
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    return res.json({
      ...sanitizeUser(user),
      token
    });
  } catch (err) {
    return res.status(500).json({ error: 'Lỗi đăng nhập: ' + err.message });
  }
});

// 1.1 Users (Employee Management)
app.get('/api/users', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const users = await prisma.user.findMany({
    where: { storeId: req.storeId },
    orderBy: { name: 'asc' }
  });
  res.json(users.map(sanitizeUser));
});

app.post('/api/users', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { pin, password, ...body } = req.body || {};
    const cleanPin = String(pin || '').trim();
    if (cleanPin && !/^\d{4}$/.test(cleanPin)) {
      return res.status(400).json({ error: 'Mã PIN phải gồm đúng 4 chữ số' });
    }
    if (cleanPin && await isPinAlreadyUsed(req.storeId, cleanPin)) {
      return res.status(400).json({ error: 'Mã PIN đã tồn tại trong cửa hàng này' });
    }
    const user = await prisma.user.create({
      data: {
        ...body,
        storeId: req.storeId,
        pin: null,
        pinHash: cleanPin ? await bcrypt.hash(cleanPin, 10) : null,
        ...(password ? { password: await bcrypt.hash(password, 10) } : {})
      }
    });
    await writeAuditLog(req, 'create', 'user', user.id, { name: user.name, role: user.role });
    res.json(sanitizeUser(user));
  } catch (err) {
    res.status(400).json({ error: 'Mã PIN đã tồn tại hoặc lỗi dữ liệu' });
  }
});

app.put('/api/users/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { pin, password, ...body } = req.body || {};
    const data = { ...body };
    const cleanPin = typeof pin === 'string' ? pin.trim() : null;
    if (cleanPin) {
      if (!/^\d{4}$/.test(cleanPin)) {
        return res.status(400).json({ error: 'Mã PIN phải gồm đúng 4 chữ số' });
      }
      if (await isPinAlreadyUsed(req.storeId, cleanPin, req.params.id)) {
        return res.status(400).json({ error: 'Mã PIN đã tồn tại trong cửa hàng này' });
      }
      data.pin = null;
      data.pinHash = await bcrypt.hash(cleanPin, 10);
    }
    if (password) {
      data.password = await bcrypt.hash(password, 10);
    }
    const updated = await prisma.user.updateMany({
      where: { id: req.params.id, storeId: req.storeId },
      data
    });
    if (updated.count === 0) {
      return res.status(404).json({ error: 'Không tìm thấy nhân viên cần cập nhật' });
    }
    const user = await prisma.user.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    await writeAuditLog(req, 'update', 'user', user.id, { fields: Object.keys(data || {}) });
    res.json(sanitizeUser(user));
  } catch (err) {
    res.status(400).json({ error: 'Lỗi cập nhật' });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const deleted = await prisma.user.deleteMany({ where: { id: req.params.id, storeId: req.storeId } });
  if (deleted.count === 0) {
    return res.status(404).json({ error: 'Không tìm thấy nhân viên cần xóa' });
  }
  await writeAuditLog(req, 'delete', 'user', req.params.id);
  res.json({ success: true });
});

app.get('/api/users/salary-report', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { startDate, endDate } = req.query;
  const storeId = req.storeId;

  try {
    // 1. Get all users for this store
    const users = await prisma.user.findMany({
      where: { storeId },
      orderBy: { name: 'asc' }
    });

    // 2. Build attendance filters (VN timezone aware)
    const attendanceFilter = {
      storeId,
      clockOut: { not: null } // only count completed attendances
    };

    if (startDate && endDate) {
      attendanceFilter.clockIn = {
        gte: getVNStartOfDay(startDate),
        lte: getVNEndOfDay(endDate)
      };
    } else {
      // Default to this month (VN timezone)
      const vnNow = toVNDate();
      const firstDayStr = `${vnNow.getUTCFullYear()}-${String(vnNow.getUTCMonth() + 1).padStart(2, '0')}-01`;
      const todayStr = getVNDateStr();
      attendanceFilter.clockIn = {
        gte: getVNStartOfDay(firstDayStr),
        lte: getVNEndOfDay(todayStr)
      };
    }

    // 3. Fetch all completed attendances in this range
    const attendances = await prisma.attendance.findMany({
      where: attendanceFilter,
      orderBy: { clockIn: 'asc' }
    });

    // 4. Map user records to calculate salary & hours
    const report = users.map(user => {
      const userAttendances = attendances.filter(a => a.userId === user.id);
      
      const totalHours = userAttendances.reduce((sum, a) => sum + (a.totalHours || 0), 0);
      const shiftCount = userAttendances.length;
      const totalSalary = Math.round(totalHours * (user.hourlyRate || 25000));

      const safeUser = sanitizeUser(user);

      return {
        ...safeUser,
        shiftCount,
        totalHours: Number(totalHours.toFixed(2)),
        totalSalary,
        attendances: userAttendances.map(a => ({
          id: a.id,
          date: a.date,
          clockIn: a.clockIn,
          clockOut: a.clockOut,
          totalHours: a.totalHours ? Number(a.totalHours.toFixed(2)) : 0
        }))
      };
    });

    res.json(report);
  } catch (err) {
    console.error('Error generating salary report:', err);
    res.status(500).json({ error: err.message });
  }
});


// --- ATTENDANCE & SHIFT APIs ---

// 1. Quick Clock-in/out
app.post('/api/attendance/quick', async (req, res) => {
  const { pin, image } = req.body;
  try {
    const user = await findUserByPin(req.storeId, pin);
    if (!user) {
      return res.status(404).json({ error: 'Mã PIN không chính xác hoặc không thuộc chi nhánh này' });
    }

    const now = new Date();
    const dateStr = getVNDateStr(now);

    const activeAttendance = await prisma.attendance.findFirst({
      where: { storeId: req.storeId, userId: user.id, clockOut: null }
    });

    if (activeAttendance) {
      const clockOutTime = new Date();
      const diffMs = clockOutTime.getTime() - activeAttendance.clockIn.getTime();
      const totalHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
      
      const attendance = await prisma.attendance.update({
        where: { id: activeAttendance.id },
        data: {
          clockOut: clockOutTime,
          totalHours,
          imageOut: image || null
        }
      });
      return res.json({ action: 'clockOut', employeeName: user.name, totalHours, attendance });
    } else {
      const attendance = await prisma.attendance.create({
        data: {
          storeId: req.storeId,
          userId: user.id,
          clockIn: new Date(),
          date: dateStr,
          imageIn: image || null
        }
      });
      return res.json({ action: 'clockIn', employeeName: user.name, attendance });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Attendance logs for admin
app.get('/api/attendance/logs', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const logs = await prisma.attendance.findMany({
      where: { storeId: req.storeId },
      orderBy: { clockIn: 'desc' },
      include: { user: true }
    });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2.1 Add manual attendance (Admin)
app.post('/api/attendance', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { userId, date, clockIn, clockOut } = req.body;
  try {
    const user = await prisma.user.findFirst({ where: { id: userId, storeId: req.storeId } });
    if (!user) {
      return res.status(400).json({ error: 'Nhân viên không thuộc cửa hàng hiện tại' });
    }

    let totalHours = null;
    if (clockIn && clockOut) {
      const diffMs = new Date(clockOut).getTime() - new Date(clockIn).getTime();
      totalHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
    }
    const attendance = await prisma.attendance.create({
      data: {
        storeId: req.storeId,
        userId,
        date,
        clockIn: new Date(clockIn),
        clockOut: clockOut ? new Date(clockOut) : null,
        totalHours
      },
      include: { user: true }
    });
    await writeAuditLog(req, 'create', 'attendance', attendance.id, { userId, date });
    res.json(attendance);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 2.2 Edit manual attendance (Admin)
app.put('/api/attendance/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { userId, date, clockIn, clockOut } = req.body;
  try {
    const user = await prisma.user.findFirst({ where: { id: userId, storeId: req.storeId } });
    if (!user) {
      return res.status(400).json({ error: 'Nhân viên không thuộc cửa hàng hiện tại' });
    }

    let totalHours = null;
    if (clockIn && clockOut) {
      const diffMs = new Date(clockOut).getTime() - new Date(clockIn).getTime();
      totalHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
    }
    const updated = await prisma.attendance.updateMany({
      where: { id: req.params.id, storeId: req.storeId },
      data: {
        userId,
        date,
        clockIn: new Date(clockIn),
        clockOut: clockOut ? new Date(clockOut) : null,
        totalHours
      }
    });
    if (updated.count === 0) {
      return res.status(404).json({ error: 'Không tìm thấy bản ghi chấm công cần cập nhật' });
    }
    const attendance = await prisma.attendance.findFirst({
      where: { id: req.params.id, storeId: req.storeId },
      include: { user: true }
    });
    await writeAuditLog(req, 'update', 'attendance', attendance.id, { userId, date });
    res.json(attendance);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 2.3 Delete attendance (Admin)
app.delete('/api/attendance/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const deleted = await prisma.attendance.deleteMany({
      where: { id: req.params.id, storeId: req.storeId }
    });
    if (deleted.count === 0) {
      return res.status(404).json({ error: 'Không tìm thấy bản ghi chấm công cần xóa' });
    }
    await writeAuditLog(req, 'delete', 'attendance', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 3. Check active shift
app.get('/api/shifts/active/:userId', async (req, res) => {
  if (!canManageUserRecord(req.user, req.params.userId)) {
    return res.status(403).json({ error: 'Bạn không có quyền xem ca làm việc của nhân viên khác' });
  }

  try {
    const user = await prisma.user.findFirst({
      where: { id: req.params.userId, storeId: req.storeId }
    });
    if (!user) {
      return res.status(404).json({ error: 'Không tìm thấy nhân viên trong cửa hàng hiện tại' });
    }

    const activeShift = await prisma.cashShift.findFirst({
      where: { storeId: req.storeId, userId: req.params.userId, status: 'open' }
    });
    res.json(activeShift || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Open a shift
app.post('/api/shifts/open', async (req, res) => {
  const { userId, openingCash } = req.body;
  if (!canManageUserRecord(req.user, userId)) {
    return res.status(403).json({ error: 'Bạn không có quyền mở ca cho nhân viên khác' });
  }

  try {
    const user = await prisma.user.findFirst({ where: { id: userId, storeId: req.storeId } });
    if (!user) {
      return res.status(400).json({ error: 'Nhân viên không thuộc cửa hàng hiện tại' });
    }

    const existing = await prisma.cashShift.findFirst({
      where: { storeId: req.storeId, userId, status: 'open' }
    });
    if (existing) {
      return res.status(400).json({ error: 'Bạn đã có một ca làm việc đang mở' });
    }

    const shift = await prisma.cashShift.create({
      data: {
        storeId: req.storeId,
        userId,
        openingCash: Number(openingCash) || 0,
        cashSales: 0,
        expectedCash: Number(openingCash) || 0,
        status: 'open'
      }
    });
    await writeAuditLog(req, 'open', 'cashShift', shift.id, { userId, openingCash: shift.openingCash });
    res.json(shift);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 5. Close a shift
app.post('/api/shifts/close', async (req, res) => {
  const { shiftId, actualCash, notes } = req.body;
  try {
    const shift = await prisma.cashShift.findFirst({
      where: { id: shiftId, storeId: req.storeId }
    });
    if (!shift) {
      return res.status(404).json({ error: 'Không tìm thấy ca làm việc' });
    }
    if (!canManageUserRecord(req.user, shift.userId)) {
      return res.status(403).json({ error: 'Bạn không có quyền đóng ca của nhân viên khác' });
    }
    if (shift.status === 'closed') {
      return res.status(400).json({ error: 'Ca làm việc này đã được đóng trước đó' });
    }

    const actual = Number(actualCash) || 0;
    const discrepancy = actual - shift.expectedCash;

    await prisma.cashShift.updateMany({
      where: { id: shiftId, storeId: req.storeId },
      data: {
        closedAt: new Date(),
        actualCash: actual,
        discrepancy,
        notes,
        status: 'closed'
      }
    });
    const updatedShift = await prisma.cashShift.findFirst({
      where: { id: shiftId, storeId: req.storeId }
    });
    await writeAuditLog(req, 'close', 'cashShift', updatedShift.id, {
      userId: updatedShift.userId,
      expectedCash: updatedShift.expectedCash,
      actualCash: updatedShift.actualCash,
      discrepancy: updatedShift.discrepancy
    });
    res.json(updatedShift);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 6. Shift handover history logs
app.get('/api/shifts/logs', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const logs = await prisma.cashShift.findMany({
      where: { storeId: req.storeId },
      orderBy: { openedAt: 'desc' },
      include: { user: true }
    });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 1.2 Customers
app.get('/api/customers', async (req, res) => {
  const { phone } = req.query;
  if (phone) {
    const customer = await prisma.customer.findUnique({ where: { storeId_phone: { storeId: req.storeId, phone } } });
    return res.json(customer || null);
  }
  const customers = await prisma.customer.findMany({ where: { storeId: req.storeId } });
  res.json(customers);
});

app.post('/api/customers', async (req, res) => {
  try {
    const customer = await prisma.customer.create({ data: { ...req.body, storeId: req.storeId } });
    res.json(customer);
  } catch (err) {
    res.status(400).json({ error: 'Số điện thoại đã tồn tại' });
  }
});

// 1.3 Vouchers
app.get('/api/vouchers', async (req, res) => {
  const vouchers = await prisma.voucher.findMany({ where: { storeId: req.storeId } });
  res.json(vouchers);
});

app.post('/api/vouchers/validate', async (req, res) => {
  const { code, orderValue } = req.body;
  const voucher = await prisma.voucher.findUnique({ where: { storeId_code: { storeId: req.storeId, code } } });
  if (!voucher) return res.status(404).json({ error: 'Mã giảm giá không tồn tại' });
  if (!voucher.isActive) return res.status(400).json({ error: 'Mã giảm giá đã bị vô hiệu hóa' });
  if (voucher.expiryDate && new Date(voucher.expiryDate) < new Date()) {
    return res.status(400).json({ error: 'Mã giảm giá đã hết hạn' });
  }
  if (orderValue < voucher.minOrderValue) {
    return res.status(400).json({ error: `Đơn hàng tối thiểu ${voucher.minOrderValue.toLocaleString()}đ để áp dụng mã này` });
  }
  
  let discountAmount = 0;
  if (voucher.type === 'FIXED') {
    discountAmount = voucher.value;
  } else {
    discountAmount = (orderValue * voucher.value) / 100;
    if (voucher.maxDiscount && discountAmount > voucher.maxDiscount) {
      discountAmount = voucher.maxDiscount;
    }
  }
  res.json({ voucher, discountAmount });
});

// 2. Products
app.get('/api/products', async (req, res) => {
  const products = await prisma.product.findMany({ where: { storeId: req.storeId } });
  res.json(products);
});

app.post('/api/products', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const name = String(req.body?.name || '').trim();
  if (!name) {
    return res.status(400).json({ error: 'Tên sản phẩm không được để trống' });
  }
  const duplicate = await prisma.product.findFirst({
    where: { storeId: req.storeId, name: { equals: name, mode: 'insensitive' } }
  });
  if (duplicate) {
    return res.status(400).json({ error: 'Tên sản phẩm đã tồn tại trong cửa hàng này' });
  }
  const product = await prisma.product.create({ data: { ...req.body, name, storeId: req.storeId } });
  await writeAuditLog(req, 'create', 'product', product.id, { name: product.name, price: product.price });
  broadcast('productUpdated', { action: 'create', product }, req.storeId);
  res.json(product);
});

app.put('/api/products/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const name = req.body?.name !== undefined ? String(req.body.name || '').trim() : null;
  if (req.body?.name !== undefined && !name) {
    return res.status(400).json({ error: 'Tên sản phẩm không được để trống' });
  }
  if (name) {
    const duplicate = await prisma.product.findFirst({
      where: {
        storeId: req.storeId,
        id: { not: req.params.id },
        name: { equals: name, mode: 'insensitive' }
      }
    });
    if (duplicate) {
      return res.status(400).json({ error: 'Tên sản phẩm đã tồn tại trong cửa hàng này' });
    }
  }
  const updated = await prisma.product.updateMany({
    where: { id: req.params.id, storeId: req.storeId },
    data: { ...req.body, ...(name ? { name } : {}) }
  });
  if (updated.count === 0) {
    return res.status(404).json({ error: 'Không tìm thấy sản phẩm cần cập nhật' });
  }
  const product = await prisma.product.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
  await writeAuditLog(req, 'update', 'product', product.id, { fields: Object.keys(req.body || {}) });
  broadcast('productUpdated', { action: 'update', product }, req.storeId);
  res.json(product);
});

app.delete('/api/products/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const deleted = await prisma.product.deleteMany({ where: { id: req.params.id, storeId: req.storeId } });
  if (deleted.count === 0) {
    return res.status(404).json({ error: 'Không tìm thấy sản phẩm cần xóa' });
  }
  await writeAuditLog(req, 'delete', 'product', req.params.id);
  broadcast('productUpdated', { action: 'delete', id: req.params.id }, req.storeId);
  res.json({ success: true });
});

// 3. Tables
app.get('/api/tables', async (req, res) => {
  const tables = await prisma.table.findMany({ where: { storeId: req.storeId } });
  res.json(tables);
});

app.put('/api/tables/:id', async (req, res) => {
  const isStatusOnlyUpdate = Object.keys(req.body).every((key) => ['status', 'occupiedSince'].includes(key));
  if (!isStatusOnlyUpdate && !requireAdmin(req, res)) return;

  const updated = await prisma.table.updateMany({
    where: { id: req.params.id, storeId: req.storeId },
    data: {
      ...(req.body.status !== undefined ? { status: req.body.status } : {}),
      ...(req.body.occupiedSince !== undefined ? { occupiedSince: req.body.occupiedSince } : {}),
      ...(req.body.name !== undefined ? { name: req.body.name } : {}),
      ...(req.body.zone !== undefined ? { zone: req.body.zone } : {}),
      ...(req.body.capacity !== undefined ? { capacity: Number(req.body.capacity) || 2 } : {})
    }
  });
  if (updated.count === 0) {
    return res.status(404).json({ error: 'Không tìm thấy bàn cần cập nhật' });
  }
  const table = await prisma.table.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
  if (!isStatusOnlyUpdate) {
    await writeAuditLog(req, 'update', 'table', table.id, { fields: Object.keys(req.body || {}) });
  }
  broadcast('tableUpdated', table, req.storeId);
  res.json(table);
});

// 4. Orders & Checkout
app.get('/api/orders', async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { storeId: req.storeId },
    orderBy: { timestamp: 'desc' },
    include: { items: true, employee: true, customer: true }
  });
  res.json(orders);
});

// Helper để xác nhận thanh toán thành công cho đơn hàng pending
const completeOrderPayment = async (orderId, storeId) => {
  try {
    const updatedOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, storeId, status: 'pending' },
        include: { items: true, payments: true }
      });
      if (!order) return null;

      const paidOrder = await tx.order.update({
        where: { id: orderId },
        data: { status: 'paid' },
        include: { items: true, employee: true, payments: true, customer: true }
      });

      await applyPaidOrderEffects(tx, storeId, paidOrder);
      return paidOrder;
    }, { maxWait: 10000, timeout: 20000 });

    if (!updatedOrder) return null;

    if (updatedOrder.tableId) {
      const table = await prisma.table.findFirst({ where: { id: updatedOrder.tableId, storeId } });
      broadcast('tableUpdated', table, storeId);
    }

    // Đồng bộ thông tin qua WebSocket
    broadcast('orderCreated', updatedOrder, storeId);
    broadcast('inventoryUpdated', await prisma.inventory.findMany({ where: { storeId } }), storeId);

    return updatedOrder;
  } catch (err) {
    console.error('Lỗi khi hoàn tất thanh toán:', err);
    throw err;
  }
};

async function handleCheckout(req, res) {
  const { 
    tableId, tableName, cart, subtotal, vatAmount, total, paymentMethod,
    customerId, voucherCode, discountAmount, employeeId,
    orderDiscount, orderDiscountType, discountReason,
    payments,
    status, // "pending" hoặc "paid"
    usedPoints,
    clientRequestId: bodyClientRequestId
  } = req.body;
  const storeId = req.storeId;
  const orderStatus = status || 'paid';
  const clientRequestId = sanitizeClientRequestId(bodyClientRequestId || req.headers['idempotency-key']);

  if (clientRequestId) {
    const existingOrder = await prisma.order.findFirst({
      where: { storeId, clientRequestId },
      include: { items: true, employee: true, payments: true, customer: true }
    });
    if (existingOrder) {
      return res.json(existingOrder);
    }
  }

  if (!Array.isArray(cart) || cart.length === 0) {
    return res.status(400).json({ error: 'Giỏ hàng trống hoặc không hợp lệ' });
  }

  if (tableId) {
    const table = await prisma.table.findFirst({ where: { id: tableId, storeId } });
    if (!table) {
      return res.status(400).json({ error: 'Bàn không thuộc cửa hàng hiện tại' });
    }
  }

  if (customerId) {
    const customer = await prisma.customer.findFirst({ where: { id: customerId, storeId } });
    if (!customer) {
      return res.status(400).json({ error: 'Khách hàng không thuộc cửa hàng hiện tại' });
    }
  }

  if (employeeId) {
    const employee = await prisma.user.findFirst({ where: { id: employeeId, storeId } });
    if (!employee) {
      return res.status(400).json({ error: 'Nhân viên không thuộc cửa hàng hiện tại' });
    }
  }
  
  const date = new Date();
  const dateStr = getVNLocaleDateStr(date);
  const timeStr = getVNTimeStr(date);
  let reusedIdempotentOrder = false;
  
  const order = await prisma.$transaction(async (tx) => {
    if (clientRequestId) {
      const existingOrder = await tx.order.findFirst({
        where: { storeId, clientRequestId },
        include: { items: true, employee: true, payments: true, customer: true }
      });
      if (existingOrder) {
        reusedIdempotentOrder = true;
        return existingOrder;
      }
    }

    const orderNumber = await nextOrderNumber(tx, storeId);
    const createdOrder = await tx.order.create({
      data: {
        storeId,
        orderNumber,
        clientRequestId,
        tableId,
        tableName: tableName || 'Mang về',
        subtotal,
        vatAmount,
        total,
        paymentMethod: payments && payments.length > 1 ? 'mixed' : paymentMethod,
        status: orderStatus,
        time: timeStr,
        date: dateStr,
        customerId,
        voucherCode,
        discountAmount,
        employeeId,
        orderDiscount: orderDiscount || 0,
        orderDiscountType: orderDiscountType || null,
        discountReason: discountReason || null,
        usedPoints: usedPoints ? Number(usedPoints) : 0,
        items: {
          create: cart.map(item => ({
            productId: normalizeCartProductId(item),
            name: item.name,
            price: item.price,
            qty: item.qty,
            sugar: item.sugar,
            ice: item.ice,
            note: item.note,
            discount: item.discount || 0,
            discountType: item.discountType || null
          }))
        },
        ...(payments && payments.length > 0 ? {
          payments: {
            create: payments.map(p => ({
              method: p.method,
              amount: Number(p.amount) || 0,
              reference: p.reference || null
            }))
          }
        } : {})
      },
      include: { items: true, employee: true, payments: true, customer: true }
    });

    if (orderStatus === 'paid') {
      await applyPaidOrderEffects(tx, storeId, createdOrder, { payments });
    }

    return createdOrder;
  }, { maxWait: 10000, timeout: 20000 });

  if (reusedIdempotentOrder) {
    return res.json(order);
  }

  if (orderStatus === 'paid') {
    if (tableId) {
      const table = await prisma.table.findFirst({ where: { id: tableId, storeId } });
      broadcast('tableUpdated', table, storeId);
    }
    broadcast('orderCreated', order, storeId);
    broadcast('inventoryUpdated', await prisma.inventory.findMany({ where: { storeId } }), storeId);
  } else {
    broadcast('orderCreated', order, storeId);
  }

  await writeAuditLog(req, 'checkout', 'order', order.id, {
    orderNumber: order.orderNumber,
    clientRequestId: order.clientRequestId,
    status: order.status,
    total: order.total,
    paymentMethod: order.paymentMethod,
    itemCount: order.items?.length || 0
  });

  res.json(order);
}

app.post('/api/orders/checkout', (req, res, next) => {
  withStoreQueue(req.storeId, () => handleCheckout(req, res)).catch(next);
});

// API xác nhận thanh toán thủ công cho đơn hàng pending
app.put('/api/orders/:id/pay', async (req, res) => {
  const { id } = req.params;
  const storeId = req.storeId;
  try {
    const updated = await completeOrderPayment(id, storeId);
    if (!updated) {
      return res.status(404).json({ error: 'Không tìm thấy hóa đơn chờ thanh toán hoặc đã thanh toán trước đó' });
    }
    await writeAuditLog(req, 'pay', 'order', updated.id, {
      orderNumber: updated.orderNumber,
      total: updated.total,
      paymentMethod: updated.paymentMethod
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Inventory
const INITIAL_INVENTORY = [
  { name: 'Cà phê Arabica', unit: 'kg', qty: 25.5, minQty: 5, icon: '☕' },
  { name: 'Cà phê Robusta', unit: 'kg', qty: 12.0, minQty: 5, icon: '☕' },
  { name: 'Sữa tươi', unit: 'lít', qty: 45.0, minQty: 10, icon: '🥛' },
  { name: 'Sữa đặc', unit: 'lon', qty: 24.0, minQty: 10, icon: '🥫' },
  { name: 'Trà đen', unit: 'kg', qty: 8.5, minQty: 2, icon: '🍃' },
  { name: 'Đường cát', unit: 'kg', qty: 30.0, minQty: 10, icon: '🍚' },
  { name: 'Bột Matcha', unit: 'kg', qty: 2.5, minQty: 1, icon: '🍵' },
];

const RECIPE_SEEDS = {
  'Cà phê Đen': { 'Cà phê Arabica': 0.02 },
  'Cà phê Sữa': { 'Cà phê Arabica': 0.018, 'Sữa đặc': 0.03 },
  'Bạc xỉu': { 'Cà phê Robusta': 0.015, 'Sữa tươi': 0.1, 'Sữa đặc': 0.03 },
  'Cold Brew': { 'Cà phê Arabica': 0.025 },
  'Americano': { 'Cà phê Arabica': 0.018 },
  'Latte': { 'Cà phê Arabica': 0.018, 'Sữa tươi': 0.15 },
  'Trà Đào Cam Sả': { 'Trà đen': 0.005, 'Đường cát': 0.008 },
  'Trà Matcha Latte': { 'Bột Matcha': 0.005, 'Sữa tươi': 0.15 },
  'Trà Olong Sen': { 'Trà đen': 0.005, 'Đường cát': 0.01 },
  'Hồng Trà Trân Châu': { 'Trà đen': 0.005, 'Sữa tươi': 0.1, 'Đường cát': 0.01 },
  'Trà Vải': { 'Trà đen': 0.005 },
};

app.get('/api/inventory', async (req, res) => {
  const items = await prisma.inventory.findMany({ 
    where: { storeId: req.storeId },
    orderBy: { name: 'asc' }
  });
  res.json(items);
});

// Create new ingredient
app.post('/api/inventory', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const storeId = req.storeId;
  const { name, unit, qty, minQty, icon } = req.body;
  try {
    const item = await prisma.inventory.create({
      data: {
        storeId,
        name,
        unit,
        qty: Number(qty) || 0,
        minQty: Number(minQty) || 0,
        icon: icon || '☕'
      }
    });

    // Record initial import if qty > 0
    if (qty > 0) {
      await prisma.stockTransaction.create({
        data: {
          storeId,
          inventoryId: item.id,
          type: 'IMPORT',
          qtyChange: Number(qty),
          balance: Number(qty),
          note: 'Khởi tạo tồn kho ban đầu'
        }
      });
    }

    await writeAuditLog(req, 'create', 'inventory', item.id, { name: item.name, qty: item.qty, unit: item.unit });
    broadcast('inventoryUpdated', await prisma.inventory.findMany({ where: { storeId }, orderBy: { name: 'asc' } }), storeId);
    res.json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update ingredient
app.put('/api/inventory/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const storeId = req.storeId;
  const { id } = req.params;
  const { name, unit, minQty, icon } = req.body;
  try {
    const updated = await prisma.inventory.updateMany({
      where: { id, storeId },
      data: {
        name,
        unit,
        minQty: Number(minQty) || 0,
        icon
      }
    });
    if (updated.count === 0) {
      return res.status(404).json({ error: 'Không tìm thấy nguyên liệu cần cập nhật' });
    }
    const item = await prisma.inventory.findFirst({ where: { id, storeId } });
    await writeAuditLog(req, 'update', 'inventory', item.id, { fields: Object.keys(req.body || {}) });
    broadcast('inventoryUpdated', await prisma.inventory.findMany({ where: { storeId }, orderBy: { name: 'asc' } }), storeId);
    res.json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete ingredient
app.delete('/api/inventory/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const storeId = req.storeId;
  const { id } = req.params;
  try {
    const deleted = await prisma.inventory.deleteMany({
      where: { id, storeId }
    });
    if (deleted.count === 0) {
      return res.status(404).json({ error: 'Không tìm thấy nguyên liệu cần xóa' });
    }
    await writeAuditLog(req, 'delete', 'inventory', id);
    broadcast('inventoryUpdated', await prisma.inventory.findMany({ where: { storeId }, orderBy: { name: 'asc' } }), storeId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Import stock (Nhập hàng)
app.post('/api/inventory/import', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const storeId = req.storeId;
  const { inventoryId, qty, cost, supplierId, note } = req.body;
  try {
    const ingredient = await prisma.inventory.findFirst({ where: { id: inventoryId, storeId } });
    if (!ingredient) return res.status(404).json({ error: 'Nguyên liệu không tồn tại' });

    if (supplierId) {
      const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, storeId } });
      if (!supplier) return res.status(400).json({ error: 'Nhà cung cấp không thuộc cửa hàng hiện tại' });
    }

    const newQty = ingredient.qty + Number(qty);
    await prisma.inventory.updateMany({
      where: { id: inventoryId, storeId },
      data: { qty: newQty }
    });

    // Create Stock Transaction
    const transaction = await prisma.stockTransaction.create({
      data: {
        storeId,
        inventoryId,
        type: 'IMPORT',
        qtyChange: Number(qty),
        balance: newQty,
        cost: cost ? Number(cost) : null,
        supplierId: supplierId || null,
        note: note || 'Nhập hàng từ nhà cung cấp'
      },
      include: {
        inventory: true,
        supplier: true
      }
    });

    await writeAuditLog(req, 'import', 'inventory', inventoryId, {
      qty: Number(qty),
      cost: cost ? Number(cost) : null,
      supplierId: supplierId || null,
      transactionId: transaction.id
    });
    broadcast('inventoryUpdated', await prisma.inventory.findMany({ where: { storeId }, orderBy: { name: 'asc' } }), storeId);
    res.json(transaction);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Adjust stock (Kiểm kho)
app.post('/api/inventory/adjust', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const storeId = req.storeId;
  const { inventoryId, actualQty, note } = req.body;
  try {
    const ingredient = await prisma.inventory.findFirst({ where: { id: inventoryId, storeId } });
    if (!ingredient) return res.status(404).json({ error: 'Nguyên liệu không tồn tại' });

    const oldQty = ingredient.qty;
    const diff = Number(actualQty) - oldQty;

    await prisma.inventory.updateMany({
      where: { id: inventoryId, storeId },
      data: { qty: Number(actualQty) }
    });

    const transaction = await prisma.stockTransaction.create({
      data: {
        storeId,
        inventoryId,
        type: 'ADJUST',
        qtyChange: diff,
        balance: Number(actualQty),
        note: note || 'Cân đối kiểm kho'
      },
      include: {
        inventory: true
      }
    });

    await writeAuditLog(req, 'adjust', 'inventory', inventoryId, {
      oldQty,
      actualQty: Number(actualQty),
      diff,
      transactionId: transaction.id
    });
    broadcast('inventoryUpdated', await prisma.inventory.findMany({ where: { storeId }, orderBy: { name: 'asc' } }), storeId);
    res.json(transaction);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Reset Inventory to default seeded values
app.post('/api/inventory/reset', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const storeId = req.storeId;
  try {
    await prisma.stockTransaction.deleteMany({ where: { storeId } });
    await prisma.recipeItem.deleteMany({ where: { product: { storeId } } });
    await prisma.inventory.deleteMany({ where: { storeId } });

    const suppliersMap = {};
    const existingSuppliers = await prisma.supplier.findMany({ where: { storeId } });
    for (const supplier of existingSuppliers) {
      suppliersMap[supplier.name] = supplier.id;
    }

    const inventoryMap = {};
    for (const inv of INITIAL_INVENTORY) {
      const existingInv = await prisma.inventory.create({ data: { ...inv, storeId } });
      
      let supplierId = null;
      if (inv.name.includes('Sữa')) {
        supplierId = suppliersMap['Cty Sữa Cát Tường'] || null;
      } else if (inv.name.includes('Cà phê')) {
        supplierId = suppliersMap['Nhà phân phối Cà phê Hải Hà'] || null;
      } else {
        supplierId = suppliersMap['Chợ Đầu Mối Bình Điền (Đường & Trà)'] || null;
      }

      await prisma.stockTransaction.create({
        data: {
          storeId,
          inventoryId: existingInv.id,
          type: 'IMPORT',
          qtyChange: inv.qty,
          balance: inv.qty,
          cost: inv.name.includes('Cà phê') ? 140000 : inv.name.includes('Sữa tươi') ? 28000 : 15000,
          supplierId,
          note: 'Khởi tạo tồn kho ban đầu khi reset'
        }
      });
      inventoryMap[inv.name] = existingInv.id;
    }

    const products = await prisma.product.findMany({ where: { storeId } });
    const productsMap = {};
    for (const p of products) {
      productsMap[p.name] = p.id;
    }

    for (const [prodName, ingredients] of Object.entries(RECIPE_SEEDS)) {
      const productId = productsMap[prodName];
      if (!productId) continue;

      for (const [ingName, qtyValue] of Object.entries(ingredients)) {
        const inventoryId = inventoryMap[ingName];
        if (!inventoryId) continue;

        await prisma.recipeItem.create({
          data: {
            productId,
            inventoryId,
            qty: qtyValue
          }
        });
      }
    }

    await writeAuditLog(req, 'reset', 'inventory', null, { itemCount: INITIAL_INVENTORY.length });
    broadcast('inventoryUpdated', await prisma.inventory.findMany({ where: { storeId }, orderBy: { name: 'asc' } }), storeId);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

// Get stock transaction history
app.get('/api/inventory/transactions', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const storeId = req.storeId;
  try {
    const transactions = await prisma.stockTransaction.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
      include: {
        inventory: true,
        supplier: true
      }
    });
    res.json(transactions);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Suppliers APIs
app.get('/api/suppliers', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const storeId = req.storeId;
  try {
    const suppliers = await prisma.supplier.findMany({
      where: { storeId },
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { transactions: true }
        }
      }
    });
    res.json(suppliers);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/suppliers', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const storeId = req.storeId;
  const { name, phone, email, address } = req.body;
  try {
    const supplier = await prisma.supplier.create({
      data: {
        storeId,
        name,
        phone,
        email,
        address
      }
    });
    await writeAuditLog(req, 'create', 'supplier', supplier.id, { name: supplier.name });
    res.json(supplier);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/suppliers/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const storeId = req.storeId;
  const { id } = req.params;
  const { name, phone, email, address } = req.body;
  try {
    const updated = await prisma.supplier.updateMany({
      where: { id, storeId },
      data: {
        name,
        phone,
        email,
        address
      }
    });
    if (updated.count === 0) {
      return res.status(404).json({ error: 'Không tìm thấy nhà cung cấp cần cập nhật' });
    }
    const supplier = await prisma.supplier.findFirst({ where: { id, storeId } });
    await writeAuditLog(req, 'update', 'supplier', id, { fields: Object.keys(req.body || {}) });
    res.json(supplier);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/suppliers/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const storeId = req.storeId;
  const { id } = req.params;
  try {
    const deleted = await prisma.supplier.deleteMany({
      where: { id, storeId }
    });
    if (deleted.count === 0) {
      return res.status(404).json({ error: 'Không tìm thấy nhà cung cấp cần xóa' });
    }
    await writeAuditLog(req, 'delete', 'supplier', id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Product Recipe APIs
app.get('/api/products/:productId/recipe', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { productId } = req.params;
  try {
    const product = await prisma.product.findFirst({
      where: { id: productId, storeId: req.storeId }
    });
    if (!product) {
      return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    }

    const recipeItems = await prisma.recipeItem.findMany({
      where: { productId: product.id },
      include: {
        inventory: true
      }
    });
    res.json(recipeItems);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/products/:productId/recipe', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { productId } = req.params;
  const { ingredients } = req.body; // array of { inventoryId, qty }
  try {
    const product = await prisma.product.findFirst({
      where: { id: productId, storeId: req.storeId }
    });
    if (!product) {
      return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    }

    const cleanIngredients = Array.isArray(ingredients) ? ingredients : [];
    const inventoryIds = cleanIngredients.map((ing) => ing.inventoryId).filter(Boolean);
    const ownedInventory = await prisma.inventory.findMany({
      where: { id: { in: inventoryIds }, storeId: req.storeId },
      select: { id: true }
    });
    const ownedInventoryIds = new Set(ownedInventory.map((item) => item.id));
    const hasForeignInventory = inventoryIds.some((id) => !ownedInventoryIds.has(id));
    if (hasForeignInventory) {
      return res.status(400).json({ error: 'Công thức chứa nguyên liệu không thuộc cửa hàng hiện tại' });
    }

    // Delete existing recipe items
    await prisma.recipeItem.deleteMany({
      where: { productId: product.id }
    });

    // Create new recipe items
    const created = [];
    for (const ing of cleanIngredients) {
      if (Number(ing.qty) <= 0) continue;
      const item = await prisma.recipeItem.create({
        data: {
          productId: product.id,
          inventoryId: ing.inventoryId,
          qty: Number(ing.qty)
        },
        include: {
          inventory: true
        }
      });
      created.push(item);
    }
    await writeAuditLog(req, 'update', 'recipe', product.id, { ingredientCount: created.length });
    res.json(created);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 6. Dashboard Analytics
app.get('/api/dashboard', async (req, res) => {
  if (!requireReportAccess(req, res)) return;
  const storeId = req.storeId;
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const orders = await prisma.order.findMany({
      where: { 
        storeId, 
        status: 'paid',
        timestamp: { gte: thirtyDaysAgo }
      },
      include: { items: true },
      orderBy: { timestamp: 'desc' }
    });

    const now = new Date();
    const todayDateStr = getVNDateStr(now);
    const todayStartUTC = getVNStartOfDay(todayDateStr);
    const todayEndUTC = getVNEndOfDay(todayDateStr);

    // 1. Today Stats (compare by timestamp for timezone accuracy)
    const todayOrders = orders.filter(o => {
      const ts = new Date(o.timestamp);
      return ts >= todayStartUTC && ts <= todayEndUTC;
    });
    const todayRevenue = todayOrders.reduce((sum, o) => sum + o.total, 0);
    const todayOrdersCount = todayOrders.length;
    
    // Unique customers today
    const uniqueCustomerIds = new Set();
    let guestCount = 0;
    todayOrders.forEach(o => {
      if (o.customerId) uniqueCustomerIds.add(o.customerId);
      else guestCount++;
    });
    const todayCustomersCount = uniqueCustomerIds.size + guestCount;
    const avgOrderValue = todayOrdersCount > 0 ? Math.round(todayRevenue / todayOrdersCount) : 0;

    // 2. Weekly Revenue (Last 7 days, including today — using VN timezone)
    const weeklyRevenue = [];
    const DAY_NAMES = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dayDateStr = getVNDateStr(d);
      const vnD = toVNDate(d);
      const dayName = DAY_NAMES[vnD.getUTCDay()];
      const dayStart = getVNStartOfDay(dayDateStr);
      const dayEnd = getVNEndOfDay(dayDateStr);
      
      const dayOrders = orders.filter(o => {
        const ts = new Date(o.timestamp);
        return ts >= dayStart && ts <= dayEnd;
      });
      const dayRevenue = dayOrders.reduce((sum, o) => sum + o.total, 0);
      weeklyRevenue.push({ day: dayName, date: dayDateStr, revenue: dayRevenue });
    }

    // 3. This Week vs Last Week (growth)
    const oneDayMs = 24 * 60 * 60 * 1000;
    const sevenDaysAgo = new Date(now.getTime() - 7 * oneDayMs);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * oneDayMs);

    const thisWeekOrders = orders.filter(o => o.timestamp >= sevenDaysAgo);
    const thisWeekRevenue = thisWeekOrders.reduce((sum, o) => sum + o.total, 0);

    const lastWeekOrders = orders.filter(o => o.timestamp >= fourteenDaysAgo && o.timestamp < sevenDaysAgo);
    const lastWeekRevenue = lastWeekOrders.reduce((sum, o) => sum + o.total, 0);

    let growth = 0;
    if (lastWeekRevenue > 0) {
      growth = Math.round(((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100);
    } else if (thisWeekRevenue > 0) {
      growth = 100;
    }

    // 4. Top items
    const itemsMap = {};
    orders.forEach(o => {
      o.items.forEach(it => {
        if (!itemsMap[it.name]) {
          itemsMap[it.name] = { name: it.name, qty: 0, revenue: 0 };
        }
        itemsMap[it.name].qty += it.qty;
        itemsMap[it.name].revenue += it.price * it.qty;
      });
    });
    const topItems = Object.values(itemsMap)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    // 5. Recent orders
    const recentOrdersList = orders
      .slice(0, 5)
      .map(o => ({
        id: o.id,
        orderNumber: o.orderNumber,
        tableName: o.tableName,
        total: o.total,
        time: o.time,
        date: o.date,
        itemsCount: o.items.reduce((sum, i) => sum + i.qty, 0)
      }));

    // 6. Today Shifts
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayShiftsDb = await prisma.cashShift.findMany({
      where: {
        storeId,
        openedAt: { gte: todayStart }
      },
      include: {
        user: true
      },
      orderBy: {
        openedAt: 'asc'
      }
    });

    const shiftsList = todayShiftsDb.map((cs, idx) => {
      const startStr = new Date(cs.openedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      const endStr = cs.closedAt 
        ? new Date(cs.closedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        : 'Đang chạy';
      
      return {
        id: cs.id,
        name: `Ca ${idx + 1}`,
        staff: cs.user.name,
        start: startStr,
        end: endStr,
        orders: cs.status === 'open' ? 'Đang chạy' : 'Đã đóng',
        revenue: cs.cashSales
      };
    });

    res.json({
      today: {
        revenue: todayRevenue,
        orders: todayOrdersCount,
        customers: todayCustomersCount,
        avgOrderValue,
        target: 5000000 // 5M VNĐ target
      },
      thisWeek: {
        revenue: thisWeekRevenue,
        orders: thisWeekOrders.length,
        growth
      },
      weeklyRevenue,
      topItems,
      recentOrders: recentOrdersList,
      shifts: shiftsList
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 7. Customers CRM CRUD Extensions
app.put('/api/customers/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const storeId = req.storeId;
  const { id } = req.params;
  const { name, phone, points, tier } = req.body;
  try {
    const updated = await prisma.customer.updateMany({
      where: { id, storeId },
      data: {
        name,
        phone,
        points: Number(points) || 0,
        tier
      }
    });
    if (updated.count === 0) {
      return res.status(404).json({ error: 'Không tìm thấy khách hàng cần cập nhật' });
    }
    const customer = await prisma.customer.findFirst({ where: { id, storeId } });
    await writeAuditLog(req, 'update', 'customer', customer.id, { fields: Object.keys(req.body || {}) });
    res.json(customer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/customers/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const storeId = req.storeId;
  const { id } = req.params;
  try {
    const deleted = await prisma.customer.deleteMany({
      where: { id, storeId }
    });
    if (deleted.count === 0) {
      return res.status(404).json({ error: 'Không tìm thấy khách hàng cần xóa' });
    }
    await writeAuditLog(req, 'delete', 'customer', id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 8. Vouchers CRUD
app.post('/api/vouchers', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const storeId = req.storeId;
  const { code, type, value, minOrderValue, maxDiscount, expiryDate, isActive } = req.body;
  try {
    const voucher = await prisma.voucher.create({
      data: {
        storeId,
        code,
        type,
        value: Number(value) || 0,
        minOrderValue: Number(minOrderValue) || 0,
        maxDiscount: maxDiscount ? Number(maxDiscount) : null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        isActive: isActive !== false
      }
    });
    await writeAuditLog(req, 'create', 'voucher', voucher.id, { code: voucher.code, type: voucher.type, value: voucher.value });
    res.json(voucher);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/vouchers/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const storeId = req.storeId;
  const { id } = req.params;
  const { code, type, value, minOrderValue, maxDiscount, expiryDate, isActive } = req.body;
  try {
    const updated = await prisma.voucher.updateMany({
      where: { id, storeId },
      data: {
        code,
        type,
        value: Number(value) || 0,
        minOrderValue: Number(minOrderValue) || 0,
        maxDiscount: maxDiscount ? Number(maxDiscount) : null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        isActive: isActive !== false
      }
    });
    if (updated.count === 0) {
      return res.status(404).json({ error: 'Không tìm thấy voucher cần cập nhật' });
    }
    const voucher = await prisma.voucher.findFirst({ where: { id, storeId } });
    await writeAuditLog(req, 'update', 'voucher', voucher.id, { fields: Object.keys(req.body || {}) });
    res.json(voucher);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/vouchers/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const storeId = req.storeId;
  const { id } = req.params;
  try {
    const deleted = await prisma.voucher.deleteMany({
      where: { id, storeId }
    });
    if (deleted.count === 0) {
      return res.status(404).json({ error: 'Không tìm thấy voucher cần xóa' });
    }
    await writeAuditLog(req, 'delete', 'voucher', id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 9. Tables Configuration CRUD
app.post('/api/tables', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const storeId = req.storeId;
  const { name, zone, capacity } = req.body;
  try {
    const table = await prisma.table.create({
      data: {
        storeId,
        name,
        zone,
        capacity: Number(capacity) || 2
      }
    });
    await writeAuditLog(req, 'create', 'table', table.id, { name: table.name, zone: table.zone, capacity: table.capacity });
    broadcast('tableUpdated', table, storeId);
    res.json(table);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/tables/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const storeId = req.storeId;
  const { id } = req.params;
  try {
    const deleted = await prisma.table.deleteMany({
      where: { id, storeId }
    });
    if (deleted.count === 0) {
      return res.status(404).json({ error: 'Không tìm thấy bàn cần xóa' });
    }
    await writeAuditLog(req, 'delete', 'table', id);
    // In a real websocket setup, we can broadcast tableDeletion.
    // For now we just return success.
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ===== PHASE 1 APIs =====

// 10. Return / Refund
app.post('/api/orders/:orderId/return', async (req, res) => {
  if (!requireRefundAccess(req, res)) return;
  const storeId = req.storeId;
  const { orderId } = req.params;
  const { items, reason, refundMethod, employeeId } = req.body;
  const refundEmployeeId = employeeId || req.user?.userId || null;
  // items: [{ orderItemId, orderItemName, price, qty, reason? }]
  try {
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Vui lòng chọn ít nhất một món cần trả' });
    }

    const order = await prisma.order.findFirst({
      where: { id: orderId, storeId },
      include: { items: true }
    });
    if (!order) {
      return res.status(404).json({ error: 'Không tìm thấy hóa đơn' });
    }

    if (refundEmployeeId) {
      const employee = await prisma.user.findFirst({ where: { id: refundEmployeeId, storeId } });
      if (!employee) {
        return res.status(400).json({ error: 'Nhân viên không thuộc cửa hàng hiện tại' });
      }
    }

    for (const returnItem of items) {
      const qty = Number(returnItem.qty) || 0;
      if (qty <= 0) {
        return res.status(400).json({ error: 'Số lượng trả hàng không hợp lệ' });
      }

      const orderItem = returnItem.orderItemId
        ? order.items.find(oi => oi.id === returnItem.orderItemId)
        : order.items.find(oi => oi.name === returnItem.orderItemName);
      if (!orderItem) {
        return res.status(400).json({ error: `Món ${returnItem.orderItemName} không thuộc hóa đơn này` });
      }

      const remainingQty = orderItem.qty - (orderItem.returnedQty || 0);
      if (qty > remainingQty) {
        return res.status(400).json({ error: `Số lượng trả của ${returnItem.orderItemName} vượt quá số lượng còn lại` });
      }
    }

    const refundAmount = items.reduce((sum, it) => sum + (it.price * it.qty), 0);

    const returnOrder = await prisma.$transaction(async (tx) => {
      const returnNumber = await nextReturnNumber(tx, storeId);
      const createdReturn = await tx.returnOrder.create({
        data: {
          storeId,
          orderId,
          returnNumber,
          reason: reason || 'Khách trả hàng',
          refundAmount,
          refundMethod: refundMethod || 'cash',
          employeeId: refundEmployeeId,
          items: {
            create: items.map(it => ({
              orderItemName: it.orderItemName,
              price: it.price,
              qty: it.qty,
              reason: it.reason || null
            }))
          }
        },
        include: { items: true, order: true }
      });

      for (const returnItem of items) {
        const originalOrderItem = returnItem.orderItemId
          ? order.items.find(oi => oi.id === returnItem.orderItemId)
          : order.items.find(oi => oi.name === returnItem.orderItemName);
        if (!originalOrderItem) continue;

        await tx.orderItem.update({
          where: { id: originalOrderItem.id },
          data: { returnedQty: { increment: returnItem.qty } }
        });

        let product = originalOrderItem.productId
          ? await tx.product.findFirst({ where: { id: originalOrderItem.productId, storeId } })
          : null;
        if (!product) {
          product = await tx.product.findFirst({
            where: { storeId, name: originalOrderItem.name }
          });
        }
        if (!product) continue;

        const recipeItems = await tx.recipeItem.findMany({
          where: { productId: product.id },
          include: { inventory: true }
        });
        for (const recipe of recipeItems) {
          const restoreAmount = recipe.qty * returnItem.qty;
          const inventory = await tx.inventory.findFirst({
            where: { id: recipe.inventoryId, storeId }
          });
          if (!inventory) continue;

          const updatedInventory = await tx.inventory.update({
            where: { id: recipe.inventoryId },
            data: { qty: { increment: restoreAmount } }
          });
          await tx.stockTransaction.create({
            data: {
              storeId,
              inventoryId: recipe.inventoryId,
              type: 'ADJUST',
              qtyChange: restoreAmount,
              balance: updatedInventory.qty,
              note: `Hoàn kho - Trả hàng ${returnNumber} (${returnItem.orderItemName} x${returnItem.qty})`
            }
          });
        }
      }

      if ((refundMethod || 'cash') === 'cash' && refundEmployeeId) {
        const activeShift = await tx.cashShift.findFirst({
          where: { storeId, userId: refundEmployeeId, status: 'open' }
        });
        if (activeShift) {
          await tx.cashShift.update({
            where: { id: activeShift.id },
            data: {
              cashSales: { decrement: refundAmount },
              expectedCash: { decrement: refundAmount }
            }
          });
        }
      }

      return createdReturn;
    }, { maxWait: 10000, timeout: 20000 });

    await writeAuditLog(req, 'return', 'order', orderId, {
      returnOrderId: returnOrder.id,
      returnNumber: returnOrder.returnNumber,
      refundAmount,
      refundMethod: refundMethod || 'cash',
      itemCount: items.length
    });
    broadcast('inventoryUpdated', await prisma.inventory.findMany({ where: { storeId } }), storeId);
    res.json(returnOrder);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get return history
app.get('/api/returns', async (req, res) => {
  if (!requireRefundAccess(req, res)) return;
  try {
    const returns = await prisma.returnOrder.findMany({
      where: { storeId: req.storeId },
      orderBy: { createdAt: 'desc' },
      include: { items: true, order: true }
    });
    res.json(returns);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 11. Held Orders (Đơn tạm giữ)
app.get('/api/held-orders', async (req, res) => {
  try {
    const heldOrders = await prisma.heldOrder.findMany({
      where: { storeId: req.storeId },
      orderBy: { createdAt: 'desc' },
      include: { items: true }
    });
    res.json(heldOrders);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/held-orders', async (req, res) => {
  const storeId = req.storeId;
  const { tableId, tableName, note, employeeId, employeeName, customerId, items } = req.body;
  try {
    const heldOrder = await prisma.heldOrder.create({
      data: {
        storeId,
        tableId,
        tableName: tableName || 'Mang về',
        note,
        employeeId,
        employeeName,
        customerId,
        items: {
          create: items.map(item => ({
            productId: item.id || null,
            name: item.name,
            price: item.price,
            qty: item.qty,
            sugar: item.sugar || null,
            ice: item.ice || null,
            note: item.note || null
          }))
        }
      },
      include: { items: true }
    });
    res.json(heldOrder);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/held-orders/:id', async (req, res) => {
  const storeId = req.storeId;
  const { id } = req.params;
  try {
    await prisma.heldOrder.delete({
      where: { id, storeId }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 12. Store Settings
app.get('/api/store/settings', async (req, res) => {
  try {
    const store = await prisma.store.findUnique({
      where: { id: req.storeId }
    });
    if (!store) return res.status(404).json({ error: 'Cửa hàng không tồn tại' });
    res.json(store);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/store/settings', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { name, address, phone, logo, vatRate, pointsRate, currency, printHeader, printFooter, bankId, bankAccountNo, bankAccountName } = req.body;
  try {
    const store = await prisma.store.update({
      where: { id: req.storeId },
      data: {
        name, address, phone, logo,
        vatRate: vatRate !== undefined ? Number(vatRate) : undefined,
        pointsRate: pointsRate !== undefined ? Number(pointsRate) : undefined,
        currency, printHeader, printFooter,
        bankId, bankAccountNo, bankAccountName
      }
    });
    await writeAuditLog(req, 'update', 'storeSettings', req.storeId, {
      fields: Object.keys(req.body || {}).filter((key) => key !== 'bankAccountNo')
    });
    res.json(store);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 13. Search order by number (for return flow)
app.get('/api/orders/search/:orderNumber', async (req, res) => {
  try {
    const order = await prisma.order.findFirst({
      where: {
        storeId: req.storeId,
        orderNumber: req.params.orderNumber
      },
      include: { items: true, employee: true, customer: true, returnOrders: { include: { items: true } } }
    });
    if (!order) return res.status(404).json({ error: 'Không tìm thấy hóa đơn' });
    res.json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ===== PHASE 2 REPORT APIs =====

// 14. Báo cáo Nhân sự (Staff Analytics)
app.get('/api/reports/employees', async (req, res) => {
  if (!requireReportAccess(req, res)) return;
  const storeId = req.storeId;
  const { startDate, endDate } = req.query;
  try {
    const users = await prisma.user.findMany({
      where: { storeId },
      select: { id: true, name: true, role: true }
    });
    
    const dateFilter = {};
    if (startDate) dateFilter.gte = getVNStartOfDay(startDate);
    if (endDate) dateFilter.lte = getVNEndOfDay(endDate);

    const orders = await prisma.order.findMany({
      where: {
        storeId,
        status: 'paid',
        ...(startDate || endDate ? { timestamp: dateFilter } : {})
      },
      select: {
        employeeId: true,
        total: true
      }
    });

    // Group in memory in O(Orders) time
    const employeeSalesMap = {};
    orders.forEach(o => {
      if (!o.employeeId) return;
      if (!employeeSalesMap[o.employeeId]) {
        employeeSalesMap[o.employeeId] = { salesTotal: 0, ordersCount: 0 };
      }
      employeeSalesMap[o.employeeId].salesTotal += o.total;
      employeeSalesMap[o.employeeId].ordersCount += 1;
    });

    const reports = users.map(user => {
      const stats = employeeSalesMap[user.id] || { salesTotal: 0, ordersCount: 0 };
      return {
        id: user.id,
        name: user.name,
        role: user.role,
        salesTotal: stats.salesTotal,
        ordersCount: stats.ordersCount,
        avgOrderValue: stats.ordersCount > 0 ? Math.round(stats.salesTotal / stats.ordersCount) : 0
      };
    });

    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 15. Báo cáo Peak Hours (Time Analysis)
app.get('/api/reports/time-analysis', async (req, res) => {
  if (!requireReportAccess(req, res)) return;
  const storeId = req.storeId;
  const { startDate, endDate } = req.query;
  try {
    const dateFilter = {};
    if (startDate) dateFilter.gte = getVNStartOfDay(startDate);
    if (endDate) dateFilter.lte = getVNEndOfDay(endDate);

    const orders = await prisma.order.findMany({
      where: {
        storeId,
        status: 'paid',
        ...(startDate || endDate ? { timestamp: dateFilter } : {})
      },
      select: {
        total: true,
        timestamp: true
      }
    });

    // 1. Hourly Sales (0h - 23h)
    const hourlySales = Array.from({ length: 24 }, (_, i) => ({
      hour: `${i}h`,
      revenue: 0,
      orders: 0
    }));

    // 2. Day of Week Sales (T2, T3, T4, T5, T6, T7, CN)
    const DAYS_MAP = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const dailySales = DAYS_MAP.map(day => ({ day, revenue: 0, orders: 0 }));

    // 3. Monthly Sales
    const MONTHS_MAP = Array.from({ length: 12 }, (_, i) => `Tháng ${i + 1}`);
    const monthlySales = MONTHS_MAP.map(month => ({ month, revenue: 0, orders: 0 }));

    orders.forEach(o => {
      const d = new Date(o.timestamp);
      
      // Hour
      const hr = d.getHours();
      if (hr >= 0 && hr < 24) {
        hourlySales[hr].revenue += o.total;
        hourlySales[hr].orders += 1;
      }

      // Day of Week
      const dayIdx = d.getDay();
      dailySales[dayIdx].revenue += o.total;
      dailySales[dayIdx].orders += 1;

      // Month
      const m = d.getMonth();
      if (m >= 0 && m < 12) {
        monthlySales[m].revenue += o.total;
        monthlySales[m].orders += 1;
      }
    });

    res.json({
      hourlySales,
      dailySales,
      monthlySales
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 16. Báo cáo Lãi/Lỗ P&L (Profit & Loss)
app.get('/api/reports/profit-loss', async (req, res) => {
  if (!requireReportAccess(req, res)) return;
  const storeId = req.storeId;
  const { startDate, endDate } = req.query;
  try {
    const dateFilter = {};
    if (startDate) dateFilter.gte = getVNStartOfDay(startDate);
    if (endDate) dateFilter.lte = getVNEndOfDay(endDate);

    const orders = await prisma.order.findMany({
      where: {
        storeId,
        status: 'paid',
        ...(startDate || endDate ? { timestamp: dateFilter } : {})
      },
      include: {
        items: true
      }
    });

    // Fetch all products of the store with their recipe items
    const products = await prisma.product.findMany({
      where: { storeId },
      include: {
        recipes: true
      }
    });
    
    // Prefer productId for accuracy; keep name fallback for legacy orders created before productId existed.
    const productRecipesById = new Map();
    const productRecipesByName = new Map();
    products.forEach(p => {
      productRecipesById.set(p.id, p.recipes);
      if (!productRecipesByName.has(p.name)) {
        productRecipesByName.set(p.name, p.recipes);
      }
    });

    // Fetch all inventories to resolve units/names
    const inventories = await prisma.inventory.findMany({
      where: { storeId }
    });
    const inventoryMap = new Map(inventories.map(i => [i.id, i]));

    // Fetch all stock transactions of type IMPORT for this store in one query
    const stockTransactions = await prisma.stockTransaction.findMany({
      where: {
        storeId,
        type: 'IMPORT',
        cost: { not: null }
      }
    });

    // Group transactions by inventoryId to compute weighted average cost
    const transactionGroups = {};
    stockTransactions.forEach(tx => {
      if (!transactionGroups[tx.inventoryId]) {
        transactionGroups[tx.inventoryId] = [];
      }
      transactionGroups[tx.inventoryId].push(tx);
    });

    // Cache computed average cost per inventoryId
    const averageCostCache = {};
    const getWeightedAverageCostFast = (inventoryId) => {
      if (averageCostCache[inventoryId] !== undefined) {
        return averageCostCache[inventoryId];
      }

      const txs = transactionGroups[inventoryId] || [];
      if (txs.length === 0) {
        const ingredient = inventoryMap.get(inventoryId);
        if (ingredient) {
          if (ingredient.name.includes('Cà phê')) return 140000;
          if (ingredient.name.includes('Sữa tươi')) return 28000;
          if (ingredient.name.includes('Sữa đặc')) return 15000;
          if (ingredient.name.includes('Trà')) return 40000;
          if (ingredient.name.includes('Đường')) return 15000;
          if (ingredient.name.includes('Matcha')) return 250000;
        }
        return 20000;
      }
      const totalCost = txs.reduce((sum, tx) => sum + (tx.qtyChange * tx.cost), 0);
      const totalQty = txs.reduce((sum, tx) => sum + tx.qtyChange, 0);
      const cost = totalQty > 0 ? totalCost / totalQty : 20000;
      averageCostCache[inventoryId] = cost;
      return cost;
    };

    let totalRevenue = 0;
    let totalCogs = 0;
    const ingredientConsumption = {};

    for (const order of orders) {
      totalRevenue += order.total;

      for (const item of order.items) {
        const recipes = (item.productId ? productRecipesById.get(item.productId) : null)
          || productRecipesByName.get(item.name)
          || [];

        for (const recipe of recipes) {
          const avgCost = getWeightedAverageCostFast(recipe.inventoryId);
          const qtyConsumed = recipe.qty * item.qty;
          const costConsumed = qtyConsumed * avgCost;

          totalCogs += costConsumed;

          // Log ingredient consumption
          if (!ingredientConsumption[recipe.inventoryId]) {
            const ing = inventoryMap.get(recipe.inventoryId);
            ingredientConsumption[recipe.inventoryId] = {
              name: ing?.name || 'Nguyên liệu',
              unit: ing?.unit || 'đơn vị',
              qty: 0,
              cost: 0
            };
          }
          ingredientConsumption[recipe.inventoryId].qty += qtyConsumed;
          ingredientConsumption[recipe.inventoryId].cost += costConsumed;
        }
      }
    }

    const grossProfit = totalRevenue - totalCogs;
    const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    res.json({
      revenue: totalRevenue,
      cogs: totalCogs,
      grossProfit,
      profitMargin,
      ingredients: Object.values(ingredientConsumption)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- PROMOTION APIs (Phase 3) ---
app.get('/api/promotions', async (req, res) => {
  try {
    const promotions = await prisma.promotion.findMany({
      where: { storeId: req.storeId },
      orderBy: { createdAt: 'desc' }
    });
    res.json(promotions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/promotions', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const data = await validatePromotionPayload(req.storeId, req.body || {});
    const promotion = await prisma.promotion.create({
      data: {
        storeId: req.storeId,
        ...data
      }
    });
    await writeAuditLog(req, 'create', 'promotion', promotion.id, {
      name: promotion.name,
      type: promotion.type,
      isActive: promotion.isActive
    });
    res.json(promotion);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/promotions/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const existing = await prisma.promotion.findFirst({
      where: { id: req.params.id, storeId: req.storeId }
    });
    if (!existing) {
      return res.status(404).json({ error: 'Không tìm thấy chương trình khuyến mãi cần cập nhật' });
    }
    const merged = {
      name: req.body?.name !== undefined ? req.body.name : existing.name,
      type: req.body?.type !== undefined ? req.body.type : existing.type,
      conditions: req.body?.conditions !== undefined ? req.body.conditions : existing.conditions,
      rewards: req.body?.rewards !== undefined ? req.body.rewards : existing.rewards,
      startDate: req.body?.startDate !== undefined ? req.body.startDate : existing.startDate,
      endDate: req.body?.endDate !== undefined ? req.body.endDate : existing.endDate,
      isActive: req.body?.isActive !== undefined ? req.body.isActive : existing.isActive
    };
    const data = await validatePromotionPayload(req.storeId, merged, req.params.id);

    const updated = await prisma.promotion.updateMany({
      where: { id: req.params.id, storeId: req.storeId },
      data
    });
    if (updated.count === 0) {
      return res.status(404).json({ error: 'Không tìm thấy chương trình khuyến mãi cần cập nhật' });
    }
    const promotion = await prisma.promotion.findFirst({
      where: { id: req.params.id, storeId: req.storeId }
    });
    await writeAuditLog(req, 'update', 'promotion', promotion.id, {
      fields: Object.keys(req.body || {}),
      name: promotion.name,
      isActive: promotion.isActive
    });
    res.json(promotion);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/promotions/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const deleted = await prisma.promotion.deleteMany({
      where: { id: req.params.id, storeId: req.storeId }
    });
    if (deleted.count === 0) {
      return res.status(404).json({ error: 'Không tìm thấy chương trình khuyến mãi cần xóa' });
    }
    await writeAuditLog(req, 'delete', 'promotion', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- CUSTOMER HISTORY API (Phase 3) ---
app.get('/api/customers/:id/history', async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { storeId: req.storeId, customerId: req.params.id },
      orderBy: { timestamp: 'desc' },
      include: { items: true }
    });

    // Calculate top 3 frequent items
    const itemCounts = {};
    for (const order of orders) {
      for (const item of order.items) {
        if (!itemCounts[item.name]) {
          itemCounts[item.name] = { name: item.name, count: 0, price: item.price };
        }
        itemCounts[item.name].count += item.qty;
      }
    }

    const frequentItems = Object.values(itemCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    res.json({
      orders,
      frequentItems
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// --- KITCHEN DISPLAY SYSTEM (KDS) APIs (Phase 3) ---
app.get('/api/kitchen/orders', async (req, res) => {
  const storeId = req.storeId;
  try {
    const todayStart = getVNStartOfDay(getVNDateStr());
    const orders = await prisma.order.findMany({
      where: {
        storeId,
        prepStatus: { in: ['pending', 'preparing'] },
        status: { in: ['paid', 'pending'] },
        timestamp: { gte: todayStart }
      },
      orderBy: { timestamp: 'asc' },
      include: { items: true }
    });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/kitchen/orders/:id/status', async (req, res) => {
  const { id } = req.params;
  const { prepStatus } = req.body;
  const storeId = req.storeId;
  
  if (!['pending', 'preparing', 'completed'].includes(prepStatus)) {
    return res.status(400).json({ error: 'Trạng thái pha chế không hợp lệ' });
  }

  try {
    const updated = await prisma.order.updateMany({
      where: { id, storeId },
      data: { prepStatus }
    });
    if (updated.count === 0) {
      return res.status(404).json({ error: 'Không tìm thấy đơn hàng cần cập nhật trạng thái bếp' });
    }
    const order = await prisma.order.findFirst({
      where: { id, storeId },
      include: { items: true }
    });
    
    // Phát WebSocket đồng bộ cho tất cả các màn hình bếp và POS thu ngân
    broadcast('kitchenOrderUpdated', order, storeId);
    res.json(order);
  } catch (err) {
    res.status(400).json({ error: 'Không thể cập nhật trạng thái pha chế: ' + err.message });
  }
});


// --- PAYMENTS & DYNAMIC QR APIs (Phase 2) ---
function normalizeString(str) {
  if (!str) return '';
  return str.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

app.post('/api/payments/create-qr', async (req, res) => {
  const { amount, orderNumber } = req.body;
  const storeId = req.storeId;
  const numericAmount = Number(amount);
  const cleanOrderNumber = String(orderNumber || '').trim();
  
  if (!Number.isFinite(numericAmount) || numericAmount <= 0 || !cleanOrderNumber) {
    return res.status(400).json({ error: 'Thiếu số tiền hoặc mã đơn hàng' });
  }

  try {
    const store = await prisma.store.findUnique({
      where: { id: storeId }
    });
    
    if (!store) {
      return res.status(404).json({ error: 'Không tìm thấy cửa hàng' });
    }

    // Lấy thông tin tài khoản ngân hàng của store, nếu không có dùng mặc định từ Env
    const bankId = store.bankId || process.env.VITE_BANK_ID || 'MB';
    const bankAccountNo = store.bankAccountNo || process.env.VITE_ACCOUNT_NO || '';
    const bankAccountName = store.bankAccountName || process.env.VITE_ACCOUNT_NAME || '';

    if (!bankAccountNo) {
      return res.status(400).json({ error: 'Cửa hàng chưa thiết lập số tài khoản ngân hàng nhận tiền trong phần Cấu hình.' });
    }

    // Tạo mã nội dung chuyển khoản đặc trưng cho từng cửa hàng: storeCode-orderNumber
    const transferContent = `${store.code}-${cleanOrderNumber}`;

    // Tạo mã VietQR qua API miễn phí của VietQR.io (compact2: chỉ hiển thị QR và số tiền tối giản)
    const qrUrl = `https://img.vietqr.io/image/${bankId}-${bankAccountNo}-compact2.png?amount=${Math.round(numericAmount)}&addInfo=${encodeURIComponent(transferContent)}&accountName=${encodeURIComponent(bankAccountName)}`;

    res.json({
      qrUrl,
      bankId,
      bankAccountNo,
      bankAccountName,
      amount: numericAmount,
      orderNumber: cleanOrderNumber,
      transferContent
    });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi tạo mã thanh toán: ' + err.message });
  }
});

app.post('/api/payments/simulate-success', async (req, res) => {
  if (IS_PRODUCTION && !requireAdmin(req, res)) return;
  const { orderNumber } = req.body;
  const storeId = req.storeId;
  if (!orderNumber) return res.status(400).json({ error: 'Thiếu mã đơn hàng cần mô phỏng' });
  
  try {
    const pendingOrder = await prisma.order.findFirst({
      where: { storeId, orderNumber, status: 'pending' }
    });
    
    if (pendingOrder) {
      await completeOrderPayment(pendingOrder.id, pendingOrder.storeId);
      console.log(`[SIMULATE] Thanh toán thành công trong DB. Phát socket cho đơn hàng: ${orderNumber} của store ${storeId}`);
      broadcast('paymentSuccess', { orderNumber }, storeId);
    } else {
      console.log(`[SIMULATE] Không tìm thấy đơn hàng pending ${orderNumber} trong DB, phát socket thô.`);
      broadcast('paymentSuccess', { orderNumber }, storeId);
    }
    
    res.json({ success: true, message: 'Đã gửi tín hiệu thanh toán thành công' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/payments/payos-webhook', async (req, res) => {
  const payload = req.body;
  console.log('PayOS Webhook received payload:', payload);
  
  const data = payload.data;
  if (data) {
    const description = data.description;
    const webhookAmount = data.amount ?? data.transferAmount ?? data.paymentAmount;
    if (description) {
      try {
        const normalizedDesc = normalizeString(description);
        
        // Tìm tất cả cửa hàng để xác định store sở hữu mô tả này
        const stores = await prisma.store.findMany({ where: { isActive: true } });
        let matchedStore = null;
        let matchedOrderNumber = null;
        
        for (const store of stores) {
          const storeCodeNorm = normalizeString(store.code);
          // Kiểm tra xem mô tả chuyển khoản có bắt đầu bằng mã cửa hàng không
          if (normalizedDesc.startsWith(storeCodeNorm)) {
            matchedStore = store;
            matchedOrderNumber = normalizedDesc.substring(storeCodeNorm.length);
            break;
          }
        }
        
        if (matchedStore && matchedOrderNumber) {
          const payosIntegration = await getStoreIntegrationRecord(matchedStore.id, 'payos');
          const payosSecrets = decryptIntegrationSecrets(payosIntegration?.secrets);
          const expectedWebhookSecret = payosSecrets.webhookSecret || process.env.PAYMENT_WEBHOOK_SECRET;
          if (expectedWebhookSecret) {
            const providedSecret = req.headers['x-webhook-secret'] || req.headers['x-payos-secret'];
            if (providedSecret !== expectedWebhookSecret) {
              return res.status(401).json({ success: false, error: 'Webhook secret không hợp lệ' });
            }
          }

          const pendingOrders = await prisma.order.findMany({
            where: { storeId: matchedStore.id, status: 'pending' }
          });
          // Đối chiếu mã đơn hàng (đã loại bỏ ký tự đặc biệt)
          const pendingOrder = pendingOrders.find(o => normalizeString(o.orderNumber) === matchedOrderNumber);
          if (pendingOrder) {
            if (!amountsMatch(webhookAmount, pendingOrder.total)) {
              console.warn(`[PAYOS] Từ chối webhook sai số tiền cho đơn ${pendingOrder.orderNumber}. Webhook=${webhookAmount}, order=${pendingOrder.total}`);
              return res.json({ success: true, ignored: true, reason: 'amount_mismatch' });
            }
            const paidOrder = await completeOrderPayment(pendingOrder.id, pendingOrder.storeId);
            console.log(`[PAYOS] Đã đối soát đơn hàng ${pendingOrder.orderNumber} cho store ${matchedStore.name} thành công.`);
            if (paidOrder) {
              await prisma.auditLog.create({
                data: {
                  storeId: pendingOrder.storeId,
                  action: 'webhook_pay',
                  entity: 'order',
                  entityId: pendingOrder.id,
                  metadata: JSON.stringify({ orderNumber: pendingOrder.orderNumber, amount: webhookAmount ?? null, provider: 'payos' })
                }
              });
            }
            broadcast('paymentSuccess', { orderNumber: pendingOrder.orderNumber }, pendingOrder.storeId);
            return res.json({ success: true });
          }
        }
        
        if (!IS_PRODUCTION && process.env.PAYMENT_WEBHOOK_ALLOW_UNSCOPED_MATCH === '1') {
          const allPendingOrders = await prisma.order.findMany({
            where: { status: 'pending' }
          });
          const matchedFallback = allPendingOrders.find(o => {
            const oNorm = normalizeString(o.orderNumber);
            return normalizedDesc.includes(oNorm) && amountsMatch(webhookAmount, o.total);
          });
          if (matchedFallback) {
            await completeOrderPayment(matchedFallback.id, matchedFallback.storeId);
            console.log(`[PAYOS - Dev Fallback] Đã đối soát đơn hàng ${matchedFallback.orderNumber} của store ${matchedFallback.storeId} thành công.`);
            broadcast('paymentSuccess', { orderNumber: matchedFallback.orderNumber }, matchedFallback.storeId);
          }
        }
      } catch (err) {
        console.error('[PAYOS] Lỗi khi hoàn tất thanh toán từ webhook:', err);
      }
    }
  }
  res.json({ success: true });
});

app.post('/api/print', (req, res) => {
  const { ip, port = 9100, order, store } = req.body;
  if (!ip) {
    return res.status(400).json({ error: 'Thiếu địa chỉ IP máy in' });
  }
  const numericPort = Number(port);
  if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535) {
    return res.status(400).json({ error: 'Cổng máy in không hợp lệ' });
  }
  if (!isPrivateLanIp(ip)) {
    return res.status(400).json({ error: 'Chỉ cho phép kết nối máy in qua địa chỉ IP LAN/private' });
  }
  if (!order || !Array.isArray(order.items)) {
    return res.status(400).json({ error: 'Thiếu dữ liệu hóa đơn cần in' });
  }

  // Tiếng Việt không dấu helper
  function removeAccents(str) {
    if (!str) return '';
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, m => m === 'đ' ? 'd' : 'D');
  }

  try {
    const client = new net.Socket();
    let responded = false;
    const sendOnce = (status, body) => {
      if (responded) return;
      responded = true;
      res.status(status).json(body);
    };
    client.setTimeout(3000); // 3 seconds timeout

    client.connect(numericPort, ip, () => {
      // Send ESC/POS commands
      const commands = [];
      
      // Initialize printer
      commands.push(Buffer.from([0x1B, 0x40]));

      // Print Header (Bold, Centered, Double-height)
      commands.push(Buffer.from([0x1B, 0x61, 0x01])); // Align center
      commands.push(Buffer.from([0x1B, 0x45, 0x01])); // Bold on
      commands.push(Buffer.from([0x1D, 0x21, 0x11])); // Double text size
      commands.push(Buffer.from(removeAccents(store?.name || 'MANAGER COFFEE') + '\n\n'));
      
      // Normal size, normal text
      commands.push(Buffer.from([0x1D, 0x21, 0x00])); // Normal size
      commands.push(Buffer.from([0x1B, 0x45, 0x00])); // Bold off
      commands.push(Buffer.from(removeAccents(store?.address || 'Dia chi quan') + '\n'));
      commands.push(Buffer.from(removeAccents(`Tel: ${store?.phone || ''}`) + '\n'));
      commands.push(Buffer.from('================================\n'));
      
      // Order details
      commands.push(Buffer.from([0x1B, 0x45, 0x01])); // Bold on
      commands.push(Buffer.from('HOA DON THANH TOAN\n'));
      commands.push(Buffer.from([0x1B, 0x45, 0x00])); // Bold off
      commands.push(Buffer.from('--------------------------------\n'));
      
      // Left aligned details
      commands.push(Buffer.from([0x1B, 0x61, 0x00])); // Align left
      commands.push(Buffer.from(removeAccents(`Ma HD: ${order.orderNumber || order.id.substring(0,8)}`) + '\n'));
      commands.push(Buffer.from(removeAccents(`Ban:   ${order.tableName}`)+ '\n'));
      commands.push(Buffer.from(`Gio:   ${new Date().toLocaleTimeString('vi-VN')}\n`));
      commands.push(Buffer.from(`Ngay:  ${new Date().toLocaleDateString('vi-VN')}\n`));
      commands.push(Buffer.from(`Hinh thuc: ${order.paymentMethod === 'cash' ? 'Tien mat' : 'Chuyen khoan'}\n`));
      commands.push(Buffer.from('--------------------------------\n'));

      // Items Column Headers
      commands.push(Buffer.from('Mon                 SL   T.Tien\n'));
      commands.push(Buffer.from('--------------------------------\n'));

      // Items
      order.items.forEach(item => {
        let name = removeAccents(item.name);
        if (name.length > 18) name = name.substring(0, 17) + '.';
        const namePad = name.padEnd(20, ' ');
        const qtyStr = ('x' + item.qty).padStart(3, ' ');
        const totalVal = (item.price * item.qty).toLocaleString('vi-VN');
        const priceStr = totalVal.padStart(9, ' ');
        commands.push(Buffer.from(`${namePad}${qtyStr}${priceStr}\n`));
        if (item.sugar !== '100%' || item.ice !== 'Nhiều đá' || item.note) {
          const detail = [
            item.sugar !== '100%' && `Duong ${item.sugar}`,
            item.ice !== 'Nhiều đá' && removeAccents(item.ice),
            item.note && removeAccents(item.note)
          ].filter(Boolean).join(' - ');
          commands.push(Buffer.from(`  * ${detail.substring(0, 28)}\n`));
        }
      });
      
      commands.push(Buffer.from('--------------------------------\n'));
      
      // Summary
      const subtotalStr = order.subtotal.toLocaleString('vi-VN') + 'd';
      commands.push(Buffer.from(`Tam tinh: ${subtotalStr.padStart(22, ' ')}\n`));
      if (order.discountAmount > 0) {
        const discStr = '-' + order.discountAmount.toLocaleString('vi-VN') + 'd';
        commands.push(Buffer.from(`Giam gia: ${discStr.padStart(22, ' ')}\n`));
      }
      const vatStr = '+' + order.vatAmount.toLocaleString('vi-VN') + 'd';
      commands.push(Buffer.from(`VAT (8%): ${vatStr.padStart(22, ' ')}\n`));
      
      commands.push(Buffer.from('================================\n'));
      commands.push(Buffer.from([0x1B, 0x45, 0x01])); // Bold on
      const totalStr = order.total.toLocaleString('vi-VN') + 'd';
      commands.push(Buffer.from(`TONG CONG: ${totalStr.padStart(21, ' ')}\n`));
      commands.push(Buffer.from([0x1B, 0x45, 0x00])); // Bold off
      commands.push(Buffer.from('================================\n'));

      // Print Footer
      commands.push(Buffer.from([0x1B, 0x61, 0x01])); // Align center
      if (store?.printFooter) {
        commands.push(Buffer.from(removeAccents(store.printFooter) + '\n'));
      } else {
        commands.push(Buffer.from('Cam on quy khach!\nHen gap lai lan sau!\n'));
      }
      commands.push(Buffer.from((store?.code ? `${store.code}.vn` : 'espressolab.vn') + '\n\n\n\n\n')); // extra spacing
      
      // Cut paper command
      commands.push(Buffer.from([0x1D, 0x56, 0x41, 0x03]));

      // Write to TCP socket
      client.write(Buffer.concat(commands), () => {
        client.end();
        sendOnce(200, { success: true, message: 'Đã gửi lệnh in thành công' });
      });
    });

    client.on('error', (err) => {
      console.error('Lỗi kết nối máy in:', err.message);
      sendOnce(500, { error: `Không thể kết nối tới máy in tại IP ${ip}:${numericPort}. Vui lòng kiểm tra dây mạng và nguồn điện.` });
    });

    client.on('timeout', () => {
      client.destroy();
      sendOnce(500, { error: `Kết nối tới máy in tại IP ${ip}:${numericPort} bị quá hạn (Timeout).` });
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use((err, req, res, next) => {
  console.error('[API_ERROR]', err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({
    error: IS_PRODUCTION ? 'Lỗi hệ thống. Vui lòng thử lại sau.' : err.message,
    code: err.code || 'INTERNAL_ERROR'
  });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
