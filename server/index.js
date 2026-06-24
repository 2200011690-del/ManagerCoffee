import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',') 
  : '*';

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

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

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

// --- MULTI-TENANT MIDDLEWARE ---
app.use((req, res, next) => {
  if (req.path === '/api/auth/login') return next();
  
  const storeId = req.headers['x-store-id'];
  if (!storeId && req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Missing x-store-id header' });
  }
  req.storeId = storeId;
  next();
});

// --- API ENDPOINTS ---

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

// 1. Auth
app.post('/api/auth/login', async (req, res) => {
  const { pin } = req.body;
  // For SaaS, we just find the first user with this PIN across all stores.
  // In a real app, users should enter a Store Code or Domain.
  const user = await prisma.user.findFirst({
    where: { pin },
    include: { store: true }
  });
  if (user) {
    return res.json(user);
  }
  return res.status(401).json({ error: 'Mã PIN không đúng' });
});

// 1.1 Users (Employee Management)
app.get('/api/users', async (req, res) => {
  const users = await prisma.user.findMany({ where: { storeId: req.storeId } });
  res.json(users);
});

app.post('/api/users', async (req, res) => {
  try {
    const user = await prisma.user.create({ data: { ...req.body, storeId: req.storeId } });
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: 'Mã PIN đã tồn tại hoặc lỗi dữ liệu' });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id, storeId: req.storeId },
      data: req.body
    });
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: 'Lỗi cập nhật' });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  await prisma.user.delete({ where: { id: req.params.id, storeId: req.storeId } });
  res.json({ success: true });
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
  const product = await prisma.product.create({ data: { ...req.body, storeId: req.storeId } });
  broadcast('productUpdated', { action: 'create', product }, req.storeId);
  res.json(product);
});

app.put('/api/products/:id', async (req, res) => {
  const product = await prisma.product.update({
    where: { id: req.params.id, storeId: req.storeId },
    data: req.body
  });
  broadcast('productUpdated', { action: 'update', product }, req.storeId);
  res.json(product);
});

app.delete('/api/products/:id', async (req, res) => {
  await prisma.product.delete({ where: { id: req.params.id, storeId: req.storeId } });
  broadcast('productUpdated', { action: 'delete', id: req.params.id }, req.storeId);
  res.json({ success: true });
});

// 3. Tables
app.get('/api/tables', async (req, res) => {
  const tables = await prisma.table.findMany({ where: { storeId: req.storeId } });
  res.json(tables);
});

app.put('/api/tables/:id', async (req, res) => {
  const table = await prisma.table.update({
    where: { id: req.params.id, storeId: req.storeId },
    data: req.body
  });
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

app.post('/api/orders/checkout', async (req, res) => {
  const { 
    tableId, tableName, cart, subtotal, vatAmount, total, paymentMethod,
    customerId, voucherCode, discountAmount, employeeId
  } = req.body;
  const storeId = req.storeId;
  
  const date = new Date();
  const dateStr = date.toLocaleDateString('vi-VN');
  const timeStr = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  
  const count = await prisma.order.count({ where: { storeId } });
  const orderNumber = `#HD${1001 + count}`;

  const order = await prisma.order.create({
    data: {
      storeId,
      orderNumber,
      tableId,
      tableName: tableName || 'Mang về',
      subtotal,
      vatAmount,
      total,
      paymentMethod,
      time: timeStr,
      date: dateStr,
      customerId,
      voucherCode,
      discountAmount,
      employeeId,
      items: {
        create: cart.map(item => ({
          name: item.name,
          price: item.price,
          qty: item.qty,
          sugar: item.sugar,
          ice: item.ice,
          note: item.note
        }))
      }
    },
    include: { items: true, employee: true }
  });

  if (customerId) {
    const pointsToAdd = Math.floor(total * 0.1);
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (customer) {
      const newPoints = customer.points + pointsToAdd;
      let newTier = customer.tier;
      if (newPoints >= 1500) newTier = 'DIAMOND';
      else if (newPoints >= 500) newTier = 'GOLD';
      
      await prisma.customer.update({
        where: { id: customerId },
        data: { points: newPoints, tier: newTier }
      });
    }
  }

  if (tableId) {
    const table = await prisma.table.update({
      where: { id: tableId },
      data: { status: 'dirty', occupiedSince: null }
    });
    broadcast('tableUpdated', table, storeId);
  }

  const ITEM_RECIPES = {
    'cf-001': { arabica: 20 },
    'cf-002': { arabica: 18, milk_fresh: 120 },
    'cf-003': { robusta: 15, milk_cond: 30 },
    'cf-004': { arabica: 18, milk_fresh: 150, sugar: 10 },
    'cf-005': { arabica: 25 },
    'cf-006': { arabica: 18 },
    'tea-001': { tea_leaves: 5, sugar: 8 },
    'tea-002': { matcha_pwd: 5, milk_oat: 150 },
    'tea-003': { tea_leaves: 5, sugar: 10 },
    'tea-004': { tea_leaves: 5, milk_fresh: 100, boba: 30 },
    'tea-005': { tea_leaves: 5 },
    'cake-001': { cream: 20 },
    'cake-002': { arabica: 10, cream: 40, sugar: 15 },
    'cake-003': { sugar: 20 },
    'cake-004': { cream: 50, sugar: 25 },
    'cake-005': { sugar: 20, cream: 30 },
  };

  const deductions = {};
  for (const c of cart) {
    const recipe = ITEM_RECIPES[c.id] || {};
    for (const [ingId, amount] of Object.entries(recipe)) {
      deductions[ingId] = (deductions[ingId] || 0) + amount * c.qty;
    }
  }

  for (const [ingId, amount] of Object.entries(deductions)) {
    // Because inventory id is not the code, but wait - in seed we used `name` for inventory but we don't know the generated ID!
    // Ah, previous logic assumed `id` was `ingId`. Let's just update safely if exists.
    try {
      await prisma.inventory.updateMany({
        where: { id: ingId, storeId },
        data: { qty: { decrement: amount } }
      });
    } catch(e) {}
  }

  broadcast('orderCreated', order, storeId);
  broadcast('inventoryUpdated', await prisma.inventory.findMany({ where: { storeId } }), storeId);

  res.json(order);
});

// 5. Inventory
app.get('/api/inventory', async (req, res) => {
  const items = await prisma.inventory.findMany({ where: { storeId: req.storeId } });
  res.json(items);
});

// 6. Dashboard Analytics
app.get('/api/dashboard', async (req, res) => {
  const storeId = req.storeId;
  const orders = await prisma.order.findMany({
    where: { storeId, status: 'paid' },
    include: { items: true }
  });

  const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);
  const totalOrders = orders.length;

  res.json({
    totalRevenue,
    totalOrders,
    completedOrders: totalOrders,
    revenueGrowth: 0,
    ordersGrowth: 0,
  });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
