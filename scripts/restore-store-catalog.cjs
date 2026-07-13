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

function hasFlag(name) {
  return process.argv.includes(name);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function nullableDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function main() {
  const filePath = readArg('--file');
  const storeCode = readArg('--store-code');
  const confirmStoreCode = readArg('--confirm-store-code');
  const dryRun = hasFlag('--dry-run');

  if (!filePath || !storeCode) {
    throw new Error('Usage: node scripts/restore-store-catalog.cjs --file <backup.json> --store-code <code> --confirm-store-code <code> [--dry-run]');
  }

  const resolvedFile = path.resolve(filePath);
  const backup = JSON.parse(fs.readFileSync(resolvedFile, 'utf8'));
  const store = await prisma.store.findUnique({ where: { code: storeCode } });
  if (!store) throw new Error('Target store not found');
  if (confirmStoreCode !== store.code) {
    throw new Error(`Safety check failed. --confirm-store-code must be exactly "${store.code}"`);
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
    recipes: products.reduce((sum, product) => sum + safeArray(product.recipes).length, 0),
  };

  if (dryRun) {
    console.log(JSON.stringify({ dryRun: true, wouldRestore: summary }, null, 2));
    return;
  }

  const storeId = store.id;
  await prisma.$transaction(async (tx) => {
    const existingProducts = await tx.product.findMany({
      where: { storeId },
      select: { id: true },
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
        name: sourceStore.name || store.name,
        address: sourceStore.address ?? store.address,
        phone: sourceStore.phone ?? store.phone,
        logo: sourceStore.logo ?? store.logo,
        vatRate: Number.isFinite(Number(sourceStore.vatRate)) ? Number(sourceStore.vatRate) : store.vatRate,
        pointsRate: Number.isFinite(Number(sourceStore.pointsRate)) ? Number(sourceStore.pointsRate) : store.pointsRate,
        currency: sourceStore.currency || store.currency,
        printHeader: sourceStore.printHeader ?? store.printHeader,
        printFooter: sourceStore.printFooter ?? store.printFooter,
        bankId: sourceStore.bankId ?? store.bankId,
        bankAccountNo: sourceStore.bankAccountNo ?? store.bankAccountNo,
        bankAccountName: sourceStore.bankAccountName ?? store.bankAccountName,
      },
    });

    if (tables.length > 0) {
      await tx.table.createMany({
        data: tables.map((table) => ({
          id: table.id || undefined,
          storeId,
          name: table.name || 'Table',
          zone: table.zone || 'Main',
          capacity: Number(table.capacity) || 2,
          status: table.status || 'available',
          occupiedSince: table.occupiedSince || null,
        })),
      });
    }

    if (suppliers.length > 0) {
      await tx.supplier.createMany({
        data: suppliers.map((supplier) => ({
          id: supplier.id || undefined,
          storeId,
          name: supplier.name || 'Supplier',
          phone: supplier.phone || null,
          email: supplier.email || null,
          address: supplier.address || null,
          createdAt: nullableDate(supplier.createdAt) || new Date(),
        })),
      });
    }

    if (inventory.length > 0) {
      await tx.inventory.createMany({
        data: inventory.map((item) => ({
          id: item.id || undefined,
          storeId,
          name: item.name || 'Ingredient',
          unit: item.unit || 'unit',
          qty: Number(item.qty) || 0,
          minQty: Number(item.minQty) || 0,
          avgCost: item.avgCost === null || item.avgCost === undefined ? null : Number(item.avgCost),
          icon: item.icon || null,
        })),
      });
    }

    if (products.length > 0) {
      await tx.product.createMany({
        data: products.map((product) => ({
          id: product.id || undefined,
          storeId,
          name: product.name || 'Product',
          price: Number(product.price) || 0,
          category: product.category || 'Other',
          description: product.description || null,
          image: product.image || null,
          popular: Boolean(product.popular),
          prepTime: product.prepTime || '5 minutes',
          hidden: Boolean(product.hidden),
        })),
      });

      const recipeRows = products.flatMap((product) =>
        safeArray(product.recipes)
          .filter((recipe) => recipe.productId && recipe.inventoryId)
          .map((recipe) => ({
            id: recipe.id || undefined,
            productId: recipe.productId,
            inventoryId: recipe.inventoryId,
            qty: Number(recipe.qty) || 0,
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
          isActive: voucher.isActive !== false,
          maxUses: Number.isInteger(Number(voucher.maxUses)) && Number(voucher.maxUses) > 0 ? Number(voucher.maxUses) : null,
          maxUsesPerCustomer: Number.isInteger(Number(voucher.maxUsesPerCustomer)) && Number(voucher.maxUsesPerCustomer) > 0 ? Number(voucher.maxUsesPerCustomer) : null,
          usedCount: Number.isInteger(Number(voucher.usedCount)) && Number(voucher.usedCount) >= 0 ? Number(voucher.usedCount) : 0,
        })).filter((voucher) => voucher.code),
      });
    }

    if (promotions.length > 0) {
      await tx.promotion.createMany({
        data: promotions.map((promotion) => ({
          id: promotion.id || undefined,
          storeId,
          name: promotion.name || 'Promotion',
          type: promotion.type || 'HAPPY_HOUR',
          conditions: typeof promotion.conditions === 'string' ? promotion.conditions : JSON.stringify(promotion.conditions || {}),
          rewards: typeof promotion.rewards === 'string' ? promotion.rewards : JSON.stringify(promotion.rewards || {}),
          startDate: nullableDate(promotion.startDate),
          endDate: nullableDate(promotion.endDate),
          isActive: promotion.isActive !== false,
          createdAt: nullableDate(promotion.createdAt) || new Date(),
        })),
      });
    }

    await tx.auditLog.create({
      data: {
        storeId,
        action: 'restore',
        entity: 'backupCatalog',
        entityId: storeId,
        metadata: JSON.stringify({ source: resolvedFile, ...summary }),
      },
    });
  }, { maxWait: 10000, timeout: 30000 });

  console.log(JSON.stringify({ restored: summary }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.stack || String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
