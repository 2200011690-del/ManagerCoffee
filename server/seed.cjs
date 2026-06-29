const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
const DEMO_ADMIN_EMAIL = 'admin@espresso-lab.vn';
const DEMO_ADMIN_PASSWORD = 'admin123456';

const INITIAL_MENU = [
  { name: 'Cà phê Đen', price: 29000, category: 'Cà phê', popular: true, prepTime: '5 phút' },
  { name: 'Cà phê Sữa', price: 35000, category: 'Cà phê', popular: true, prepTime: '5 phút' },
  { name: 'Bạc xỉu', price: 39000, category: 'Cà phê', popular: true, prepTime: '5 phút' },
  { name: 'Cold Brew', price: 45000, category: 'Cà phê', popular: false, prepTime: '3 phút' },
  { name: 'Americano', price: 39000, category: 'Cà phê', popular: false, prepTime: '3 phút' },
  { name: 'Latte', price: 49000, category: 'Cà phê', popular: false, prepTime: '5 phút' },
  
  { name: 'Trà Đào Cam Sả', price: 45000, category: 'Trà', popular: true, prepTime: '5 phút' },
  { name: 'Trà Matcha Latte', price: 49000, category: 'Trà', popular: false, prepTime: '5 phút' },
  { name: 'Trà Olong Sen', price: 45000, category: 'Trà', popular: true, prepTime: '5 phút' },
  { name: 'Hồng Trà Trân Châu', price: 42000, category: 'Trà', popular: true, prepTime: '5 phút' },
  { name: 'Trà Vải', price: 45000, category: 'Trà', popular: false, prepTime: '5 phút' },
  
  { name: 'Bánh Croissant', price: 35000, category: 'Bánh', popular: true, prepTime: '2 phút' },
  { name: 'Tiramisu', price: 49000, category: 'Bánh', popular: true, prepTime: '2 phút' },
  { name: 'Bông Lan Trứng Muối', price: 45000, category: 'Bánh', popular: false, prepTime: '2 phút' },
  { name: 'Mousse Chanh Dây', price: 49000, category: 'Bánh', popular: false, prepTime: '2 phút' },
  { name: 'Cheesecake', price: 55000, category: 'Bánh', popular: false, prepTime: '2 phút' },
];

const INITIAL_TABLES = [
  { name: 'Bàn 1', zone: 'Tầng trệt', capacity: 2 },
  { name: 'Bàn 2', zone: 'Tầng trệt', capacity: 2 },
  { name: 'Bàn 3', zone: 'Tầng trệt', capacity: 4 },
  { name: 'Bàn 4', zone: 'Tầng trệt', capacity: 4 },
  { name: 'Bàn 5', zone: 'Tầng trệt', capacity: 6 },
  { name: 'Bàn 6', zone: 'Lầu 1', capacity: 4 },
  { name: 'Bàn 7', zone: 'Lầu 1', capacity: 4 },
  { name: 'Bàn 8', zone: 'Lầu 1', capacity: 2 },
  { name: 'Bàn 9', zone: 'Sân vườn', capacity: 4 },
  { name: 'Bàn VIP 1', zone: 'Sân vườn', capacity: 8 },
  { name: 'Bàn VIP 2', zone: 'Sân vườn', capacity: 12 },
];

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

