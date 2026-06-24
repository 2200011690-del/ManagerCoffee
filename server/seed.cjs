const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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
  { name: 'T1', zone: 'Trong nhà', capacity: 2 },
  { name: 'T2', zone: 'Trong nhà', capacity: 2 },
  { name: 'T3', zone: 'Trong nhà', capacity: 4 },
  { name: 'T4', zone: 'Trong nhà', capacity: 4 },
  { name: 'T5', zone: 'Trong nhà', capacity: 6 },
  { name: 'V1', zone: 'Ngoài sân', capacity: 4 },
  { name: 'V2', zone: 'Ngoài sân', capacity: 4 },
  { name: 'V3', zone: 'Ngoài sân', capacity: 2 },
  { name: 'V4', zone: 'Ngoài sân', capacity: 6 },
  { name: 'VIP1', zone: 'Tầng 2', capacity: 8 },
  { name: 'VIP2', zone: 'Tầng 2', capacity: 12 },
];

const INITIAL_INVENTORY = [
  { name: 'Cà phê Arabica', unit: 'kg', qty: 25.5, minQty: 5, icon: 'Package' },
  { name: 'Cà phê Robusta', unit: 'kg', qty: 12.0, minQty: 5, icon: 'Package' },
  { name: 'Sữa tươi', unit: 'lít', qty: 45.0, minQty: 10, icon: 'Package' },
  { name: 'Sữa đặc', unit: 'lon', qty: 24.0, minQty: 10, icon: 'Package' },
  { name: 'Trà đen', unit: 'kg', qty: 8.5, minQty: 2, icon: 'Package' },
  { name: 'Đường cát', unit: 'kg', qty: 30.0, minQty: 10, icon: 'Package' },
  { name: 'Bột Matcha', unit: 'kg', qty: 2.5, minQty: 1, icon: 'Package' },
];

async function main() {
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
    update: {},
    create: { storeId, name: 'Admin Trần', pin: '1111', role: 'admin' },
  });

  await prisma.user.upsert({
    where: { storeId_pin: { storeId, pin: '2222' } },
    update: {},
    create: { storeId, name: 'NV Linh', pin: '2222', role: 'staff' },
  });

  // 3. Tables
  for (const t of INITIAL_TABLES) {
    // We don't have a unique key for tables yet, so we just check if it exists loosely by name and storeId
    const existingTable = await prisma.table.findFirst({ where: { storeId, name: t.name } });
    if (!existingTable) {
      await prisma.table.create({ data: { ...t, storeId } });
    }
  }

  // 4. Inventory
  for (const inv of INITIAL_INVENTORY) {
    const existingInv = await prisma.inventory.findFirst({ where: { storeId, name: inv.name } });
    if (!existingInv) {
      await prisma.inventory.create({ data: { ...inv, storeId } });
    }
  }

  // 5. Products
  for (const m of INITIAL_MENU) {
    const existingProd = await prisma.product.findFirst({ where: { storeId, name: m.name } });
    if (!existingProd) {
      await prisma.product.create({ data: { ...m, storeId } });
    }
  }

  // 6. Initial Customers
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

  // 7. Initial Vouchers
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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
