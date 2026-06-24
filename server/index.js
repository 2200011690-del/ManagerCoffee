import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';

dotenv.config();

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

  // Deduct ingredients from database recipes
  try {
    for (const c of cart) {
      const recipeItems = await prisma.recipeItem.findMany({
        where: { productId: c.id },
        include: { inventory: true }
      });
      
      for (const recipe of recipeItems) {
        const amount = recipe.qty * c.qty;
        
        // Decrement inventory qty
        const updatedInventory = await prisma.inventory.update({
          where: { id: recipe.inventoryId },
          data: { qty: { decrement: amount } }
        });
        
        // Create SALE transaction
        await prisma.stockTransaction.create({
          data: {
            storeId,
            inventoryId: recipe.inventoryId,
            type: 'SALE',
            qtyChange: -amount,
            balance: updatedInventory.qty,
            note: `Bán hàng - HĐ ${orderNumber} (${c.name} x${c.qty})`
          }
        });
      }
    }
  } catch (err) {
    console.error('Error deducting inventory:', err);
  }

  broadcast('orderCreated', order, storeId);
  broadcast('inventoryUpdated', await prisma.inventory.findMany({ where: { storeId } }), storeId);

  res.json(order);
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

const INITIAL_SUPPLIERS = [
  { name: 'Cty Sữa Cát Tường', phone: '0912888999', email: 'cattuong@milk.vn', address: 'KCN Sóng Thần, Bình Dương' },
  { name: 'Nhà phân phối Cà phê Hải Hà', phone: '0903111222', email: 'haihacoffee@gmail.com', address: '45 Lê Văn Sỹ, Q.3, TP.HCM' },
  { name: 'Chợ Đầu Mối Bình Điền (Đường & Trà)', phone: '0987654321', email: 'binhdienmarket@hcm.gov.vn', address: 'Quận 8, TP.HCM' },
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

    broadcast('inventoryUpdated', await prisma.inventory.findMany({ where: { storeId }, orderBy: { name: 'asc' } }), storeId);
    res.json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update ingredient
app.put('/api/inventory/:id', async (req, res) => {
  const storeId = req.storeId;
  const { id } = req.params;
  const { name, unit, minQty, icon } = req.body;
  try {
    const item = await prisma.inventory.update({
      where: { id, storeId },
      data: {
        name,
        unit,
        minQty: Number(minQty) || 0,
        icon
      }
    });
    broadcast('inventoryUpdated', await prisma.inventory.findMany({ where: { storeId }, orderBy: { name: 'asc' } }), storeId);
    res.json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete ingredient
app.delete('/api/inventory/:id', async (req, res) => {
  const storeId = req.storeId;
  const { id } = req.params;
  try {
    await prisma.inventory.delete({
      where: { id, storeId }
    });
    broadcast('inventoryUpdated', await prisma.inventory.findMany({ where: { storeId }, orderBy: { name: 'asc' } }), storeId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Import stock (Nhập hàng)
app.post('/api/inventory/import', async (req, res) => {
  const storeId = req.storeId;
  const { inventoryId, qty, cost, supplierId, note } = req.body;
  try {
    const ingredient = await prisma.inventory.findUnique({
      where: { id: inventoryId }
    });
    if (!ingredient) return res.status(404).json({ error: 'Nguyên liệu không tồn tại' });

    const newQty = ingredient.qty + Number(qty);
    const updated = await prisma.inventory.update({
      where: { id: inventoryId },
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

    broadcast('inventoryUpdated', await prisma.inventory.findMany({ where: { storeId }, orderBy: { name: 'asc' } }), storeId);
    res.json(transaction);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Adjust stock (Kiểm kho)
app.post('/api/inventory/adjust', async (req, res) => {
  const storeId = req.storeId;
  const { inventoryId, actualQty, note } = req.body;
  try {
    const ingredient = await prisma.inventory.findUnique({
      where: { id: inventoryId }
    });
    if (!ingredient) return res.status(404).json({ error: 'Nguyên liệu không tồn tại' });

    const oldQty = ingredient.qty;
    const diff = Number(actualQty) - oldQty;

    await prisma.inventory.update({
      where: { id: inventoryId },
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

    broadcast('inventoryUpdated', await prisma.inventory.findMany({ where: { storeId }, orderBy: { name: 'asc' } }), storeId);
    res.json(transaction);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Reset Inventory to default seeded values
app.post('/api/inventory/reset', async (req, res) => {
  const storeId = req.storeId;
  try {
    await prisma.stockTransaction.deleteMany({ where: { storeId } });
    await prisma.recipeItem.deleteMany({ where: { product: { storeId } } });
    await prisma.inventory.deleteMany({ where: { storeId } });
    await prisma.supplier.deleteMany({ where: { storeId } });
    
    const suppliersMap = {};
    for (const s of INITIAL_SUPPLIERS) {
      const supplier = await prisma.supplier.create({ data: { ...s, storeId } });
      suppliersMap[s.name] = supplier.id;
    }

    const inventoryMap = {};
    for (const inv of INITIAL_INVENTORY) {
      const existingInv = await prisma.inventory.create({ data: { ...inv, storeId } });
      
      let supplierId = null;
      if (inv.name.includes('Sữa')) {
        supplierId = suppliersMap['Cty Sữa Cát Tường'];
      } else if (inv.name.includes('Cà phê')) {
        supplierId = suppliersMap['Nhà phân phối Cà phê Hải Hà'];
      } else {
        supplierId = suppliersMap['Chợ Đầu Mối Bình Điền (Đường & Trà)'];
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

    broadcast('inventoryUpdated', await prisma.inventory.findMany({ where: { storeId }, orderBy: { name: 'asc' } }), storeId);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

// Get stock transaction history
app.get('/api/inventory/transactions', async (req, res) => {
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
    res.json(supplier);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/suppliers/:id', async (req, res) => {
  const storeId = req.storeId;
  const { id } = req.params;
  const { name, phone, email, address } = req.body;
  try {
    const supplier = await prisma.supplier.update({
      where: { id, storeId },
      data: {
        name,
        phone,
        email,
        address
      }
    });
    res.json(supplier);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/suppliers/:id', async (req, res) => {
  const storeId = req.storeId;
  const { id } = req.params;
  try {
    await prisma.supplier.delete({
      where: { id, storeId }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Product Recipe APIs
app.get('/api/products/:productId/recipe', async (req, res) => {
  const { productId } = req.params;
  try {
    const recipeItems = await prisma.recipeItem.findMany({
      where: { productId },
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
  const { productId } = req.params;
  const { ingredients } = req.body; // array of { inventoryId, qty }
  try {
    // Delete existing recipe items
    await prisma.recipeItem.deleteMany({
      where: { productId }
    });

    // Create new recipe items
    const created = [];
    for (const ing of ingredients) {
      if (Number(ing.qty) <= 0) continue;
      const item = await prisma.recipeItem.create({
        data: {
          productId,
          inventoryId: ing.inventoryId,
          qty: Number(ing.qty)
        },
        include: {
          inventory: true
        }
      });
      created.push(item);
    }
    res.json(created);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
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
