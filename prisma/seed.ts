// Idempotent seed: the six RBAC roles + one admin user.
// Safe to run repeatedly — uses upserts keyed on unique columns, so it never duplicates.
// Run with: pnpm db:seed
import { PrismaClient, RoleKey } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// Human-readable names for each role key. The frontend renders localized labels;
// these are just stable defaults stored alongside the key.
const ROLES: { key: RoleKey; name: string }[] = [
  { key: RoleKey.admin, name: 'Administrator' },
  { key: RoleKey.finance, name: 'Finance' },
  { key: RoleKey.ops_manager, name: 'Operations Manager' },
  { key: RoleKey.ops_staff, name: 'Operations Staff' },
  { key: RoleKey.driver, name: 'Driver' },
  { key: RoleKey.investor, name: 'Investor' },
];

const ADMIN_USERNAME = 'admin';

async function main(): Promise<void> {
  // 1) Roles — upsert each so re-runs are no-ops.
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { key: role.key },
      update: { name: role.name },
      create: { key: role.key, name: role.name },
    });
  }

  // 2) Admin user — generated username, argon2 hash. Password from env with a dev fallback.
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'admin123';
  const passwordHash = await argon2.hash(password);

  const admin = await prisma.user.upsert({
    where: { username: ADMIN_USERNAME },
    update: {}, // do not reset password/roles on re-run
    create: {
      username: ADMIN_USERNAME,
      passwordHash,
      locale: 'en',
    },
  });

  // 3) Link admin user → admin role (composite-PK upsert, idempotent).
  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { key: RoleKey.admin },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id },
  });

  const roleCount = await prisma.role.count();
  console.log(`Seed complete: ${roleCount} roles ensured.`);
  console.log(`Admin user "${ADMIN_USERNAME}" ready (password from SEED_ADMIN_PASSWORD, default "admin123").`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
