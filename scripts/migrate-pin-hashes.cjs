const { PrismaClient } = require('../server/node_modules/@prisma/client');
const bcrypt = require('../server/node_modules/bcryptjs');

const prisma = new PrismaClient();
const BCRYPT_HASH_RE = /^\$2[aby]\$\d{2}\$/;

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const users = await prisma.user.findMany({
    where: {
      pin: { not: null }
    },
    select: {
      id: true,
      storeId: true,
      name: true,
      role: true,
      pin: true,
      pinHash: true
    }
  });

  const result = {
    dryRun,
    scanned: users.length,
    migrated: 0,
    clearedPlainPin: 0,
    skippedNoPin: 0
  };

  for (const user of users) {
    if (!user.pin) {
      result.skippedNoPin += 1;
      continue;
    }

    const nextPinHash = user.pinHash || (
      BCRYPT_HASH_RE.test(user.pin)
        ? user.pin
        : await bcrypt.hash(user.pin, 10)
    );

    if (!dryRun) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          pin: null,
          pinHash: nextPinHash
        }
      });
    }

    if (user.pinHash) result.clearedPlainPin += 1;
    else result.migrated += 1;
  }

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
