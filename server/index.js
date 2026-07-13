import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createAdapter as createPostgresAdapter } from '@socket.io/postgres-adapter';
import pg from 'pg';
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
app.disable('x-powered-by');
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || (IS_PRODUCTION ? 1 : 0)));
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});
const realtimeAdapterMode = process.env.REALTIME_ADAPTER || (IS_PRODUCTION ? 'postgres' : 'memory');
let realtimePool = null;

async function setupRealtimeAdapter() {
  if (realtimeAdapterMode !== 'postgres') {
    console.log('[REALTIME] Using in-memory adapter');
    return;
  }
  const connectionString = process.env.REALTIME_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Thiếu REALTIME_DATABASE_URL hoặc DATABASE_URL cho realtime adapter');

  realtimePool = new pg.Pool({
    connectionString,
    max: Math.max(2, Number(process.env.REALTIME_POOL_SIZE) || 4),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });
  realtimePool.on('error', (err) => console.error('[REALTIME_DB_ERROR]', err.message));
  await realtimePool.query('SELECT 1');
  io.adapter(createPostgresAdapter(realtimePool));
  console.log('[REALTIME] PostgreSQL adapter ready');
}

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
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  if (IS_PRODUCTION) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

const AUTH_WINDOW_MS = 10 * 60 * 1000;
const AUTH_BLOCK_MS = 15 * 60 * 1000;
const AUTH_MAX_FAILURES = 5;
const authAttemptBuckets = new Map();
const publicOrderBuckets = new Map();
const PUBLIC_ORDER_WINDOW_MS = 60 * 1000;
const PUBLIC_ORDER_MAX_REQUESTS = Math.max(5, Number(process.env.PUBLIC_ORDER_RATE_LIMIT) || 30);

function getAuthAttemptKey(req) {
  const identifier = [req.body?.storeCode, req.body?.email]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase())
    .join(':') || 'anonymous';
  return crypto.createHash('sha256')
    .update(`${req.path}|${req.ip}|${identifier}`)
    .digest('hex');
}

function pruneAuthAttemptBuckets(now) {
  if (authAttemptBuckets.size < 5000) return;
  for (const [key, bucket] of authAttemptBuckets.entries()) {
    if (bucket.blockedUntil <= now && now - bucket.windowStartedAt > AUTH_WINDOW_MS) {
      authAttemptBuckets.delete(key);
    }
  }
}

app.use((req, res, next) => {
  const protectedPaths = new Set([
    '/api/auth/login',
    '/api/auth/login-admin',
    '/api/platform/auth/login'
  ]);
  if (req.method !== 'POST' || !protectedPaths.has(req.path)) return next();

  const now = Date.now();
  pruneAuthAttemptBuckets(now);
  const key = getAuthAttemptKey(req);
  const bucket = authAttemptBuckets.get(key);
  if (bucket?.blockedUntil > now) {
    const retryAfterSec = Math.ceil((bucket.blockedUntil - now) / 1000);
    res.setHeader('Retry-After', String(retryAfterSec));
    return res.status(429).json({
      error: 'Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau.',
      retryAfterSec
    });
  }

  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      authAttemptBuckets.delete(key);
      return;
    }
    if (res.statusCode !== 401) return;

    const current = authAttemptBuckets.get(key);
    const withinWindow = current && now - current.windowStartedAt <= AUTH_WINDOW_MS;
    const failures = withinWindow ? current.failures + 1 : 1;
    authAttemptBuckets.set(key, {
      failures,
      windowStartedAt: withinWindow ? current.windowStartedAt : now,
      blockedUntil: failures >= AUTH_MAX_FAILURES ? now + AUTH_BLOCK_MS : 0
    });
  });
  next();
});

