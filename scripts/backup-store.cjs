const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('../server/node_modules/dotenv');
const { PrismaClient } = require('../server/node_modules/@prisma/client');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', 'server', '.env') });

const prisma = new PrismaClient();

function readArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function sanitizeUser(user) {
  const { password: _password, pin: _pin, pinHash: _pinHash, ...safeUser } = user;
  return {
    ...safeUser,
    hasPin: Boolean(user.pin || user.pinHash),
  };
}

function safeJson(value) {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

function sanitizeIntegration(record) {
  return {
    provider: record.provider,
    category: record.category,
    isEnabled: record.isEnabled,
    config: safeJson(record.config),
    hasSecrets: Boolean(record.secrets),
    updatedAt: record.updatedAt,
  };
}

async function main() {
  const storeCode = readArg('--store-code');
  const storeIdArg = readArg('--store-id');
  const outDir = readArg('--out', path.join(process.cwd(), 'backups'));

  if (!storeCode && !storeIdArg) {
    throw new Error('Missing --store-code or --store-id');
  }

  const store = await prisma.store.findFirst({
    where: storeCode ? { code: storeCode } : { id: storeIdArg },
  });
  if (!store) {
    throw new Error('Store not found');
  }

  const storeId = store.id;
  const [
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
    auditLogs,
  ] = await Promise.all([
    prisma.user.findMany({ where: { storeId }, orderBy: { name: 'asc' } }),
    prisma.product.findMany({ where: { storeId }, include: { recipes: true }, orderBy: { name: 'asc' } }),
    prisma.table.findMany({ where: { storeId }, orderBy: { name: 'asc' } }),
    prisma.inventory.findMany({ where: { storeId }, orderBy: { name: 'asc' } }),
    prisma.supplier.findMany({ where: { storeId }, orderBy: { name: 'asc' } }),
    prisma.stockTransaction.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' } }),
    prisma.customer.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' } }),
    prisma.voucher.findMany({ where: { storeId }, orderBy: { code: 'asc' } }),
    prisma.order.findMany({ where: { storeId }, include: { items: true, payments: true }, orderBy: { timestamp: 'desc' } }),
    prisma.returnOrder.findMany({ where: { storeId }, include: { items: true }, orderBy: { createdAt: 'desc' } }),
    prisma.heldOrder.findMany({ where: { storeId }, include: { items: true }, orderBy: { createdAt: 'desc' } }),
    prisma.promotion.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' } }),
    prisma.attendance.findMany({ where: { storeId }, orderBy: { clockIn: 'desc' } }),
    prisma.cashShift.findMany({ where: { storeId }, orderBy: { openedAt: 'desc' } }),
    prisma.storeIntegration.findMany({ where: { storeId }, orderBy: { provider: 'asc' } }),
    prisma.auditLog.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' } }),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    version: '1.1',
    backupType: 'store-json',
    storeId,
    store,
    users: users.map(sanitizeUser),
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
    integrations: integrations.map(sanitizeIntegration),
    auditLogs,
  };

  fs.mkdirSync(outDir, { recursive: true });
  const safeCode = store.code.replace(/[^a-zA-Z0-9._-]/g, '-');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(outDir, `manager-coffee-${safeCode}-${stamp}.json`);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));

  console.log(`Backup written: ${filePath}`);
  console.log(`Products=${products.length}, Orders=${orders.length}, Inventory=${inventory.length}`);
}

main()
  .catch((error) => {
    console.error(error.stack || String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
