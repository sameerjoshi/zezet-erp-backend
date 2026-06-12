// Idempotent seed: the six RBAC roles + one admin user.
// Safe to run repeatedly — uses upserts keyed on unique columns, so it never duplicates.
// Run with: pnpm db:seed
import {
  LogStatus,
  PrismaClient,
  RoleKey,
  TruckStatus,
  UserStatus,
  WorkerType,
} from '@prisma/client';
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

  // 4) Sample master data so the frontend has something to render.
  await seedMasterData();

  // 5) Sample operations data (daily logs + trips) for today.
  await seedOperations();

  const roleCount = await prisma.role.count();
  console.log(`Seed complete: ${roleCount} roles ensured.`);
  console.log(`Admin user "${ADMIN_USERNAME}" ready (password from SEED_ADMIN_PASSWORD, default "admin123").`);
}

// Sample trucks, workers, clients + one rate card with rates. Idempotent:
// trucks/clients upsert on their unique code; workers/rate-cards/rates have no
// natural unique key, so we find-or-create on a stable business tuple.
async function seedMasterData(): Promise<void> {
  // Trucks — unique `code`.
  const trucks = [
    { code: 'Camión 1', plate: 'PA-0001', year: 2018, sizeFt: 24 },
    { code: 'Camión 2', plate: 'PA-0002', year: 2020, sizeFt: 26 },
    { code: 'Camión 3', plate: 'PA-0003', year: 2021, sizeFt: 20 },
  ];
  for (const t of trucks) {
    await prisma.truck.upsert({
      where: { code: t.code },
      update: {},
      create: { ...t, status: TruckStatus.active, purchasePrice: 45000 },
    });
  }

  // Workers — no unique business key; find-or-create by fullName.
  const workers = [
    { fullName: 'Juan Pérez', type: WorkerType.employee, canDrive: true, canHelp: false },
    { fullName: 'Luis Gómez', type: WorkerType.contractor, canDrive: true, canHelp: true },
    { fullName: 'Marco Díaz', type: WorkerType.contractor, canDrive: false, canHelp: true },
  ];
  for (const w of workers) {
    const existing = await prisma.worker.findFirst({
      where: { fullName: w.fullName },
    });
    if (!existing) {
      await prisma.worker.create({
        data: { ...w, status: UserStatus.active },
      });
    }
  }

  // Clients — unique `code`.
  const clients = [
    { code: 'SELVA', name: 'Distribuidora La Selva', billingFrequency: 'monthly' },
    { code: 'COSTA', name: 'Comercial Costa Azul', billingFrequency: 'weekly' },
  ];
  for (const c of clients) {
    await prisma.client.upsert({
      where: { code: c.code },
      update: {},
      create: { ...c, status: UserStatus.active },
    });
  }

  // One rate card (with rates) for the first client — drives the lookup demo.
  const selva = await prisma.client.findUniqueOrThrow({
    where: { code: 'SELVA' },
  });
  const cardName = 'Standard 2026';
  let card = await prisma.rateCard.findFirst({
    where: { clientId: selva.id, name: cardName },
  });
  if (!card) {
    card = await prisma.rateCard.create({
      data: { clientId: selva.id, name: cardName, status: UserStatus.active },
    });
  }

  const rates = [
    { label: 'Ciudad → Colón', clientPrice: 350, driverPay: 120, helperPay: 60 },
    { label: 'Ciudad → David', clientPrice: 600, driverPay: 200, helperPay: 100 },
  ];
  for (const r of rates) {
    const existing = await prisma.rate.findFirst({
      where: { rateCardId: card.id, label: r.label },
    });
    if (!existing) {
      await prisma.rate.create({ data: { rateCardId: card.id, ...r } });
    }
  }
}

// Two daily logs for today (one confirmed with two trips, one draft with one),
// so the operations dashboard + trip list have data. Idempotent: find-or-create
// on the unique (date, truckId); trips are only created when the log is new.
async function seedOperations(): Promise<void> {
  const truck1 = await prisma.truck.findUnique({ where: { code: 'Camión 1' } });
  const truck2 = await prisma.truck.findUnique({ where: { code: 'Camión 2' } });
  const selva = await prisma.client.findUnique({ where: { code: 'SELVA' } });
  const driver = await prisma.worker.findFirst({
    where: { fullName: 'Juan Pérez' },
  });
  const helper = await prisma.worker.findFirst({
    where: { fullName: 'Marco Díaz' },
  });
  if (!truck1 || !truck2 || !selva || !driver || !helper) {
    return;
  }

  const card = await prisma.rateCard.findFirst({
    where: { clientId: selva.id, name: 'Standard 2026' },
  });
  const rateColon = card
    ? await prisma.rate.findFirst({
        where: { rateCardId: card.id, label: 'Ciudad → Colón' },
      })
    : null;
  const rateDavid = card
    ? await prisma.rate.findFirst({
        where: { rateCardId: card.id, label: 'Ciudad → David' },
      })
    : null;

  // Today at UTC midnight — matches the @db.Date column deterministically.
  const now = new Date();
  const date = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  // Log 1 — confirmed, two trips (one with a helper, one without).
  const existing1 = await prisma.dailyTruckLog.findUnique({
    where: { date_truckId: { date, truckId: truck1.id } },
  });
  if (!existing1) {
    const log = await prisma.dailyTruckLog.create({
      data: {
        date,
        truckId: truck1.id,
        fuelCost: 45,
        odometerStart: 120000,
        odometerEnd: 120140,
        status: LogStatus.confirmed,
      },
    });
    await prisma.trip.create({
      data: {
        dailyLogId: log.id,
        seq: 1,
        clientId: selva.id,
        routeLabel: 'Ciudad → Colón',
        billAmount: rateColon?.clientPrice ?? 350,
        driverWorkerId: driver.id,
        helperWorkerId: helper.id,
        driverPay: rateColon?.driverPay ?? 120,
        helperPay: rateColon?.helperPay ?? 60,
        rateId: rateColon?.id,
      },
    });
    await prisma.trip.create({
      data: {
        dailyLogId: log.id,
        seq: 2,
        clientId: selva.id,
        routeLabel: 'Ciudad → David',
        billAmount: rateDavid?.clientPrice ?? 600,
        driverWorkerId: driver.id,
        driverPay: rateDavid?.driverPay ?? 200,
        helperPay: rateDavid?.helperPay ?? 100,
        rateId: rateDavid?.id,
      },
    });
  }

  // Log 2 — draft, one trip.
  const existing2 = await prisma.dailyTruckLog.findUnique({
    where: { date_truckId: { date, truckId: truck2.id } },
  });
  if (!existing2) {
    const log = await prisma.dailyTruckLog.create({
      data: { date, truckId: truck2.id, fuelCost: 30, odometerStart: 98000 },
    });
    await prisma.trip.create({
      data: {
        dailyLogId: log.id,
        seq: 1,
        clientId: selva.id,
        routeLabel: 'Ciudad → Colón',
        billAmount: rateColon?.clientPrice ?? 350,
        driverWorkerId: driver.id,
        helperWorkerId: helper.id,
        driverPay: rateColon?.driverPay ?? 120,
        helperPay: rateColon?.helperPay ?? 60,
        rateId: rateColon?.id,
      },
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