app.use('/api/public', (req, res, next) => {
  const now = Date.now();
  const token = String(req.query?.token || req.body?.token || req.path || '').slice(0, 256);
  const key = crypto.createHash('sha256').update(`${req.ip}|${token}`).digest('hex');
  const current = publicOrderBuckets.get(key);
  const bucket = current && now - current.startedAt < PUBLIC_ORDER_WINDOW_MS
    ? current
    : { startedAt: now, count: 0 };
  bucket.count += 1;
  publicOrderBuckets.set(key, bucket);

  if (publicOrderBuckets.size > 10000) {
    for (const [bucketKey, value] of publicOrderBuckets.entries()) {
      if (now - value.startedAt >= PUBLIC_ORDER_WINDOW_MS) publicOrderBuckets.delete(bucketKey);
    }
  }
  if (bucket.count > PUBLIC_ORDER_MAX_REQUESTS) {
    const retryAfterSec = Math.max(1, Math.ceil((PUBLIC_ORDER_WINDOW_MS - (now - bucket.startedAt)) / 1000));
    res.setHeader('Retry-After', String(retryAfterSec));
    return res.status(429).json({ error: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.' });
  }
  next();
});

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
const canApplyManualDiscount = (user) => isAdminUser(user) || user?.canApplyDiscount === true || (!IS_PRODUCTION && !user);
const canManageUserRecord = (user, userId) => isAdminUser(user) || user?.userId === userId;
const BCRYPT_HASH_RE = /^\$2[aby]\$\d{2}\$/;
const POINT_VALUE_VND = 1;
const PAYMENT_METHODS = new Set(['cash', 'card', 'transfer', 'momo', 'zalopay']);
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

function createStoreUserToken(user) {
  const admin = user.role === 'admin';
  return jwt.sign(
    {
      userId: user.id,
      storeId: user.storeId,
      role: user.role,
      name: user.name,
      canViewReports: admin || Boolean(user.canViewReports),
      canRefund: admin || Boolean(user.canRefund),
      canApplyDiscount: admin || Boolean(user.canApplyDiscount),
      maxDiscountPct: admin ? 100 : (user.maxDiscountPct ?? 0),
      authVersion: user.authVersion
    },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

const employeeSummarySelect = {
  id: true,
  storeId: true,
  name: true,
  role: true
};

const orderResponseInclude = {
  items: true,
  employee: { select: employeeSummarySelect },
  payments: true,
  customer: true,
  guestOrder: { select: { id: true, guestName: true } }
};

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

function businessError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  err.code = 'BUSINESS_RULE';
  return err;
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

function roundMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number);
}

function parsePositiveInt(value, fieldName) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${fieldName} phải là số nguyên lớn hơn 0`);
  }
  return number;
}

function parseWholeMoney(value, fieldName, { allowZero = true } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || !Number.isInteger(number) || number < 0 || (!allowZero && number === 0)) {
    throw businessError(`${fieldName} phải là số tiền nguyên ${allowZero ? 'không âm' : 'lớn hơn 0'}`);
  }
  return number;
}

function parsePositiveNumber(value, fieldName) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw businessError(`${fieldName} phải là số lớn hơn 0`);
  }
  return number;
}

function parseListLimit(value, fallback = 500, max = 1000) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function setNextCursor(res, rows, limit) {
  if (rows.length <= limit) return rows;
  const page = rows.slice(0, limit);
  res.setHeader('X-Next-Cursor', page[page.length - 1].id);
  return page;
}

function normalizeCustomerPhone(value) {
  const phone = String(value || '').trim().replace(/[\s.-]/g, '');
  if (!/^\+?\d{8,15}$/.test(phone)) throw businessError('Số điện thoại khách hàng không hợp lệ.');
  return phone;
}

function normalizeCustomerPatch(payload, { allowLoyalty = false, partial = false } = {}) {
  const data = {};
  if (!partial || payload?.name !== undefined) {
    const name = String(payload?.name || '').trim();
    if (!name) throw businessError('Tên khách hàng không được để trống.');
    data.name = name.slice(0, 100);
  }
  if (!partial || payload?.phone !== undefined) data.phone = normalizeCustomerPhone(payload?.phone);
  if (allowLoyalty && payload?.points !== undefined) {
    const points = Number(payload.points);
    if (!Number.isInteger(points) || points < 0 || points > 1000000000) throw businessError('Điểm khách hàng không hợp lệ.');
    data.points = points;
  }
  if (allowLoyalty && payload?.tier !== undefined) {
    const tier = String(payload.tier).trim().toUpperCase();
    if (!['SILVER', 'GOLD', 'DIAMOND'].includes(tier)) throw businessError('Hạng khách hàng không hợp lệ.');
    data.tier = tier;
  }
  return data;
}

function normalizeVoucherPayload(payload) {
  const code = String(payload?.code || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,32}$/.test(code)) {
    throw businessError('Mã voucher phải có 2-32 ký tự chữ, số, gạch dưới hoặc gạch nối');
  }
  const type = String(payload?.type || '').trim().toUpperCase();
  if (!['PERCENT', 'FIXED'].includes(type)) {
    throw businessError('Loại voucher không hợp lệ');
  }

  const rawValue = Number(payload?.value);
  const value = type === 'FIXED'
    ? parseWholeMoney(rawValue, 'Giá trị voucher', { allowZero: false })
    : rawValue;
  if (type === 'PERCENT' && (!Number.isFinite(value) || value <= 0 || value > 100)) {
    throw businessError('Phần trăm voucher phải lớn hơn 0 và không vượt quá 100');
  }

  const minOrderValue = parseWholeMoney(payload?.minOrderValue || 0, 'Giá trị đơn tối thiểu');
  const maxDiscount = payload?.maxDiscount === null || payload?.maxDiscount === undefined || payload?.maxDiscount === ''
    ? null
    : parseWholeMoney(payload.maxDiscount, 'Mức giảm tối đa');
  const expiryDate = payload?.expiryDate ? new Date(payload.expiryDate) : null;
  if (expiryDate && Number.isNaN(expiryDate.getTime())) {
    throw businessError('Ngày hết hạn voucher không hợp lệ');
  }

  return {
    code,
    type,
    value,
    minOrderValue,
    maxDiscount,
    expiryDate,
    isActive: payload?.isActive !== false
  };
}

function normalizeUserPayload(payload, { requireName = false } = {}) {
  const data = {};
  if (requireName || payload?.name !== undefined) {
    const name = String(payload?.name || '').trim();
    if (!name) throw businessError('Tên nhân viên không được để trống');
    data.name = name.slice(0, 100);
  }
  if (payload?.role !== undefined) {
    const role = String(payload.role).trim().toLowerCase();
    if (!['admin', 'staff'].includes(role)) throw businessError('Vai trò nhân viên không hợp lệ');
    data.role = role;
  }

  for (const field of ['canApplyDiscount', 'canRefund', 'canViewReports']) {
    if (payload?.[field] !== undefined) data[field] = Boolean(payload[field]);
  }
  if (payload?.maxDiscountPct !== undefined) {
    const pct = Number(payload.maxDiscountPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      throw businessError('Hạn mức giảm giá phải từ 0 đến 100%');
    }
    data.maxDiscountPct = pct;
  }
  if (payload?.hourlyRate !== undefined) {
    data.hourlyRate = parseWholeMoney(payload.hourlyRate, 'Lương theo giờ');
  }

  for (const [field, maxLength] of [
    ['phone', 30],
    ['address', 255],
    ['cccd', 30],
    ['dateOfBirth', 20],
    ['startDate', 20]
  ]) {
    if (payload?.[field] !== undefined) {
      data[field] = hasText(payload[field]) ? String(payload[field]).trim().slice(0, maxLength) : null;
    }
  }
  if (payload?.email !== undefined) {
    const email = String(payload.email || '').trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw businessError('Email không hợp lệ');
    }
    data.email = email || null;
  }
  return data;
}

function normalizePaymentMethod(method) {
  const clean = String(method || 'cash').trim().toLowerCase();
  if (!PAYMENT_METHODS.has(clean)) {
    throw new Error('Phương thức thanh toán không hợp lệ');
  }
  return clean;
}

function normalizePayments(payments, total) {
  if (!Array.isArray(payments) || payments.length === 0) return [];

  const cleanPayments = payments
    .map((payment) => ({
      method: normalizePaymentMethod(payment.method),
      amount: roundMoney(payment.amount),
      reference: hasText(payment.reference) ? String(payment.reference).trim().slice(0, 128) : null
    }))
    .filter((payment) => payment.amount > 0);

  if (cleanPayments.length === 0) return [];

  const paidTotal = cleanPayments.reduce((sum, payment) => sum + payment.amount, 0);
  if (Math.abs(paidTotal - total) > 1) {
    throw new Error('Tổng tiền theo các phương thức thanh toán không khớp với tổng hóa đơn');
  }

  return cleanPayments;
}

function getManualDiscountLimitPct(user) {
  if (isAdminUser(user) || (!IS_PRODUCTION && !user)) return 100;
  const pct = Number(user?.maxDiscountPct);
  if (!Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(100, pct));
}

function assertManualDiscountAllowed(req, amount, baseAmount, label) {
  if (amount <= 0) return;
  if (!canApplyManualDiscount(req.user)) {
    throw new Error(`Tài khoản của bạn không có quyền áp dụng ${label}`);
  }
  if (baseAmount <= 0) {
    throw new Error(`${label} không hợp lệ`);
  }

  const pct = (amount / baseAmount) * 100;
  const maxPct = getManualDiscountLimitPct(req.user);
  if (pct > maxPct + 0.000001) {
    throw new Error(`${label} vượt quá hạn mức giảm giá tối đa ${maxPct}%`);
  }
}

function parsePromotionConfig(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function isPromotionActiveNow(promotion, now) {
  if (promotion.isActive === false) return false;
  if (promotion.startDate && now < new Date(promotion.startDate)) return false;
  if (promotion.endDate && now > new Date(promotion.endDate)) return false;
  return true;
}

async function calculateAutoPromotions(tx, storeId, lines) {
  const promotions = await tx.promotion.findMany({
    where: { storeId, isActive: true },
    orderBy: { createdAt: 'asc' }
  });
  const now = new Date();
  const activePromotions = promotions.filter((promotion) => isPromotionActiveNow(promotion, now));
  const currentHourMin = getVNTimeStr(now);
  const itemDiscounts = new Map();
  let comboDiscount = 0;
  let buyXGetYDiscount = 0;

  const happyHourPromos = activePromotions.filter((promotion) => {
    if (promotion.type !== 'HAPPY_HOUR') return false;
    const conditions = parsePromotionConfig(promotion.conditions);
    return conditions.startHour && conditions.endHour
      && currentHourMin >= conditions.startHour
      && currentHourMin <= conditions.endHour;
  });

  if (happyHourPromos.length > 0) {
    const promo = happyHourPromos[0];
    const conditions = parsePromotionConfig(promo.conditions);
    const rewards = parsePromotionConfig(promo.rewards);
    const productIds = Array.isArray(conditions.productIds) ? conditions.productIds : [];
    const discountPct = Math.max(0, Math.min(100, Number(rewards.discountPct) || 0));

    for (const line of lines) {
      if (productIds.length === 0 || productIds.includes(line.productId)) {
        itemDiscounts.set(line.key, roundMoney(line.lineTotal * (discountPct / 100)));
      }
    }
  }

  const availableProductQtys = {};
  const firstPriceByProductId = new Map();
  for (const line of lines) {
    availableProductQtys[line.productId] = (availableProductQtys[line.productId] || 0) + line.qty;
    if (!firstPriceByProductId.has(line.productId)) {
      firstPriceByProductId.set(line.productId, line.price);
    }
  }

  const comboPromos = activePromotions.filter((promotion) => promotion.type === 'COMBO');
  for (const promo of comboPromos) {
    const conditions = parsePromotionConfig(promo.conditions);
    const rewards = parsePromotionConfig(promo.rewards);
    const comboProducts = Array.isArray(conditions.comboProducts) ? conditions.comboProducts : [];
    const comboPrice = Number(rewards.comboPrice) || 0;
    if (comboProducts.length < 2 || comboPrice <= 0) continue;

    let numCombos = Infinity;
    for (const comboProduct of comboProducts) {
      const qtyNeeded = Number(comboProduct.qty) || 0;
      if (!comboProduct.productId || qtyNeeded <= 0) {
        numCombos = 0;
        break;
      }
      const availableQty = availableProductQtys[comboProduct.productId] || 0;
      numCombos = Math.min(numCombos, Math.floor(availableQty / qtyNeeded));
    }

    if (numCombos > 0 && Number.isFinite(numCombos)) {
      let normalTotalForCombo = 0;
      for (const comboProduct of comboProducts) {
        const qtyNeeded = Number(comboProduct.qty) || 0;
        availableProductQtys[comboProduct.productId] -= qtyNeeded * numCombos;
        normalTotalForCombo += (firstPriceByProductId.get(comboProduct.productId) || 0) * qtyNeeded * numCombos;
      }

      const discount = normalTotalForCombo - comboPrice * numCombos;
      if (discount > 0) {
        comboDiscount += roundMoney(discount);
      }
    }
  }

  const buyXGetYPromos = activePromotions.filter((promotion) => promotion.type === 'BUY_X_GET_Y');
  for (const promo of buyXGetYPromos) {
    const conditions = parsePromotionConfig(promo.conditions);
    const rewards = parsePromotionConfig(promo.rewards);
    const buyProductId = conditions.buyProductId;
    const getProductId = rewards.getProductId;
    const minQty = Number(conditions.minQty) || 0;
    const freeQty = Number(rewards.freeQty) || 0;
    if (!buyProductId || !getProductId || minQty <= 0 || freeQty <= 0) continue;

    const availableBuy = availableProductQtys[buyProductId] || 0;
    const numTriggers = Math.floor(availableBuy / minQty);
    if (numTriggers <= 0) continue;

    const giftQtyInCart = lines
      .filter((line) => line.productId === getProductId)
      .reduce((sum, line) => sum + line.qty, 0);
    const discountableQty = Math.min(giftQtyInCart, freeQty * numTriggers);
    if (discountableQty > 0) {
      buyXGetYDiscount += roundMoney((firstPriceByProductId.get(getProductId) || 0) * discountableQty);
    }
  }

  return {
    itemDiscounts,
    globalDiscount: roundMoney(comboDiscount + buyXGetYDiscount)
  };
}

async function resolveCheckoutLine(tx, req, item, index) {
  const storeId = req.storeId;
  const productId = normalizeCartProductId(item);
  let product = productId ? await tx.product.findFirst({ where: { id: productId, storeId } }) : null;
  if (!product && hasText(item.name)) {
    product = await tx.product.findFirst({ where: { storeId, name: String(item.name).trim() } });
  }
  if (!product) {
    throw new Error(`Sản phẩm dòng ${index + 1} không thuộc cửa hàng hiện tại`);
  }

  const qty = parsePositiveInt(item.qty, `Số lượng ${product.name}`);
  const price = roundMoney(product.price);
  const lineTotal = price * qty;
  const manualDiscount = Math.max(0, roundMoney(item.discount));
  if (manualDiscount > lineTotal) {
    throw new Error(`Giảm giá món ${product.name} vượt quá giá trị món`);
  }
  assertManualDiscountAllowed(req, manualDiscount, lineTotal, `giảm giá món ${product.name}`);

  return {
    key: item.cartItemId || `${product.id}:${index}`,
    cartItemId: item.cartItemId || null,
    productId: product.id,
    name: product.name,
    price,
    qty,
    lineTotal,
    manualDiscount,
    manualDiscountType: manualDiscount > 0 ? (item.discountType || 'FIXED') : null,
    sugar: hasText(item.sugar) ? String(item.sugar).trim().slice(0, 32) : null,
    ice: hasText(item.ice) ? String(item.ice).trim().slice(0, 32) : null,
    note: hasText(item.note) ? String(item.note).trim().slice(0, 255) : null,
    finalDiscount: 0,
    finalDiscountType: null
  };
}

async function resolveVoucherDiscount(tx, storeId, voucherCode, orderValue) {
  if (!hasText(voucherCode)) {
    return { voucherCode: null, amount: 0 };
  }

  const code = String(voucherCode).trim().toUpperCase();
  const voucher = await tx.voucher.findUnique({ where: { storeId_code: { storeId, code } } });
  if (!voucher) throw new Error('Mã giảm giá không tồn tại');
  if (!voucher.isActive) throw new Error('Mã giảm giá đã bị vô hiệu hóa');
  if (voucher.expiryDate && new Date(voucher.expiryDate) < new Date()) {
    throw new Error('Mã giảm giá đã hết hạn');
  }
  if (orderValue < voucher.minOrderValue) {
    throw new Error(`Đơn hàng tối thiểu ${voucher.minOrderValue.toLocaleString('vi-VN')}đ để áp dụng mã này`);
  }

  let amount = 0;
  if (voucher.type === 'FIXED') {
    amount = voucher.value;
  } else {
    amount = orderValue * (voucher.value / 100);
    if (voucher.maxDiscount && amount > voucher.maxDiscount) {
      amount = voucher.maxDiscount;
    }
  }

  return { voucherCode: code, amount: Math.max(0, roundMoney(amount)) };
}

async function buildAuthoritativeCheckout(tx, req, payload) {
  const storeId = req.storeId;
  const store = await tx.store.findUnique({ where: { id: storeId } });
  if (!store) throw new Error('Không tìm thấy cửa hàng hiện tại');

  const lines = [];
  for (let index = 0; index < payload.cart.length; index += 1) {
    lines.push(await resolveCheckoutLine(tx, req, payload.cart[index], index));
  }

  const autoPromotions = await calculateAutoPromotions(tx, storeId, lines);
  const subtotalBeforeGlobalDiscounts = lines.reduce((sum, line) => {
    const autoDiscount = autoPromotions.itemDiscounts.get(line.key) || 0;
    const discount = line.manualDiscount > 0 ? line.manualDiscount : autoDiscount;
    line.finalDiscount = Math.min(line.lineTotal, roundMoney(discount));
    line.finalDiscountType = line.finalDiscount > 0
      ? (line.manualDiscount > 0 ? line.manualDiscountType : 'AUTO')
      : null;
    return sum + line.lineTotal - line.finalDiscount;
  }, 0);

  const subtotal = Math.max(0, roundMoney(subtotalBeforeGlobalDiscounts - autoPromotions.globalDiscount));
  const vatRate = Number.isFinite(Number(store.vatRate)) ? Number(store.vatRate) : 0.08;

  const voucher = await resolveVoucherDiscount(tx, storeId, payload.voucherCode, subtotal);
  assertManualDiscountAllowed(req, voucher.amount, subtotal, 'mã giảm giá');
  const voucherDiscount = Math.min(voucher.amount, subtotal);

  const rawOrderDiscount = Math.max(0, roundMoney(payload.orderDiscount));
  assertManualDiscountAllowed(req, rawOrderDiscount, subtotal, 'giảm giá toàn đơn');
  const availableForOrderDiscount = Math.max(0, subtotal - voucherDiscount);
  const orderDiscountAmount = Math.min(rawOrderDiscount, availableForOrderDiscount);
  const cleanOrderDiscountType = orderDiscountAmount > 0 ? (payload.orderDiscountType || 'FIXED') : null;

  let customerId = payload.customerId || null;
  let customer = null;
  if (customerId) {
    customer = await tx.customer.findFirst({ where: { id: customerId, storeId } });
    if (!customer) {
      throw new Error('Khách hàng không thuộc cửa hàng hiện tại');
    }
  }

  const rawUsedPoints = Number(payload.usedPoints || 0);
  if (!Number.isInteger(rawUsedPoints) || rawUsedPoints < 0) {
    throw new Error('Số điểm sử dụng không hợp lệ');
  }
  const usedPoints = rawUsedPoints > 0 ? parsePositiveInt(rawUsedPoints, 'Số điểm sử dụng') : 0;
  if (usedPoints > 0) {
    if (!customer) {
      throw new Error('Phải chọn khách hàng trước khi dùng điểm tích lũy');
    }
    if (usedPoints > customer.points) {
      throw new Error('Số điểm sử dụng vượt quá số điểm hiện có của khách hàng');
    }
  }

  const afterVoucherAndOrderDiscount = Math.max(0, subtotal - voucherDiscount - orderDiscountAmount);
  const pointsDiscount = usedPoints * POINT_VALUE_VND;
  if (pointsDiscount > afterVoucherAndOrderDiscount) {
    throw new Error('Số điểm sử dụng vượt quá số tiền còn phải thanh toán');
  }

  const taxableSubtotal = Math.max(0, roundMoney(afterVoucherAndOrderDiscount - pointsDiscount));
  const vatAmount = Math.max(0, roundMoney(taxableSubtotal * vatRate));
  const total = roundMoney(taxableSubtotal + vatAmount);
  const discountAmount = roundMoney(voucherDiscount + orderDiscountAmount + pointsDiscount);
  const normalizedPayments = normalizePayments(payload.payments, total);
  const paymentMethod = normalizedPayments.length > 1
    ? 'mixed'
    : normalizedPayments[0]?.method || normalizePaymentMethod(payload.paymentMethod);

  return {
    subtotal,
    vatAmount,
    total,
    paymentMethod,
    customerId,
    voucherCode: voucher.voucherCode,
    discountAmount,
    orderDiscount: orderDiscountAmount,
    orderDiscountType: cleanOrderDiscountType,
    usedPoints,
    payments: normalizedPayments,
    items: lines.map((line) => ({
      productId: line.productId,
      name: line.name,
      price: line.price,
      qty: line.qty,
      sugar: line.sugar,
      ice: line.ice,
      note: line.note,
      discount: line.finalDiscount,
      discountType: line.finalDiscountType
    }))
  };
}

async function calculateCogsSnapshots(tx, storeId, items) {
  const productIds = [...new Set(items.map((item) => item.productId).filter(Boolean))];
  if (productIds.length === 0) {
    return items.map(() => ({ cogsAmount: null, cogsComplete: false }));
  }

  const recipes = await tx.recipeItem.findMany({
    where: { productId: { in: productIds } },
    include: {
      inventory: {
        select: { id: true, storeId: true, name: true, unit: true, avgCost: true }
      }
    }
  });
  const recipesByProduct = new Map();
  for (const recipe of recipes) {
    if (recipe.inventory.storeId !== storeId) continue;
    if (!recipesByProduct.has(recipe.productId)) recipesByProduct.set(recipe.productId, []);
    recipesByProduct.get(recipe.productId).push(recipe);
  }

  return items.map((item) => {
    const productRecipes = recipesByProduct.get(item.productId) || [];
    if (productRecipes.length === 0) {
      return { cogsAmount: null, cogsComplete: false, components: [] };
    }
    const components = productRecipes.map((recipe) => {
      const quantity = recipe.qty * item.qty;
      const complete = recipe.inventory.avgCost !== null;
      const unitCost = complete ? Number(recipe.inventory.avgCost) : null;
      return {
        inventoryId: recipe.inventory.id,
        inventoryName: recipe.inventory.name,
        unit: recipe.inventory.unit,
        quantity,
        unitCost,
        totalCost: complete ? roundMoney(quantity * unitCost) : null,
        complete
      };
    });
    const cogsComplete = components.every((component) => component.complete);
    return {
      cogsAmount: cogsComplete
        ? roundMoney(components.reduce((sum, component) => sum + component.totalCost, 0))
        : null,
      cogsComplete,
      components
    };
  });
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
      if (inventory.qty < amount) {
        throw businessError(`Không đủ tồn kho ${inventory.name} cho món ${item.name}`);
      }

      const deducted = await tx.inventory.updateMany({
        where: { id: recipe.inventoryId, storeId, qty: { gte: amount } },
        data: { qty: { decrement: amount } }
      });
      if (deducted.count === 0) {
        throw businessError(`Không đủ tồn kho ${inventory.name} cho món ${item.name}`);
      }
      const updatedInventory = await tx.inventory.findFirst({
        where: { id: recipe.inventoryId, storeId }
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
      data: options.keepTableOpen
        ? { status: 'occupied' }
        : { status: 'dirty', occupiedSince: null }
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

async function loadStoreCarts(db, storeId) {
  const rows = await db.activeCart.findMany({
    where: { storeId },
    select: { cartKey: true, data: true }
  });
  return Object.fromEntries(rows.map((row) => [row.cartKey, row.data]));
}

// --- WEBSOCKETS ---
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('AUTH_REQUIRED'));

    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload?.userId || !payload?.storeId || payload.scope === 'platform_admin') {
      return next(new Error('AUTH_INVALID'));
    }

    const user = await prisma.user.findFirst({
      where: {
        id: payload.userId,
        storeId: payload.storeId,
        store: { isActive: true }
      },
      select: { id: true, storeId: true, name: true, role: true, authVersion: true }
    });
    if (!user) return next(new Error('AUTH_INVALID'));
    if (Number(payload.authVersion || 0) !== user.authVersion) {
      return next(new Error('AUTH_INVALID'));
    }

    socket.data.user = user;
    socket.data.storeId = user.storeId;
    return next();
  } catch {
    return next(new Error('AUTH_INVALID'));
  }
});

io.on('connection', async (socket) => {
  const storeId = socket.data.storeId;
  console.log(`User connected: ${socket.id}`);
  socket.join(storeId);

  socket.on('joinStore', async (requestedStoreId) => {
    if (requestedStoreId && requestedStoreId !== storeId) {
      socket.emit('authorizationError', { error: 'Không có quyền truy cập dữ liệu cửa hàng này.' });
      return;
    }
    socket.join(storeId);
    try {
      socket.emit('cartSync', await loadStoreCarts(prisma, storeId));
    } catch (err) {
      socket.emit('cartSyncError', { error: err.message });
    }
  });

  socket.on('leaveStore', () => {
    socket.leave(storeId);
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });

  try {
    socket.emit('cartSync', await loadStoreCarts(prisma, storeId));
  } catch (err) {
    console.error('Không thể tải giỏ hàng realtime:', err.message);
  }
});

// Broadcast helper (tenant-scoped)
const broadcast = (event, data, storeId) => {
  if (storeId) {
    io.to(storeId).emit(event, data);
  }
};

// --- MULTI-TENANT & AUTH MIDDLEWARE ---
app.use(async (req, res, next) => {
  if (req.path === '/api/platform/auth/login') {
    return next();
  }

  if (req.path.startsWith('/api/public/')) {
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
    } catch {
      return res.status(401).json({ error: 'Phiên làm việc hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.' });
    }

    try {
      const currentUser = await prisma.user.findFirst({
        where: {
          id: userPayload.userId,
          storeId,
          store: { isActive: true }
        },
        select: {
          id: true,
          storeId: true,
          name: true,
          role: true,
          canViewReports: true,
          canRefund: true,
          canApplyDiscount: true,
          maxDiscountPct: true,
          authVersion: true
        }
      });
      if (!currentUser) {
        return res.status(401).json({ error: 'Tài khoản không còn hoạt động hoặc cửa hàng đã bị khóa.' });
      }
      if (Number(userPayload.authVersion || 0) !== currentUser.authVersion) {
        return res.status(401).json({ error: 'Phiên làm việc đã bị thu hồi. Vui lòng đăng nhập lại.' });
      }
      req.user = {
        ...userPayload,
        userId: currentUser.id,
        storeId: currentUser.storeId,
        name: currentUser.name,
        role: currentUser.role,
        canViewReports: currentUser.canViewReports,
        canRefund: currentUser.canRefund,
        canApplyDiscount: currentUser.canApplyDiscount,
        maxDiscountPct: currentUser.maxDiscountPct,
        authVersion: currentUser.authVersion
      };
    } catch (err) {
      return next(err);
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

app.get('/api/public/tables/:token/menu', async (req, res) => {
  const token = String(req.params.token || '').trim();
  const table = await prisma.table.findFirst({
    where: { orderToken: token, store: { isActive: true } },
    select: {
      id: true,
      name: true,
      zone: true,
      capacity: true,
      store: { select: { id: true, name: true, logo: true, currency: true, vatRate: true } }
    }
  });
  if (!table) return res.status(404).json({ error: 'Mã QR bàn không hợp lệ hoặc cửa hàng đang tạm ngừng.' });

  const products = await prisma.product.findMany({
    where: { storeId: table.store.id, hidden: false },
    orderBy: [{ category: 'asc' }, { popular: 'desc' }, { name: 'asc' }],
    take: 1000,
    select: {
      id: true,
      name: true,
      price: true,
      category: true,
      description: true,
      image: true,
      popular: true,
      prepTime: true
    }
  });
  res.json({ store: table.store, table: { id: table.id, name: table.name, zone: table.zone, capacity: table.capacity }, products });
});

app.post('/api/public/tables/:token/orders', async (req, res) => {
  const token = String(req.params.token || '').trim();
  const table = await prisma.table.findFirst({
    where: { orderToken: token, store: { isActive: true } },
    select: { id: true, storeId: true, name: true }
  });
  if (!table) return res.status(404).json({ error: 'Mã QR bàn không hợp lệ hoặc cửa hàng đang tạm ngừng.' });

  const rawItems = req.body?.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 50) {
    return res.status(400).json({ error: 'Yêu cầu gọi món phải có từ 1 đến 50 dòng món.' });
  }

  let totalQty = 0;
  const normalizedItems = [];
  try {
    for (const rawItem of rawItems) {
      const productId = String(rawItem?.productId || '').trim();
      if (!productId) throw businessError('Sản phẩm gọi món không hợp lệ.');
      const qty = parsePositiveInt(rawItem.qty, 'Số lượng món');
      if (qty > 20) throw businessError('Mỗi món chỉ được gọi tối đa 20 phần trong một lần.');
      totalQty += qty;
      normalizedItems.push({
        productId,
        qty,
        note: hasText(rawItem.note) ? String(rawItem.note).trim().slice(0, 255) : null
      });
    }
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  if (totalQty > 100) return res.status(400).json({ error: 'Tổng số lượng món trong một yêu cầu không được vượt quá 100.' });

  const productIds = [...new Set(normalizedItems.map((item) => item.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, storeId: table.storeId, hidden: false },
    select: { id: true, name: true, price: true }
  });
  const productById = new Map(products.map((product) => [product.id, product]));
  if (products.length !== productIds.length) {
    return res.status(400).json({ error: 'Có món không còn bán hoặc không thuộc cửa hàng này. Vui lòng tải lại thực đơn.' });
  }

  const clientRequestId = sanitizeClientRequestId(req.body?.clientRequestId || req.headers['idempotency-key']);
  if (clientRequestId) {
    const existing = await prisma.guestOrder.findFirst({
      where: { tableId: table.id, clientRequestId },
      include: { items: true }
    });
    if (existing) return res.json(existing);
  }

  let guestOrder;
  try {
    guestOrder = await prisma.guestOrder.create({
      data: {
        storeId: table.storeId,
        tableId: table.id,
        clientRequestId,
        guestName: hasText(req.body?.guestName) ? String(req.body.guestName).trim().slice(0, 80) : null,
        note: hasText(req.body?.note) ? String(req.body.note).trim().slice(0, 500) : null,
        items: {
          create: normalizedItems.map((item) => {
            const product = productById.get(item.productId);
            return {
              productId: product.id,
              name: product.name,
              price: roundMoney(product.price),
              qty: item.qty,
              note: item.note
            };
          })
        }
      },
      include: { items: true }
    });
  } catch (err) {
    if (err.code === 'P2002' && clientRequestId) {
      guestOrder = await prisma.guestOrder.findFirst({
        where: { tableId: table.id, clientRequestId },
        include: { items: true }
      });
      if (guestOrder) return res.json(guestOrder);
    }
    throw err;
  }

  broadcast('guestOrderCreated', {
    id: guestOrder.id,
    tableId: table.id,
    tableName: table.name,
    guestName: guestOrder.guestName,
    itemCount: totalQty,
    createdAt: guestOrder.createdAt
  }, table.storeId);
  res.status(201).json(guestOrder);
});

app.get('/api/public/guest-orders/:id/status', async (req, res) => {
  const token = String(req.query.token || '').trim();
  const guestOrder = await prisma.guestOrder.findFirst({
    where: { id: req.params.id, table: { orderToken: token, store: { isActive: true } } },
    select: {
      id: true,
      status: true,
      reviewedAt: true,
      createdAt: true,
      table: { select: { name: true } },
      order: { select: { orderNumber: true, status: true, prepStatus: true, total: true } }
    }
  });
  if (!guestOrder) return res.status(404).json({ error: 'Không tìm thấy yêu cầu gọi món.' });
  res.json(guestOrder);
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
      },
      realtime: {
        adapter: realtimeAdapterMode,
        connected: realtimeAdapterMode === 'memory' || Boolean(realtimePool),
        poolTotal: realtimePool?.totalCount || 0,
        poolIdle: realtimePool?.idleCount || 0,
        poolWaiting: realtimePool?.waitingCount || 0
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/branches', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const currentStore = await prisma.store.findUnique({
      where: { id: req.storeId },
      select: { organizationId: true }
    });
    if (!currentStore) return res.status(404).json({ error: 'Không tìm thấy cửa hàng hiện tại' });
    const branches = await prisma.store.findMany({
      where: { organizationId: currentStore.organizationId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        code: true,
        address: true,
        phone: true,
        isActive: true,
        plan: true,
        subscriptionStatus: true,
        createdAt: true,
        _count: { select: { users: true, products: true, orders: true } }
      }
    });
    res.json(branches.map((branch) => ({ ...branch, isCurrent: branch.id === req.storeId })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/branches/overview', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const currentStore = await prisma.store.findUnique({
      where: { id: req.storeId },
      select: { organizationId: true }
    });
    if (!currentStore) return res.status(404).json({ error: 'Không tìm thấy cửa hàng hiện tại' });
    const branches = await prisma.store.findMany({
      where: { organizationId: currentStore.organizationId },
      select: { id: true, name: true, code: true, isActive: true }
    });
    const branchIds = branches.map((branch) => branch.id);
    const startToday = getVNStartOfDay(getVNDateStr());
    const endToday = getVNEndOfDay(getVNDateStr());
    const [sales, inventories] = await Promise.all([
      prisma.order.groupBy({
        by: ['storeId'],
        where: {
          storeId: { in: branchIds },
          status: { in: ['paid', 'returned'] },
          timestamp: { gte: startToday, lte: endToday }
        },
        _sum: { total: true },
        _count: { id: true }
      }),
      prisma.inventory.findMany({
        where: { storeId: { in: branchIds } },
        select: { storeId: true, qty: true, minQty: true }
      })
    ]);
    const salesByStore = new Map(sales.map((item) => [item.storeId, item]));
    const lowStockByStore = new Map();
    inventories.forEach((item) => {
      if (item.qty <= item.minQty) {
        lowStockByStore.set(item.storeId, (lowStockByStore.get(item.storeId) || 0) + 1);
      }
    });
    const rows = branches.map((branch) => ({
      ...branch,
      revenueToday: salesByStore.get(branch.id)?._sum.total || 0,
      ordersToday: salesByStore.get(branch.id)?._count.id || 0,
      lowStockItems: lowStockByStore.get(branch.id) || 0
    }));
    res.json({
      branches: rows,
      totals: {
        revenueToday: rows.reduce((sum, row) => sum + row.revenueToday, 0),
        ordersToday: rows.reduce((sum, row) => sum + row.ordersToday, 0),
        lowStockItems: rows.reduce((sum, row) => sum + row.lowStockItems, 0)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/branches', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const name = String(req.body?.name || '').trim();
  const code = String(req.body?.code || '').trim().toLowerCase();
  const copyCatalog = Boolean(req.body?.copyCatalog);
  if (!name) return res.status(400).json({ error: 'Tên chi nhánh không được để trống' });
  if (!/^[a-z0-9-]{3,40}$/.test(code)) {
    return res.status(400).json({ error: 'Mã chi nhánh phải có 3-40 ký tự chữ thường, số hoặc gạch nối' });
  }

  try {
    const branch = await prisma.$transaction(async (tx) => {
      const sourceStore = await tx.store.findUnique({ where: { id: req.storeId } });
      if (!sourceStore) throw businessError('Không tìm thấy cửa hàng hiện tại', 404);
      const sourceAdmin = await tx.user.findFirst({
        where: { id: req.user.userId, storeId: req.storeId, role: 'admin' }
      });
      if (!sourceAdmin?.email || !sourceAdmin.password) {
        throw businessError('Admin hiện tại chưa có email/mật khẩu để cấp quyền ở chi nhánh mới');
      }

      const createdStore = await tx.store.create({
        data: {
          organizationId: sourceStore.organizationId,
          name: name.slice(0, 120),
          code,
          address: hasText(req.body?.address) ? String(req.body.address).trim().slice(0, 255) : null,
          phone: hasText(req.body?.phone) ? String(req.body.phone).trim().slice(0, 30) : null,
          vatRate: sourceStore.vatRate,
          pointsRate: sourceStore.pointsRate,
          currency: sourceStore.currency,
          printHeader: sourceStore.printHeader,
          printFooter: sourceStore.printFooter,
          plan: sourceStore.plan,
          subscriptionStatus: sourceStore.subscriptionStatus,
          subscriptionExpiresAt: sourceStore.subscriptionExpiresAt
        }
      });
      await tx.user.create({
        data: {
          storeId: createdStore.id,
          email: sourceAdmin.email,
          password: sourceAdmin.password,
          name: sourceAdmin.name,
          role: 'admin',
          canApplyDiscount: true,
          canRefund: true,
          canViewReports: true,
          maxDiscountPct: 100
        }
      });

      if (copyCatalog) {
        const [inventories, products, tables, suppliers, vouchers, promotions] = await Promise.all([
          tx.inventory.findMany({ where: { storeId: req.storeId } }),
          tx.product.findMany({ where: { storeId: req.storeId }, include: { recipes: true } }),
          tx.table.findMany({ where: { storeId: req.storeId } }),
          tx.supplier.findMany({ where: { storeId: req.storeId } }),
          tx.voucher.findMany({ where: { storeId: req.storeId } }),
          tx.promotion.findMany({ where: { storeId: req.storeId } })
        ]);
        const inventoryIdMap = new Map();
        for (const item of inventories) {
          const created = await tx.inventory.create({
            data: {
              storeId: createdStore.id,
              name: item.name,
              unit: item.unit,
              qty: 0,
              minQty: item.minQty,
              avgCost: item.avgCost,
              icon: item.icon
            }
          });
          inventoryIdMap.set(item.id, created.id);
        }
        for (const product of products) {
          const created = await tx.product.create({
            data: {
              storeId: createdStore.id,
              name: product.name,
              price: product.price,
              category: product.category,
              description: product.description,
              image: product.image,
              popular: product.popular,
              prepTime: product.prepTime,
              hidden: product.hidden
            }
          });
          const recipeRows = product.recipes
            .filter((recipe) => inventoryIdMap.has(recipe.inventoryId))
            .map((recipe) => ({
              productId: created.id,
              inventoryId: inventoryIdMap.get(recipe.inventoryId),
              qty: recipe.qty
            }));
          if (recipeRows.length > 0) await tx.recipeItem.createMany({ data: recipeRows });
        }
        if (tables.length > 0) {
          await tx.table.createMany({
            data: tables.map((table) => ({
              storeId: createdStore.id,
              name: table.name,
              zone: table.zone,
              capacity: table.capacity,
              status: 'available'
            }))
          });
        }
        if (suppliers.length > 0) {
          await tx.supplier.createMany({
            data: suppliers.map((supplier) => ({
              storeId: createdStore.id,
              name: supplier.name,
              phone: supplier.phone,
              email: supplier.email,
              address: supplier.address
            }))
          });
        }
        if (vouchers.length > 0) {
          await tx.voucher.createMany({
            data: vouchers.map((voucher) => ({
              storeId: createdStore.id,
              code: voucher.code,
              type: voucher.type,
              value: voucher.value,
              minOrderValue: voucher.minOrderValue,
              maxDiscount: voucher.maxDiscount,
              expiryDate: voucher.expiryDate,
              isActive: false
            }))
          });
        }
        if (promotions.length > 0) {
          await tx.promotion.createMany({
            data: promotions.map((promotion) => ({
              storeId: createdStore.id,
              name: promotion.name,
              type: promotion.type,
              conditions: promotion.conditions,
              rewards: promotion.rewards,
              startDate: promotion.startDate,
              endDate: promotion.endDate,
              isActive: false
            }))
          });
        }
      }
      return createdStore;
    }, { maxWait: 10000, timeout: 30000 });

    await writeAuditLog(req, 'create', 'branch', branch.id, { code: branch.code, copyCatalog });
    res.json(branch);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.code === 'P2002' ? 'Mã chi nhánh đã tồn tại' : err.message });
  }
});

app.delete('/api/branches/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (req.params.id === req.storeId) {
    return res.status(400).json({ error: 'Không thể xóa chi nhánh đang đăng nhập' });
  }
  try {
    const currentStore = await prisma.store.findUnique({
      where: { id: req.storeId },
      select: { organizationId: true }
    });
    const targetStore = currentStore ? await prisma.store.findFirst({
      where: { id: req.params.id, organizationId: currentStore.organizationId },
      select: { id: true, name: true, code: true, _count: { select: { orders: true } } }
    }) : null;
    if (!targetStore) return res.status(404).json({ error: 'Không tìm thấy chi nhánh' });
    if (targetStore._count.orders > 0) {
      return res.status(400).json({ error: 'Chi nhánh đã có giao dịch; hãy khóa chi nhánh thay vì xóa dữ liệu' });
    }
    await prisma.store.delete({ where: { id: targetStore.id } });
    await writeAuditLog(req, 'delete', 'branch', targetStore.id, { code: targetStore.code });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/branches/:id/switch', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const [sourceStore, currentUser] = await Promise.all([
      prisma.store.findUnique({ where: { id: req.storeId }, select: { organizationId: true } }),
      prisma.user.findFirst({ where: { id: req.user.userId, storeId: req.storeId } })
    ]);
    if (!sourceStore || !currentUser?.email) return res.status(400).json({ error: 'Không thể xác định tài khoản chuyển chi nhánh' });
    const targetStore = await prisma.store.findFirst({
      where: { id: req.params.id, organizationId: sourceStore.organizationId, isActive: true }
    });
    if (!targetStore) return res.status(404).json({ error: 'Không tìm thấy chi nhánh hoặc chi nhánh đang bị khóa' });
    const targetUser = await prisma.user.findUnique({
      where: { storeId_email: { storeId: targetStore.id, email: currentUser.email } },
      include: { store: true }
    });
    if (!targetUser || targetUser.role !== 'admin') {
      return res.status(403).json({ error: 'Tài khoản chưa được cấp quyền tại chi nhánh này' });
    }
    res.json({ ...sanitizeUser(targetUser), token: createStoreUserToken(targetUser) });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
app.get('/api/carts', async (req, res, next) => {
  try {
    res.json(await loadStoreCarts(prisma, req.storeId));
  } catch (err) {
    next(err);
  }
});

app.put('/api/carts/:id', async (req, res, next) => {
  const storeId = req.storeId;
  const cartKey = String(req.params.id || '').trim();
  const cart = req.body?.cart;
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(cartKey)) {
    return res.status(400).json({ error: 'Mã giỏ hàng không hợp lệ' });
  }
  if (!Array.isArray(cart) || cart.length > 200) {
    return res.status(400).json({ error: 'Dữ liệu giỏ hàng không hợp lệ hoặc vượt quá 200 dòng' });
  }

  try {
    if (cartKey !== '__takeaway__') {
      const table = await prisma.table.findFirst({ where: { id: cartKey, storeId }, select: { id: true } });
      if (!table) return res.status(400).json({ error: 'Bàn không thuộc cửa hàng hiện tại' });
    }
    await prisma.activeCart.upsert({
      where: { storeId_cartKey: { storeId, cartKey } },
      update: { data: cart },
      create: { storeId, cartKey, data: cart }
    });
    broadcast('cartSync', await loadStoreCarts(prisma, storeId), storeId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

app.delete('/api/carts/:id', async (req, res, next) => {
  const storeId = req.storeId;
  const cartKey = String(req.params.id || '').trim();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(cartKey)) {
    return res.status(400).json({ error: 'Mã giỏ hàng không hợp lệ' });
  }
  try {
    await prisma.activeCart.deleteMany({ where: { storeId, cartKey } });
    broadcast('cartSync', await loadStoreCarts(prisma, storeId), storeId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
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

    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: { name: storeName, code: storeCode }
      });
      const store = await tx.store.create({
        data: {
          organizationId: organization.id,
          name: storeName,
          code: storeCode,
          address: 'Địa chỉ quán của bạn',
          phone: 'Số điện thoại liên hệ',
          plan: 'trial',
          subscriptionStatus: 'trial'
        }
      });
      await tx.user.create({
        data: {
          storeId: store.id,
          name: adminName,
          email: String(adminEmail).trim().toLowerCase(),
          password: hashedPassword,
          role: 'admin',
          pin: null
        }
      });
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
    const store = await prisma.store.findUnique({ where: { code: storeCode } });
    const user = store ? await prisma.user.findUnique({
      where: { storeId_email: { storeId: store.id, email: String(email).trim().toLowerCase() } },
      include: { store: true }
    }) : null;

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

    const token = createStoreUserToken(user);

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
    
    const token = createStoreUserToken(user);
    
    return res.json({
      ...sanitizeUser(user),
      token
    });
  } catch (err) {
    return res.status(500).json({ error: 'Lỗi đăng nhập: ' + err.message });
  }
});

app.post('/api/auth/logout-all', async (req, res, next) => {
  try {
    const updated = await prisma.user.updateMany({
      where: { id: req.user.userId, storeId: req.storeId },
      data: { authVersion: { increment: 1 } }
    });
    if (updated.count === 0) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
    await writeAuditLog(req, 'revoke_sessions', 'user', req.user.userId);
    res.json({ success: true });
  } catch (err) {
    next(err);
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
    const { pin, password } = req.body || {};
    const data = normalizeUserPayload(req.body, { requireName: true });
    data.role = data.role || 'staff';
    const cleanPin = String(pin || '').trim();
    if (cleanPin && !/^\d{4}$/.test(cleanPin)) {
      return res.status(400).json({ error: 'Mã PIN phải gồm đúng 4 chữ số' });
    }
    if (data.role === 'staff' && !cleanPin) {
      return res.status(400).json({ error: 'Nhân viên POS phải có mã PIN 4 chữ số' });
    }
    if (data.role === 'admin' && (!data.email || !password || String(password).length < 8)) {
      return res.status(400).json({ error: 'Tài khoản admin cần email và mật khẩu ít nhất 8 ký tự' });
    }
    if (cleanPin && await isPinAlreadyUsed(req.storeId, cleanPin)) {
      return res.status(400).json({ error: 'Mã PIN đã tồn tại trong cửa hàng này' });
    }
    const user = await prisma.user.create({
      data: {
        ...data,
        storeId: req.storeId,
        pin: null,
        pinHash: data.role === 'staff' && cleanPin ? await bcrypt.hash(cleanPin, 10) : null,
        ...(password ? { password: await bcrypt.hash(password, 10) } : {})
      }
    });
    await writeAuditLog(req, 'create', 'user', user.id, { name: user.name, role: user.role });
    res.json(sanitizeUser(user));
  } catch (err) {
    res.status(err.status || 400).json({ error: err.code === 'P2002' ? 'Email hoặc mã nhân viên đã tồn tại' : err.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const existing = await prisma.user.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy nhân viên cần cập nhật' });

    const { pin, password } = req.body || {};
    const data = normalizeUserPayload(req.body);
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
      if (String(password).length < 8) {
        return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 8 ký tự' });
      }
      data.password = await bcrypt.hash(password, 10);
    }
    const nextRole = data.role || existing.role;
    const nextEmail = data.email !== undefined ? data.email : existing.email;
    const nextPassword = data.password || existing.password;
    if (nextRole === 'admin' && (!nextEmail || !nextPassword)) {
      return res.status(400).json({ error: 'Tài khoản admin cần email và mật khẩu' });
    }
    if (nextRole === 'admin') {
      data.pin = null;
      data.pinHash = null;
    } else if (!cleanPin && !existing.pinHash && !existing.pin) {
      return res.status(400).json({ error: 'Nhân viên POS phải có mã PIN 4 chữ số' });
    }
    if (existing.role === 'admin' && nextRole !== 'admin') {
      const adminCount = await prisma.user.count({ where: { storeId: req.storeId, role: 'admin' } });
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cửa hàng phải còn ít nhất một tài khoản admin' });
      }
    }

    const authSensitiveFields = new Set([
      'role', 'canApplyDiscount', 'canRefund', 'canViewReports', 'maxDiscountPct',
      'email', 'password', 'pinHash'
    ]);
    if (Object.keys(data).some((field) => authSensitiveFields.has(field))) {
      data.authVersion = { increment: 1 };
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
    res.status(err.status || 400).json({ error: err.code === 'P2002' ? 'Email hoặc mã nhân viên đã tồn tại' : err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (req.params.id === req.user?.userId) {
    return res.status(400).json({ error: 'Không thể xóa tài khoản đang đăng nhập' });
  }
  const target = await prisma.user.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
  if (!target) return res.status(404).json({ error: 'Không tìm thấy nhân viên cần xóa' });
  if (target.role === 'admin') {
    const adminCount = await prisma.user.count({ where: { storeId: req.storeId, role: 'admin' } });
    if (adminCount <= 1) return res.status(400).json({ error: 'Cửa hàng phải còn ít nhất một tài khoản admin' });
  }
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
    const cleanOpeningCash = parseWholeMoney(openingCash, 'Tiền đầu ca');
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
        openingCash: cleanOpeningCash,
        cashSales: 0,
        expectedCash: cleanOpeningCash,
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

    const actual = parseWholeMoney(actualCash, 'Tiền thực tế cuối ca');
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
    try {
      const customer = await prisma.customer.findUnique({
        where: { storeId_phone: { storeId: req.storeId, phone: normalizeCustomerPhone(phone) } }
      });
      return res.json(customer || null);
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
  }
  const customers = await prisma.customer.findMany({
    where: { storeId: req.storeId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: parseListLimit(req.query.limit, 500, 1000)
  });
  res.json(customers);
});

app.post('/api/customers', async (req, res) => {
  try {
    const customerData = normalizeCustomerPatch(req.body, {
      allowLoyalty: isAdminUser(req.user)
    });
    const customer = await prisma.customer.create({ data: { storeId: req.storeId, ...customerData } });
    await writeAuditLog(req, 'create', 'customer', customer.id, { phone: customer.phone });
    res.status(201).json(customer);
  } catch (err) {
    res.status(err.status || 400).json({
      error: err.code === 'P2002' ? 'Số điện thoại đã tồn tại trong cửa hàng này.' : err.message
    });
  }
});

// 1.3 Vouchers
app.get('/api/vouchers', async (req, res) => {
  const vouchers = await prisma.voucher.findMany({
    where: { storeId: req.storeId },
    orderBy: { code: 'asc' },
    take: parseListLimit(req.query.limit, 500, 1000)
  });
  res.json(vouchers);
});

app.post('/api/vouchers/validate', async (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase();
  let orderValue;
  try {
    orderValue = parseWholeMoney(req.body?.orderValue, 'Giá trị đơn hàng');
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  if (!code) return res.status(400).json({ error: 'Vui lòng nhập mã giảm giá.' });
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
  res.json({ voucher, discountAmount: Math.max(0, roundMoney(discountAmount)) });
});

// Yêu cầu gọi món từ QR tại bàn
app.get('/api/guest-orders', async (req, res) => {
  const allowedStatuses = new Set(['pending', 'accepted', 'rejected', 'cancelled']);
  const status = hasText(req.query.status) ? String(req.query.status).trim() : 'pending';
  if (status !== 'all' && !allowedStatuses.has(status)) {
    return res.status(400).json({ error: 'Trạng thái yêu cầu gọi món không hợp lệ.' });
  }
  const guestOrders = await prisma.guestOrder.findMany({
    where: { storeId: req.storeId, ...(status === 'all' ? {} : { status }) },
    orderBy: { createdAt: 'asc' },
    take: parseListLimit(req.query.limit, 200, 500),
    include: {
      items: true,
      table: { select: { id: true, name: true, zone: true } },
      order: { select: { id: true, orderNumber: true, status: true, prepStatus: true, total: true } },
      reviewedBy: { select: employeeSummarySelect }
    }
  });
  res.json(guestOrders);
});

app.post('/api/guest-orders/:id/accept', async (req, res) => {
  const storeId = req.storeId;
  const now = new Date();
  try {
    const result = await prisma.$transaction(async (tx) => {
      await lockStoreCounter(tx, storeId, `guest-order:${req.params.id}`);
      const guestOrder = await tx.guestOrder.findFirst({
        where: { id: req.params.id, storeId },
        include: { items: true, table: true, order: { include: orderResponseInclude } }
      });
      if (!guestOrder) throw businessError('Không tìm thấy yêu cầu gọi món.', 404);
      if (guestOrder.status === 'accepted' && guestOrder.order) {
        return { order: guestOrder.order, reused: true, guestOrder };
      }
      if (guestOrder.status !== 'pending') {
        throw businessError('Yêu cầu gọi món này đã được xử lý trước đó.', 409);
      }
      if (guestOrder.items.length === 0) throw businessError('Yêu cầu gọi món không có món hợp lệ.');

      const checkout = await buildAuthoritativeCheckout(tx, req, {
        cart: guestOrder.items.map((item) => ({
          productId: item.productId,
          qty: item.qty,
          note: item.note
        })),
        paymentMethod: 'cash',
        customerId: null,
        voucherCode: null,
        orderDiscount: 0,
        orderDiscountType: null,
        payments: [],
        usedPoints: 0
      });
      const cogsSnapshots = await calculateCogsSnapshots(tx, storeId, checkout.items);
      const orderNumber = await nextOrderNumber(tx, storeId);
      const order = await tx.order.create({
        data: {
          storeId,
          orderNumber,
          tableId: guestOrder.tableId,
          tableName: guestOrder.table.name,
          subtotal: checkout.subtotal,
          vatAmount: checkout.vatAmount,
          total: checkout.total,
          paymentMethod: 'cash',
          status: 'pending',
          time: getVNTimeStr(now),
          date: getVNLocaleDateStr(now),
          employeeId: req.user?.userId || null,
          discountAmount: checkout.discountAmount,
          orderDiscount: 0,
          note: guestOrder.note,
          usedPoints: 0,
          items: {
            create: checkout.items.map((item, index) => ({
              productId: item.productId,
              name: item.name,
              price: item.price,
              qty: item.qty,
              sugar: item.sugar,
              ice: item.ice,
              note: item.note,
              discount: item.discount || 0,
              discountType: item.discountType || null,
              cogsAmount: cogsSnapshots[index].cogsAmount,
              cogsComplete: cogsSnapshots[index].cogsComplete,
              ...(cogsSnapshots[index].components.length > 0 ? {
                costSnapshots: { create: cogsSnapshots[index].components }
              } : {})
            }))
          }
        },
        include: orderResponseInclude
      });
      await tx.guestOrder.update({
        where: { id: guestOrder.id },
        data: {
          status: 'accepted',
          orderId: order.id,
          reviewedById: req.user?.userId || null,
          reviewNote: hasText(req.body?.reviewNote) ? String(req.body.reviewNote).trim().slice(0, 255) : null,
          reviewedAt: now
        }
      });
      await tx.table.updateMany({
        where: { id: guestOrder.tableId, storeId },
        data: {
          status: 'occupied',
          occupiedSince: getVNTimeStr(now)
        }
      });
      return { order, reused: false, guestOrder };
    }, { maxWait: 10000, timeout: 20000 });

    if (!result.reused) {
      const table = await prisma.table.findFirst({ where: { id: result.guestOrder.tableId, storeId } });
      broadcast('tableUpdated', table, storeId);
      broadcast('guestOrderUpdated', { id: req.params.id, status: 'accepted', order: result.order }, storeId);
      broadcast('orderCreated', result.order, storeId);
      await writeAuditLog(req, 'accept', 'guest_order', req.params.id, {
        orderId: result.order.id,
        orderNumber: result.order.orderNumber,
        total: result.order.total
      });
    }
    res.json(result.order);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

app.post('/api/guest-orders/:id/reject', async (req, res) => {
  const updated = await prisma.guestOrder.updateMany({
    where: { id: req.params.id, storeId: req.storeId, status: 'pending' },
    data: {
      status: 'rejected',
      reviewedById: req.user?.userId || null,
      reviewNote: hasText(req.body?.reason) ? String(req.body.reason).trim().slice(0, 255) : null,
      reviewedAt: new Date()
    }
  });
  if (updated.count === 0) {
    const exists = await prisma.guestOrder.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    return res.status(exists ? 409 : 404).json({ error: exists ? 'Yêu cầu gọi món này đã được xử lý.' : 'Không tìm thấy yêu cầu gọi món.' });
  }
  const guestOrder = await prisma.guestOrder.findFirst({
    where: { id: req.params.id, storeId: req.storeId },
    include: { items: true, table: { select: { id: true, name: true, zone: true } } }
  });
  await writeAuditLog(req, 'reject', 'guest_order', guestOrder.id, { reason: guestOrder.reviewNote });
  broadcast('guestOrderUpdated', { id: guestOrder.id, status: guestOrder.status }, req.storeId);
  res.json(guestOrder);
});

const ACTIVE_RESERVATION_STATUSES = ['pending', 'confirmed', 'seated'];
const RESERVATION_STATUSES = new Set([...ACTIVE_RESERVATION_STATUSES, 'completed', 'cancelled', 'no_show']);
const DEPOSIT_STATUSES = new Set(['unpaid', 'paid', 'refunded', 'forfeited']);

function parseReservationDate(value, fieldName) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) throw businessError(`${fieldName} không hợp lệ.`);
  return date;
}

function validateReservationRange(startAt, endAt) {
  if (endAt <= startAt) throw businessError('Giờ kết thúc phải sau giờ bắt đầu.');
  if (endAt.getTime() - startAt.getTime() > 12 * 60 * 60 * 1000) {
    throw businessError('Một lượt đặt bàn không được kéo dài quá 12 giờ.');
  }
}

async function findReservationConflict(tx, storeId, tableId, startAt, endAt, excludeId = null) {
  return tx.reservation.findFirst({
    where: {
      storeId,
      tableId,
      status: { in: ACTIVE_RESERVATION_STATUSES },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
      ...(excludeId ? { id: { not: excludeId } } : {})
    },
    select: { id: true, customerName: true, startAt: true, endAt: true }
  });
}

app.get('/api/reservations', async (req, res) => {
  try {
    const from = req.query.from ? parseReservationDate(req.query.from, 'Thời gian bắt đầu') : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const to = req.query.to ? parseReservationDate(req.query.to, 'Thời gian kết thúc') : new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
    if (to <= from || to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) {
      throw businessError('Khoảng thời gian tra cứu đặt bàn không hợp lệ hoặc vượt quá 366 ngày.');
    }
    const status = hasText(req.query.status) ? String(req.query.status).trim() : 'all';
    if (status !== 'all' && !RESERVATION_STATUSES.has(status)) throw businessError('Trạng thái đặt bàn không hợp lệ.');
    const reservations = await prisma.reservation.findMany({
      where: {
        storeId: req.storeId,
        startAt: { lt: to },
        endAt: { gt: from },
        ...(status === 'all' ? {} : { status })
      },
      orderBy: [{ startAt: 'asc' }, { createdAt: 'asc' }],
      take: parseListLimit(req.query.limit, 500, 1000),
      include: {
        table: { select: { id: true, name: true, zone: true, capacity: true } },
        createdBy: { select: employeeSummarySelect }
      }
    });
    res.json(reservations);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

app.get('/api/reservations/availability', async (req, res) => {
  try {
    const startAt = parseReservationDate(req.query.startAt, 'Giờ bắt đầu');
    const endAt = parseReservationDate(req.query.endAt, 'Giờ kết thúc');
    validateReservationRange(startAt, endAt);
    const guestCount = req.query.guestCount ? parsePositiveInt(req.query.guestCount, 'Số khách') : 1;
    const conflicts = await prisma.reservation.findMany({
      where: {
        storeId: req.storeId,
        tableId: { not: null },
        status: { in: ACTIVE_RESERVATION_STATUSES },
        startAt: { lt: endAt },
        endAt: { gt: startAt }
      },
      select: { tableId: true }
    });
    const blockedIds = conflicts.map((row) => row.tableId).filter(Boolean);
    const tables = await prisma.table.findMany({
      where: { storeId: req.storeId, capacity: { gte: guestCount }, id: { notIn: blockedIds } },
      orderBy: [{ capacity: 'asc' }, { zone: 'asc' }, { name: 'asc' }]
    });
    res.json(tables);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

app.post('/api/reservations', async (req, res) => {
  try {
    const tableId = String(req.body?.tableId || '').trim();
    if (!tableId) throw businessError('Vui lòng chọn bàn cần đặt.');
    const customerName = String(req.body?.customerName || '').trim();
    if (!customerName) throw businessError('Tên khách đặt bàn không được để trống.');
    const phone = String(req.body?.phone || '').trim();
    if (!/^[0-9+().\s-]{8,20}$/.test(phone)) throw businessError('Số điện thoại đặt bàn không hợp lệ.');
    const guestCount = parsePositiveInt(req.body?.guestCount, 'Số khách');
    const startAt = parseReservationDate(req.body?.startAt, 'Giờ bắt đầu');
    const endAt = parseReservationDate(req.body?.endAt, 'Giờ kết thúc');
    validateReservationRange(startAt, endAt);
    if (startAt.getTime() < Date.now() - 5 * 60 * 1000) throw businessError('Không thể tạo lịch đặt bàn trong quá khứ.');
    const depositAmount = parseWholeMoney(req.body?.depositAmount || 0, 'Tiền cọc');
    const depositStatus = req.body?.depositStatus || (depositAmount > 0 ? 'paid' : 'unpaid');
    if (!DEPOSIT_STATUSES.has(depositStatus)) throw businessError('Trạng thái tiền cọc không hợp lệ.');

    const reservation = await prisma.$transaction(async (tx) => {
      await lockStoreCounter(tx, req.storeId, `reservation:${tableId}`);
      const table = await tx.table.findFirst({ where: { id: tableId, storeId: req.storeId } });
      if (!table) throw businessError('Bàn không thuộc cửa hàng hiện tại.', 404);
      if (guestCount > table.capacity) throw businessError(`${table.name} chỉ có sức chứa ${table.capacity} khách.`);
      const conflict = await findReservationConflict(tx, req.storeId, tableId, startAt, endAt);
      if (conflict) throw businessError(`Bàn đã được đặt cho ${conflict.customerName} trong khung giờ này.`, 409);
      return tx.reservation.create({
        data: {
          storeId: req.storeId,
          tableId,
          customerName: customerName.slice(0, 100),
          phone,
          guestCount,
          startAt,
          endAt,
          status: 'confirmed',
          depositAmount,
          depositStatus,
          note: hasText(req.body?.note) ? String(req.body.note).trim().slice(0, 500) : null,
          createdById: req.user?.userId || null
        },
        include: { table: true, createdBy: { select: employeeSummarySelect } }
      });
    }, { maxWait: 10000, timeout: 15000 });
    await writeAuditLog(req, 'create', 'reservation', reservation.id, {
      tableId: reservation.tableId,
      startAt: reservation.startAt,
      depositAmount: reservation.depositAmount
    });
    broadcast('reservationUpdated', { action: 'create', reservation }, req.storeId);
    res.status(201).json(reservation);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

app.put('/api/reservations/:id', async (req, res) => {
  try {
    const current = await prisma.reservation.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
    if (!current) throw businessError('Không tìm thấy lịch đặt bàn.', 404);
    const tableId = req.body?.tableId !== undefined ? String(req.body.tableId || '').trim() : current.tableId;
    if (!tableId) throw businessError('Vui lòng chọn bàn cần đặt.');
    const startAt = req.body?.startAt !== undefined ? parseReservationDate(req.body.startAt, 'Giờ bắt đầu') : current.startAt;
    const endAt = req.body?.endAt !== undefined ? parseReservationDate(req.body.endAt, 'Giờ kết thúc') : current.endAt;
    validateReservationRange(startAt, endAt);
    const guestCount = req.body?.guestCount !== undefined ? parsePositiveInt(req.body.guestCount, 'Số khách') : current.guestCount;
    const status = req.body?.status !== undefined ? String(req.body.status) : current.status;
    if (!RESERVATION_STATUSES.has(status)) throw businessError('Trạng thái đặt bàn không hợp lệ.');
    const depositAmount = req.body?.depositAmount !== undefined
      ? parseWholeMoney(req.body.depositAmount, 'Tiền cọc')
      : current.depositAmount;
    const depositStatus = req.body?.depositStatus !== undefined ? String(req.body.depositStatus) : current.depositStatus;
    if (!DEPOSIT_STATUSES.has(depositStatus)) throw businessError('Trạng thái tiền cọc không hợp lệ.');
    const customerName = req.body?.customerName !== undefined ? String(req.body.customerName || '').trim() : current.customerName;
    if (!customerName) throw businessError('Tên khách đặt bàn không được để trống.');
    const phone = req.body?.phone !== undefined ? String(req.body.phone || '').trim() : current.phone;
    if (!/^[0-9+().\s-]{8,20}$/.test(phone)) throw businessError('Số điện thoại đặt bàn không hợp lệ.');

    const reservation = await prisma.$transaction(async (tx) => {
      await lockStoreCounter(tx, req.storeId, `reservation:${tableId}`);
      const table = await tx.table.findFirst({ where: { id: tableId, storeId: req.storeId } });
      if (!table) throw businessError('Bàn không thuộc cửa hàng hiện tại.', 404);
      if (guestCount > table.capacity) throw businessError(`${table.name} chỉ có sức chứa ${table.capacity} khách.`);
      if (ACTIVE_RESERVATION_STATUSES.includes(status)) {
        const conflict = await findReservationConflict(tx, req.storeId, tableId, startAt, endAt, current.id);
        if (conflict) throw businessError(`Bàn đã được đặt cho ${conflict.customerName} trong khung giờ này.`, 409);
      }
      const updated = await tx.reservation.update({
        where: { id: current.id },
        data: {
          tableId,
          customerName: customerName.slice(0, 100),
          phone,
          guestCount,
          startAt,
          endAt,
          status,
          depositAmount,
          depositStatus,
          ...(req.body?.note !== undefined ? {
            note: hasText(req.body.note) ? String(req.body.note).trim().slice(0, 500) : null
          } : {})
        },
        include: { table: true, createdBy: { select: employeeSummarySelect } }
      });
      if (status === 'seated') {
        await tx.table.updateMany({
          where: { id: tableId, storeId: req.storeId },
          data: { status: 'occupied', occupiedSince: getVNTimeStr(new Date()) }
        });
      }
      return updated;
    }, { maxWait: 10000, timeout: 15000 });

    await writeAuditLog(req, 'update', 'reservation', reservation.id, {
      status: reservation.status,
      depositStatus: reservation.depositStatus
    });
    broadcast('reservationUpdated', { action: 'update', reservation }, req.storeId);
    if (reservation.status === 'seated') {
      const table = await prisma.table.findFirst({ where: { id: reservation.tableId, storeId: req.storeId } });
      broadcast('tableUpdated', table, req.storeId);
    }
    res.json(reservation);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

// 2. Products
app.get('/api/products', async (req, res) => {
  const products = await prisma.product.findMany({
    where: { storeId: req.storeId },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    take: parseListLimit(req.query.limit, 1000, 5000)
  });
  res.json(products);
});

app.post('/api/products', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const name = String(req.body?.name || '').trim();
  const category = String(req.body?.category || '').trim();
  if (!name) {
    return res.status(400).json({ error: 'Tên sản phẩm không được để trống' });
  }
  if (!category) {
    return res.status(400).json({ error: 'Danh mục sản phẩm không được để trống' });
  }
  let price;
  try {
    price = parseWholeMoney(req.body?.price, 'Giá bán');
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  const duplicate = await prisma.product.findFirst({
    where: { storeId: req.storeId, name: { equals: name, mode: 'insensitive' } }
  });
  if (duplicate) {
    return res.status(400).json({ error: 'Tên sản phẩm đã tồn tại trong cửa hàng này' });
  }
  const product = await prisma.product.create({
    data: {
      storeId: req.storeId,
      name,
      price,
      category,
      description: hasText(req.body?.description) ? String(req.body.description).trim().slice(0, 1000) : null,
      image: hasText(req.body?.image) ? String(req.body.image).trim().slice(0, 200000) : null,
      popular: Boolean(req.body?.popular),
      prepTime: hasText(req.body?.prepTime) ? String(req.body.prepTime).trim().slice(0, 50) : '5 phút',
      hidden: Boolean(req.body?.hidden)
    }
  });
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
  const productPatch = {};
  if (name) productPatch.name = name;
  if (req.body?.price !== undefined) {
    try {
      productPatch.price = parseWholeMoney(req.body.price, 'Giá bán');
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
  }
  if (req.body?.category !== undefined) {
    const category = String(req.body.category || '').trim();
    if (!category) return res.status(400).json({ error: 'Danh mục sản phẩm không được để trống' });
    productPatch.category = category;
  }
  if (req.body?.description !== undefined) {
    productPatch.description = hasText(req.body.description) ? String(req.body.description).trim().slice(0, 1000) : null;
  }
  if (req.body?.image !== undefined) {
    productPatch.image = hasText(req.body.image) ? String(req.body.image).trim().slice(0, 200000) : null;
  }
  if (req.body?.popular !== undefined) productPatch.popular = Boolean(req.body.popular);
  if (req.body?.prepTime !== undefined) {
    productPatch.prepTime = hasText(req.body.prepTime) ? String(req.body.prepTime).trim().slice(0, 50) : null;
  }
  if (req.body?.hidden !== undefined) productPatch.hidden = Boolean(req.body.hidden);
  const updated = await prisma.product.updateMany({
    where: { id: req.params.id, storeId: req.storeId },
    data: productPatch
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
  const tables = await prisma.table.findMany({
    where: { storeId: req.storeId },
    orderBy: [{ zone: 'asc' }, { name: 'asc' }],
    take: parseListLimit(req.query.limit, 500, 1000)
  });
  res.json(tables);
});

app.put('/api/tables/:id', async (req, res) => {
  const fields = Object.keys(req.body || {});
  if (fields.length === 0 || fields.some((key) => !['status', 'occupiedSince', 'name', 'zone', 'capacity'].includes(key))) {
    return res.status(400).json({ error: 'Dữ liệu cập nhật bàn không hợp lệ.' });
  }
  const isStatusOnlyUpdate = fields.every((key) => ['status', 'occupiedSince'].includes(key));
  if (!isStatusOnlyUpdate && !requireAdmin(req, res)) return;

  const patch = {};
  if (req.body.status !== undefined) {
    if (!['available', 'occupied', 'dirty'].includes(req.body.status)) {
      return res.status(400).json({ error: 'Trạng thái bàn không hợp lệ.' });
    }
    patch.status = req.body.status;
  }
  if (req.body.occupiedSince !== undefined) {
    patch.occupiedSince = hasText(req.body.occupiedSince) ? String(req.body.occupiedSince).trim().slice(0, 20) : null;
  }
  if (req.body.name !== undefined) {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Tên bàn không được để trống.' });
    patch.name = name.slice(0, 80);
  }
  if (req.body.zone !== undefined) {
    const zone = String(req.body.zone || '').trim();
    if (!zone) return res.status(400).json({ error: 'Khu vực bàn không được để trống.' });
    patch.zone = zone.slice(0, 80);
  }
  if (req.body.capacity !== undefined) {
    try {
      patch.capacity = parsePositiveInt(req.body.capacity, 'Sức chứa bàn');
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    if (patch.capacity > 100) return res.status(400).json({ error: 'Sức chứa bàn không được vượt quá 100 người.' });
  }

  const updated = await prisma.table.updateMany({
    where: { id: req.params.id, storeId: req.storeId },
    data: patch
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

app.post('/api/tables/:id/rotate-order-token', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const updated = await prisma.table.updateMany({
    where: { id: req.params.id, storeId: req.storeId },
    data: { orderToken: `tbl_${crypto.randomBytes(24).toString('hex')}` }
  });
  if (updated.count === 0) return res.status(404).json({ error: 'Không tìm thấy bàn cần đổi mã QR.' });
  const table = await prisma.table.findFirst({ where: { id: req.params.id, storeId: req.storeId } });
  await writeAuditLog(req, 'rotate_qr', 'table', table.id);
  broadcast('tableUpdated', table, req.storeId);
  res.json(table);
});

// 4. Orders & Checkout
app.get('/api/orders', async (req, res) => {
  const limit = parseListLimit(req.query.limit, 500, 1000);
  const cursor = hasText(req.query.cursor) ? String(req.query.cursor) : null;
  if (cursor) {
    const ownedCursor = await prisma.order.findFirst({
      where: { id: cursor, storeId: req.storeId },
      select: { id: true }
    });
    if (!ownedCursor) return res.status(400).json({ error: 'Cursor hóa đơn không hợp lệ' });
  }
  const orders = await prisma.order.findMany({
    where: { storeId: req.storeId },
    orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: orderResponseInclude
  });
  res.json(setNextCursor(res, orders, limit));
});

// Helper để xác nhận thanh toán thành công cho đơn hàng pending
const completeOrderPayment = async (orderId, storeId, paymentOptions = null) => {
  try {
    const updatedOrder = await prisma.$transaction(async (tx) => {
      let paymentPatch = {};
      let normalizedPayments = null;
      if (paymentOptions) {
        const pendingOrder = await tx.order.findFirst({
          where: { id: orderId, storeId, status: 'pending' },
          select: { total: true, paymentMethod: true }
        });
        if (!pendingOrder) return null;
        normalizedPayments = normalizePayments(paymentOptions.payments, pendingOrder.total);
        const requestedMethod = paymentOptions.paymentMethod !== undefined
          ? normalizePaymentMethod(paymentOptions.paymentMethod)
          : pendingOrder.paymentMethod;
        paymentPatch = {
          paymentMethod: normalizedPayments.length > 1
            ? 'mixed'
            : normalizedPayments[0]?.method || requestedMethod
        };
      }
      const claimed = await tx.order.updateMany({
        where: { id: orderId, storeId, status: 'pending' },
        data: { status: 'paid', ...paymentPatch }
      });
      if (claimed.count === 0) return null;

      if (normalizedPayments) {
        await tx.orderPayment.deleteMany({ where: { orderId } });
        if (normalizedPayments.length > 0) {
          await tx.orderPayment.createMany({
            data: normalizedPayments.map((payment) => ({
              orderId,
              method: payment.method,
              amount: payment.amount,
              reference: payment.reference || null
            }))
          });
        }
      }

      const paidOrder = await tx.order.findFirst({
        where: { id: orderId, storeId },
        include: orderResponseInclude
      });
      if (!paidOrder) throw businessError('Không tìm thấy hóa đơn vừa xác nhận thanh toán', 404);

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
    tableId, tableName, cart, paymentMethod,
    customerId, voucherCode, employeeId,
    orderDiscount, orderDiscountType, discountReason,
    note,
    payments,
    status, // "pending" hoặc "paid"
    usedPoints,
    keepTableOpen,
    clientRequestId: bodyClientRequestId
  } = req.body;
  const storeId = req.storeId;
  const orderStatus = status || 'paid';
  const clientRequestId = sanitizeClientRequestId(bodyClientRequestId || req.headers['idempotency-key']);

  if (!['paid', 'pending'].includes(orderStatus)) {
    return res.status(400).json({ error: 'Trạng thái hóa đơn không hợp lệ' });
  }

  if (clientRequestId) {
    const existingOrder = await prisma.order.findFirst({
      where: { storeId, clientRequestId },
      include: orderResponseInclude
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
  
  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
      if (clientRequestId) {
        const existingOrder = await tx.order.findFirst({
          where: { storeId, clientRequestId },
          include: orderResponseInclude
        });
        if (existingOrder) {
          reusedIdempotentOrder = true;
          return existingOrder;
        }
      }

      const orderNumber = await nextOrderNumber(tx, storeId);
      const checkout = await buildAuthoritativeCheckout(tx, req, {
        cart,
        paymentMethod,
        customerId,
        voucherCode,
        orderDiscount,
        orderDiscountType,
        payments,
        usedPoints
      });
      const cogsSnapshots = await calculateCogsSnapshots(tx, storeId, checkout.items);
      const createdOrder = await tx.order.create({
        data: {
          storeId,
          orderNumber,
          clientRequestId,
          tableId,
          tableName: tableName || 'Mang về',
          subtotal: checkout.subtotal,
          vatAmount: checkout.vatAmount,
          total: checkout.total,
          paymentMethod: checkout.paymentMethod,
          status: orderStatus,
          time: timeStr,
          date: dateStr,
          customerId: checkout.customerId,
          voucherCode: checkout.voucherCode,
          discountAmount: checkout.discountAmount,
          employeeId,
          orderDiscount: checkout.orderDiscount,
          orderDiscountType: checkout.orderDiscountType,
          discountReason: discountReason || null,
          note: hasText(note) ? String(note).trim().slice(0, 500) : null,
          usedPoints: checkout.usedPoints,
          items: {
            create: checkout.items.map((item, index) => ({
              productId: item.productId,
              name: item.name,
              price: item.price,
              qty: item.qty,
              sugar: item.sugar,
              ice: item.ice,
              note: item.note,
              discount: item.discount || 0,
              discountType: item.discountType || null,
              cogsAmount: cogsSnapshots[index].cogsAmount,
              cogsComplete: cogsSnapshots[index].cogsComplete,
              ...(cogsSnapshots[index].components.length > 0 ? {
                costSnapshots: { create: cogsSnapshots[index].components }
              } : {})
            }))
          },
          ...(checkout.payments.length > 0 ? {
            payments: {
              create: checkout.payments.map(p => ({
                method: p.method,
                amount: p.amount,
                reference: p.reference || null
              }))
            }
          } : {})
        },
        include: orderResponseInclude
      });

      if (orderStatus === 'paid') {
        await applyPaidOrderEffects(tx, storeId, createdOrder, {
          payments: checkout.payments,
          keepTableOpen: Boolean(tableId && keepTableOpen)
        });
      }

      return createdOrder;
    }, { maxWait: 10000, timeout: 20000 });
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

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
    const updated = await completeOrderPayment(id, storeId, {
      paymentMethod: req.body?.paymentMethod,
      payments: req.body?.payments
    });
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
    res.status(err.status || 500).json({ error: err.message });
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
    const importQty = parsePositiveNumber(qty, 'Số lượng nhập');
    const importCost = cost === null || cost === undefined || cost === ''
      ? null
      : parseWholeMoney(cost, 'Đơn giá nhập');
    const transaction = await prisma.$transaction(async (tx) => {
      await lockStoreCounter(tx, storeId, `inventory:${inventoryId}`);
      const ingredient = await tx.inventory.findFirst({ where: { id: inventoryId, storeId } });
      if (!ingredient) throw businessError('Nguyên liệu không tồn tại', 404);

      if (supplierId) {
        const supplier = await tx.supplier.findFirst({ where: { id: supplierId, storeId } });
        if (!supplier) throw businessError('Nhà cung cấp không thuộc cửa hàng hiện tại');
      }

      const newQty = ingredient.qty + importQty;
      let nextAvgCost = ingredient.avgCost;
      if (importCost !== null) {
        if (ingredient.qty <= 0) {
          nextAvgCost = importCost;
        } else if (ingredient.avgCost !== null) {
          nextAvgCost = roundMoney(
            ((ingredient.qty * ingredient.avgCost) + (importQty * importCost)) / newQty
          );
        } else {
          nextAvgCost = importCost;
        }
      }

      await tx.inventory.update({
        where: { id: inventoryId },
        data: { qty: newQty, avgCost: nextAvgCost }
      });

      return tx.stockTransaction.create({
        data: {
          storeId,
          inventoryId,
          type: 'IMPORT',
          qtyChange: importQty,
          balance: newQty,
          cost: importCost,
          supplierId: supplierId || null,
          note: hasText(note) ? String(note).trim().slice(0, 500) : 'Nhập hàng từ nhà cung cấp'
        },
        include: { inventory: true, supplier: true }
      });
    }, { maxWait: 10000, timeout: 20000 });

    await writeAuditLog(req, 'import', 'inventory', inventoryId, {
      qty: importQty,
      cost: importCost,
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
    const cleanActualQty = Number(actualQty);
    if (!Number.isFinite(cleanActualQty) || cleanActualQty < 0) {
      return res.status(400).json({ error: 'Tồn kho thực tế phải là số không âm' });
    }

    const result = await prisma.$transaction(async (tx) => {
      await lockStoreCounter(tx, storeId, `inventory:${inventoryId}`);
      const ingredient = await tx.inventory.findFirst({ where: { id: inventoryId, storeId } });
      if (!ingredient) throw businessError('Nguyên liệu không tồn tại', 404);

      const diff = cleanActualQty - ingredient.qty;
      await tx.inventory.update({ where: { id: inventoryId }, data: { qty: cleanActualQty } });
      const transaction = await tx.stockTransaction.create({
        data: {
          storeId,
          inventoryId,
          type: 'ADJUST',
          qtyChange: diff,
          balance: cleanActualQty,
          note: hasText(note) ? String(note).trim().slice(0, 500) : 'Cân đối kiểm kho'
        },
        include: { inventory: true }
      });
      return { transaction, oldQty: ingredient.qty, diff };
    }, { maxWait: 10000, timeout: 20000 });

    await writeAuditLog(req, 'adjust', 'inventory', inventoryId, {
      oldQty: result.oldQty,
      actualQty: cleanActualQty,
      diff: result.diff,
      transactionId: result.transaction.id
    });
    broadcast('inventoryUpdated', await prisma.inventory.findMany({ where: { storeId }, orderBy: { name: 'asc' } }), storeId);
    res.json(result.transaction);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Reset Inventory to default seeded values
app.post('/api/inventory/reset', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const storeId = req.storeId;
  try {
    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { code: true } });
    if (store?.code !== 'espresso-lab') {
      return res.status(403).json({ error: 'Chức năng khôi phục kho mẫu chỉ dành cho cửa hàng demo espresso-lab.' });
    }
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
      take: parseListLimit(req.query.limit, 500, 2000),
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
  try {
    const customerPatch = normalizeCustomerPatch(req.body, { allowLoyalty: true, partial: true });
    if (Object.keys(customerPatch).length === 0) throw businessError('Không có dữ liệu khách hàng hợp lệ để cập nhật.');
    const updated = await prisma.customer.updateMany({
      where: { id, storeId },
      data: customerPatch
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
    const orderCount = await prisma.order.count({ where: { storeId, customerId: id } });
    if (orderCount > 0) {
      return res.status(409).json({ error: 'Khách hàng đã có lịch sử giao dịch nên không thể xóa.' });
    }
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
  try {
    const voucherData = normalizeVoucherPayload(req.body);
    const voucher = await prisma.voucher.create({
      data: {
        storeId,
        ...voucherData
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
  try {
    const voucherData = normalizeVoucherPayload(req.body);
    const updated = await prisma.voucher.updateMany({
      where: { id, storeId },
      data: voucherData
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
  try {
    const name = String(req.body?.name || '').trim();
    const zone = String(req.body?.zone || '').trim();
    if (!name) throw businessError('Tên bàn không được để trống.');
    if (!zone) throw businessError('Khu vực bàn không được để trống.');
    const capacity = parsePositiveInt(req.body?.capacity, 'Sức chứa bàn');
    if (capacity > 100) throw businessError('Sức chứa bàn không được vượt quá 100 người.');
    const duplicate = await prisma.table.findFirst({
      where: { storeId, zone: { equals: zone, mode: 'insensitive' }, name: { equals: name, mode: 'insensitive' } }
    });
    if (duplicate) throw businessError('Tên bàn đã tồn tại trong khu vực này.');
    const table = await prisma.table.create({
      data: {
        storeId,
        name: name.slice(0, 80),
        zone: zone.slice(0, 80),
        capacity
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
    const table = await prisma.table.findFirst({ where: { id, storeId } });
    if (!table) return res.status(404).json({ error: 'Không tìm thấy bàn cần xóa' });
    if (table.status !== 'available') {
      return res.status(409).json({ error: 'Chỉ có thể xóa bàn đang trống.' });
    }
    const [guestOrderCount, futureReservationCount] = await Promise.all([
      prisma.guestOrder.count({ where: { tableId: id } }),
      prisma.reservation.count({
        where: { tableId: id, endAt: { gt: new Date() }, status: { in: ACTIVE_RESERVATION_STATUSES } }
      })
    ]);
    if (guestOrderCount > 0) {
      return res.status(409).json({ error: 'Bàn đã có lịch sử gọi món QR nên không thể xóa. Hãy đổi tên hoặc khu vực bàn.' });
    }
    if (futureReservationCount > 0) {
      return res.status(409).json({ error: 'Bàn còn lịch đặt đang hoạt động nên không thể xóa.' });
    }
    const deleted = await prisma.table.deleteMany({
      where: { id, storeId }
    });
    if (deleted.count === 0) {
      return res.status(404).json({ error: 'Không tìm thấy bàn cần xóa' });
    }
    await writeAuditLog(req, 'delete', 'table', id);
    broadcast('tableDeleted', { id, storeId }, storeId);
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
  const cleanRefundMethod = ['cash', 'card', 'store_credit'].includes(refundMethod) ? refundMethod : 'cash';
  // items: [{ orderItemId, orderItemName, qty, reason? }]
  try {
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Vui lòng chọn ít nhất một món cần trả' });
    }
    if (!hasText(reason)) {
      return res.status(400).json({ error: 'Vui lòng nhập lý do trả hàng' });
    }

    if (refundEmployeeId) {
      const employee = await prisma.user.findFirst({ where: { id: refundEmployeeId, storeId } });
      if (!employee) {
        return res.status(400).json({ error: 'Nhân viên không thuộc cửa hàng hiện tại' });
      }
    }

    const requestedItems = items.map((item) => ({
      ...item,
      qty: parsePositiveInt(item.qty, 'Số lượng trả hàng')
    }));
    const requestKeys = requestedItems.map((item) => item.orderItemId || `name:${item.orderItemName || ''}`);
    if (new Set(requestKeys).size !== requestKeys.length) {
      return res.status(400).json({ error: 'Một dòng hóa đơn không được gửi trả nhiều lần trong cùng yêu cầu' });
    }

    const returnOrder = await prisma.$transaction(async (tx) => {
      await lockStoreCounter(tx, storeId, `return-order:${orderId}`);
      const order = await tx.order.findFirst({
        where: { id: orderId, storeId },
        include: { items: true }
      });
      if (!order) throw businessError('Không tìm thấy hóa đơn', 404);
      if (!['paid', 'returned'].includes(order.status)) {
        throw businessError('Chỉ hóa đơn đã thanh toán mới được phép hoàn trả');
      }

      const orderItemBaseTotal = order.items.reduce((sum, item) => {
        return sum + Math.max(0, item.price * item.qty - (item.discount || 0));
      }, 0);
      const validatedItems = requestedItems.map((returnItem) => {
        const matchingItems = returnItem.orderItemId
          ? order.items.filter((item) => item.id === returnItem.orderItemId)
          : order.items.filter((item) => item.name === returnItem.orderItemName);
        if (matchingItems.length !== 1) {
          const message = matchingItems.length > 1
            ? `Có nhiều dòng món ${returnItem.orderItemName}; vui lòng chọn đúng dòng hóa đơn`
            : `Món ${returnItem.orderItemName || returnItem.orderItemId} không thuộc hóa đơn này`;
          throw businessError(message);
        }

        const orderItem = matchingItems[0];
        const remainingQty = orderItem.qty - (orderItem.returnedQty || 0);
        if (returnItem.qty > remainingQty) {
          throw businessError(`Số lượng trả của ${orderItem.name} vượt quá số lượng còn lại`);
        }

        const lineBaseTotal = Math.max(0, orderItem.price * orderItem.qty - (orderItem.discount || 0));
        const linePaidTotal = orderItemBaseTotal > 0
          ? (order.total * lineBaseTotal) / orderItemBaseTotal
          : orderItem.price * orderItem.qty;
        const lineRefundAmount = roundMoney((linePaidTotal * returnItem.qty) / orderItem.qty);
        return {
          originalOrderItem: orderItem,
          orderItemName: orderItem.name,
          price: roundMoney(lineRefundAmount / returnItem.qty),
          qty: returnItem.qty,
          refundAmount: lineRefundAmount,
          cogsAmount: orderItem.cogsComplete && orderItem.cogsAmount !== null
            ? roundMoney((orderItem.cogsAmount * returnItem.qty) / orderItem.qty)
            : null,
          reason: returnItem.reason || reason
        };
      });

      const previousRefunds = await tx.returnOrder.aggregate({
        where: { orderId, storeId, status: 'completed' },
        _sum: { refundAmount: true }
      });
      const remainingRefundable = Math.max(0, roundMoney(order.total - (previousRefunds._sum.refundAmount || 0)));
      const requestedRefund = roundMoney(validatedItems.reduce((sum, item) => sum + item.refundAmount, 0));
      if (requestedRefund <= 0 || requestedRefund > remainingRefundable) {
        throw businessError('Số tiền hoàn vượt quá giá trị còn có thể hoàn của hóa đơn');
      }

      const refundAmount = requestedRefund;
      const returnNumber = await nextReturnNumber(tx, storeId);
      const createdReturn = await tx.returnOrder.create({
        data: {
          storeId,
          orderId,
          returnNumber,
          reason: reason || 'Khách trả hàng',
          refundAmount,
          refundMethod: cleanRefundMethod,
          employeeId: refundEmployeeId,
          items: {
            create: validatedItems.map(it => ({
              orderItemId: it.originalOrderItem.id,
              productId: it.originalOrderItem.productId,
              orderItemName: it.orderItemName,
              price: it.price,
              qty: it.qty,
              refundAmount: it.refundAmount,
              cogsAmount: it.cogsAmount,
              reason: it.reason || null
            }))
          }
        },
        include: { items: true, order: true }
      });

      for (const returnItem of validatedItems) {
        const originalOrderItem = returnItem.originalOrderItem;

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

      const returnedByItemId = new Map(validatedItems.map((item) => [item.originalOrderItem.id, item.qty]));
      const fullyReturned = order.items.every((item) => {
        return (item.returnedQty || 0) + (returnedByItemId.get(item.id) || 0) >= item.qty;
      });
      if (fullyReturned && order.status !== 'returned') {
        await tx.order.update({ where: { id: order.id }, data: { status: 'returned' } });
      }

      if (cleanRefundMethod === 'cash' && refundEmployeeId) {
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
      refundAmount: returnOrder.refundAmount,
      refundMethod: cleanRefundMethod,
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
      take: parseListLimit(req.query.limit, 500, 1000),
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
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Đơn tạm giữ phải có ít nhất một món' });
    }

    const heldOrder = await prisma.$transaction(async (tx) => {
      const [table, employee, customer] = await Promise.all([
        tableId ? tx.table.findFirst({ where: { id: tableId, storeId } }) : null,
        employeeId ? tx.user.findFirst({ where: { id: employeeId, storeId }, select: { id: true, name: true } }) : null,
        customerId ? tx.customer.findFirst({ where: { id: customerId, storeId }, select: { id: true } }) : null
      ]);
      if (tableId && !table) throw businessError('Bàn không thuộc cửa hàng hiện tại');
      if (employeeId && !employee) throw businessError('Nhân viên không thuộc cửa hàng hiện tại');
      if (customerId && !customer) throw businessError('Khách hàng không thuộc cửa hàng hiện tại');

      const validatedItems = [];
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const productId = normalizeCartProductId(item);
        const product = productId
          ? await tx.product.findFirst({ where: { id: productId, storeId } })
          : null;
        if (!product) throw businessError(`Món ở dòng ${index + 1} không thuộc cửa hàng hiện tại`);

        validatedItems.push({
          productId: product.id,
          name: product.name,
          price: roundMoney(product.price),
          qty: parsePositiveInt(item.qty, `Số lượng món ${product.name}`),
          sugar: hasText(item.sugar) ? String(item.sugar).trim().slice(0, 32) : null,
          ice: hasText(item.ice) ? String(item.ice).trim().slice(0, 32) : null,
          note: hasText(item.note) ? String(item.note).trim().slice(0, 255) : null
        });
      }

      return tx.heldOrder.create({
        data: {
          storeId,
          tableId: table?.id || null,
          tableName: table?.name || (hasText(tableName) ? String(tableName).trim().slice(0, 100) : 'Mang về'),
          note: hasText(note) ? String(note).trim().slice(0, 500) : null,
          employeeId: employee?.id || null,
          employeeName: employee?.name || (hasText(employeeName) ? String(employeeName).trim().slice(0, 100) : null),
          customerId: customer?.id || null,
          items: { create: validatedItems }
        },
        include: { items: true }
      });
    });
    res.json(heldOrder);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
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
      include: {
        ...orderResponseInclude,
        returnOrders: { include: { items: true } }
      }
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

    const [orders, returns] = await Promise.all([
      prisma.order.findMany({
        where: {
          storeId,
          status: { in: ['paid', 'returned'] },
          ...(startDate || endDate ? { timestamp: dateFilter } : {})
        },
        select: {
          total: true,
          items: {
            select: {
              id: true,
              name: true,
              qty: true,
              cogsAmount: true,
              cogsComplete: true,
              costSnapshots: true
            }
          }
        }
      }),
      prisma.returnOrder.findMany({
        where: {
          storeId,
          status: 'completed',
          ...(startDate || endDate ? { createdAt: dateFilter } : {})
        },
        select: {
          refundAmount: true,
          items: {
            select: {
              orderItemName: true,
              qty: true,
              cogsAmount: true,
              orderItem: {
                select: { qty: true, costSnapshots: true }
              }
            }
          }
        }
      })
    ]);

    const grossRevenue = roundMoney(orders.reduce((sum, order) => sum + order.total, 0));
    const refunds = roundMoney(returns.reduce((sum, item) => sum + item.refundAmount, 0));
    const revenue = roundMoney(grossRevenue - refunds);
    let salesCogs = 0;
    let returnedCogs = 0;
    let completeSalesLines = 0;
    let totalSalesLines = 0;
    const missingCostItems = new Set();
    const ingredientConsumption = new Map();

    const applyCostComponent = (component, factor = 1, ratio = 1) => {
      const key = component.inventoryId || `${component.inventoryName}:${component.unit}`;
      const current = ingredientConsumption.get(key) || {
        name: component.inventoryName,
        unit: component.unit,
        qty: 0,
        knownCost: 0,
        complete: true
      };
      current.qty += component.quantity * ratio * factor;
      if (component.complete && component.totalCost !== null) {
        current.knownCost += component.totalCost * ratio * factor;
      } else {
        current.complete = false;
      }
      ingredientConsumption.set(key, current);
    };

    for (const order of orders) {
      for (const item of order.items) {
        totalSalesLines += 1;
        if (item.cogsComplete && item.cogsAmount !== null) {
          completeSalesLines += 1;
          salesCogs += item.cogsAmount;
        } else {
          missingCostItems.add(item.name);
        }
        item.costSnapshots.forEach((component) => applyCostComponent(component));
      }
    }

    let returnsCostComplete = true;
    for (const returnOrder of returns) {
      for (const item of returnOrder.items) {
        if (item.cogsAmount !== null) {
          returnedCogs += item.cogsAmount;
        } else {
          returnsCostComplete = false;
          missingCostItems.add(item.orderItemName);
        }
        if (item.orderItem?.qty > 0) {
          const ratio = item.qty / item.orderItem.qty;
          item.orderItem.costSnapshots.forEach((component) => applyCostComponent(component, -1, ratio));
        }
      }
    }

    const knownCogs = roundMoney(salesCogs - returnedCogs);
    const costComplete = completeSalesLines === totalSalesLines && returnsCostComplete;
    const cogs = costComplete ? knownCogs : null;
    const grossProfit = costComplete ? roundMoney(revenue - knownCogs) : null;
    const profitMargin = costComplete && revenue !== 0 ? (grossProfit / revenue) * 100 : null;
    const ingredients = [...ingredientConsumption.values()].map((item) => ({
      name: item.name,
      unit: item.unit,
      qty: item.qty,
      cost: item.complete ? roundMoney(item.knownCost) : null,
      knownCost: roundMoney(item.knownCost),
      complete: item.complete
    }));

    res.json({
      grossRevenue,
      refunds,
      revenue,
      cogs,
      knownCogs,
      grossProfit,
      profitMargin,
      costComplete,
      costCoveragePct: totalSalesLines > 0 ? (completeSalesLines / totalSalesLines) * 100 : 100,
      missingCostItems: [...missingCostItems].sort(),
      ingredients
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
      commands.push(Buffer.from(`VAT: ${vatStr.padStart(27, ' ')}\n`));
      
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

async function shutdown(signal) {
  console.log(`[SHUTDOWN] ${signal}`);
  await new Promise((resolve) => httpServer.close(resolve));
  await Promise.allSettled([
    prisma.$disconnect(),
    realtimePool?.end()
  ]);
  process.exit(0);
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

setupRealtimeAdapter()
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[REALTIME_STARTUP_ERROR]', err);
    process.exit(1);
  });
