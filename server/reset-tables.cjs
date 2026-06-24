// Script xóa bàn cũ và tạo lại với zone đúng
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const STORE_CODE = 'espresso-lab';

const NEW_TABLES = [
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

async function main() {
  const store = await prisma.store.findUnique({ where: { code: STORE_CODE } });
  if (!store) {
    console.error('Store not found!');
    return;
  }

  // Xóa toàn bộ bàn cũ
  const deleted = await prisma.table.deleteMany({ where: { storeId: store.id } });
  console.log(`Đã xóa ${deleted.count} bàn cũ`);

  // Tạo bàn mới
  for (const t of NEW_TABLES) {
    await prisma.table.create({ data: { ...t, storeId: store.id } });
  }
  console.log(`Đã tạo ${NEW_TABLES.length} bàn mới với zone đúng`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