async function main() {
  const hashedDemoAdminPassword = await bcrypt.hash(DEMO_ADMIN_PASSWORD, 10);

  // 1. Create a default Store
  const store = await prisma.store.upsert({
    where: { code: 'espresso-lab' },
    update: {},
    create: {
      name: 'Espresso Lab',
      code: 'espresso-lab',
      address: '123 Nguyen Hue, Dist 1, HCMC',
      phone: '0909000111'
    }
  });

  const storeId = store.id;

  // 2. Users
  await prisma.user.upsert({
    where: { storeId_pin: { storeId, pin: '1111' } },
    update: {
      name: 'Admin Trần',
      email: DEMO_ADMIN_EMAIL,
      password: hashedDemoAdminPassword,
      role: 'admin'
    },
    create: {
      storeId,
      name: 'Admin Trần',
      pin: '1111',
      email: DEMO_ADMIN_EMAIL,
      password: hashedDemoAdminPassword,
      role: 'admin'
    },
  });

  await prisma.user.upsert({
    where: { storeId_pin: { storeId, pin: '2222' } },
    update: {},
    create: { storeId, name: 'NV Linh', pin: '2222', role: 'staff' },
  });

  // 3. Tables
  for (const t of INITIAL_TABLES) {
    const existingTable = await prisma.table.findFirst({ where: { storeId, name: t.name } });
    if (!existingTable) {
      await prisma.table.create({ data: { ...t, storeId } });
    }
  }

  // 4. Suppliers
  const suppliersMap = {};
  for (const s of INITIAL_SUPPLIERS) {
    let supplier = await prisma.supplier.findFirst({ where: { storeId, name: s.name } });
    if (!supplier) {
      supplier = await prisma.supplier.create({ data: { ...s, storeId } });
    }
    suppliersMap[s.name] = supplier.id;
  }

  // 5. Inventory & Initial Stock Transactions
  const inventoryMap = {};
  for (const inv of INITIAL_INVENTORY) {
    let existingInv = await prisma.inventory.findFirst({ where: { storeId, name: inv.name } });
    if (!existingInv) {
      existingInv = await prisma.inventory.create({ data: { ...inv, storeId } });
      
      // Determine supplier for transaction record
      let supplierId = null;
      if (inv.name.includes('Sữa')) {
        supplierId = suppliersMap['Cty Sữa Cát Tường'];
      } else if (inv.name.includes('Cà phê')) {
        supplierId = suppliersMap['Nhà phân phối Cà phê Hải Hà'];
      } else {
        supplierId = suppliersMap['Chợ Đầu Mối Bình Điền (Đường & Trà)'];
      }

      // Record initial transaction
      await prisma.stockTransaction.create({
        data: {
          storeId,
          inventoryId: existingInv.id,
          type: 'IMPORT',
          qtyChange: inv.qty,
          balance: inv.qty,
          cost: inv.name.includes('Cà phê') ? 140000 : inv.name.includes('Sữa tươi') ? 28000 : 15000,
          supplierId,
          note: 'Nhập số dư tồn kho ban đầu khi khởi tạo hệ thống'
        }
      });
    }
    inventoryMap[inv.name] = existingInv.id;
  }

  // 6. Products
  const productsMap = {};
  for (const m of INITIAL_MENU) {
    let existingProd = await prisma.product.findFirst({ where: { storeId, name: m.name } });
    if (!existingProd) {
      existingProd = await prisma.product.create({ data: { ...m, storeId } });
    }
    productsMap[m.name] = existingProd.id;
  }

  // 7. Recipe mapping
  for (const [prodName, ingredients] of Object.entries(RECIPE_SEEDS)) {
    const productId = productsMap[prodName];
    if (!productId) continue;

    for (const [ingName, qtyValue] of Object.entries(ingredients)) {
      const inventoryId = inventoryMap[ingName];
      if (!inventoryId) continue;

      const existingRecipe = await prisma.recipeItem.findFirst({
        where: { productId, inventoryId }
      });
      if (!existingRecipe) {
        await prisma.recipeItem.create({
          data: {
            productId,
            inventoryId,
            qty: qtyValue
          }
        });
      }
    }
  }

  // 8. Initial Customers
  await prisma.customer.upsert({
    where: { storeId_phone: { storeId, phone: '0901234567' } },
    update: {},
    create: {
      storeId,
      name: 'Khách VIP',
      phone: '0901234567',
      points: 1600,
      tier: 'DIAMOND',
    },
  });

  // 9. Initial Vouchers
  await prisma.voucher.upsert({
    where: { storeId_code: { storeId, code: 'GIAM10K' } },
    update: {},
    create: {
      storeId,
      code: 'GIAM10K',
      type: 'FIXED',
      value: 10000,
      minOrderValue: 50000,
    },
  });

  await prisma.voucher.upsert({
    where: { storeId_code: { storeId, code: 'SALE20' } },
    update: {},
    create: {
      storeId,
      code: 'SALE20',
      type: 'PERCENT',
      value: 20, // 20%
      minOrderValue: 100000,
      maxDiscount: 50000,
    },
  });

  console.log('Seed completed for store:', store.name);
  console.log(`Demo admin: ${DEMO_ADMIN_EMAIL} / ${DEMO_ADMIN_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
