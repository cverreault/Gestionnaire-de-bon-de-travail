import { PrismaClient, Role, WorkOrderType, WorkOrderStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { seedTaskTypes } from './seed-task-types';
import { seedClientTypes } from './seed-client-types';
import { seedAddressTypes } from './seed-address-types';

if (process.env.NODE_ENV === 'production') {
  console.warn('Seed is disabled in production');
  process.exit(0);
}

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const SALT_ROUNDS = 10;

  // ── Admin user ────────────────────────────────────────────────────────────
  const adminPassword = await bcrypt.hash('admin123!', SALT_ROUNDS);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@taskmgr.local' },
    update: {},
    create: {
      email: 'admin@taskmgr.local',
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'Dispatcher',
      role: Role.ADMIN,
      isActive: true,
      phone: '0600000001',
    },
  });
  console.log(`✅ Admin: ${admin.email}`);

  // ── Technician users ──────────────────────────────────────────────────────
  const techPassword = await bcrypt.hash('tech123!', SALT_ROUNDS);
  const tech1 = await prisma.user.upsert({
    where: { email: 'tech1@taskmgr.local' },
    update: {},
    create: {
      email: 'tech1@taskmgr.local',
      password: techPassword,
      firstName: 'Jean',
      lastName: 'Dupont',
      role: Role.TECHNICIAN,
      isActive: true,
      phone: '0600000002',
    },
  });

  const tech2 = await prisma.user.upsert({
    where: { email: 'tech2@taskmgr.local' },
    update: {},
    create: {
      email: 'tech2@taskmgr.local',
      password: techPassword,
      firstName: 'Marie',
      lastName: 'Martin',
      role: Role.TECHNICIAN,
      isActive: true,
      phone: '0600000003',
    },
  });
  console.log(`✅ Technicians: ${tech1.email}, ${tech2.email}`);

  // ── Temporary client ──────────────────────────────────────────────────────
  const client = await prisma.temporaryClient.create({
    data: {
      firstName: 'Pierre',
      lastName: 'Durand',
      email: 'pierre.durand@exemple.fr',
      phone: '0601020304',
      address: '12 Rue de la Paix',
      city: 'Paris',
      postalCode: '75001',
    },
  });
  console.log(`✅ Client: ${client.firstName} ${client.lastName}`);

  // ── Sample work orders ────────────────────────────────────────────────────
  const wo1 = await prisma.workOrder.create({
    data: {
      referenceNumber: 'BT-2026-0001',
      title: 'Installation chaudière',
      description: 'Installation d\'une nouvelle chaudière gaz condensation.',
      type: WorkOrderType.INSTALLATION,
      status: WorkOrderStatus.DISPATCHED,
      priority: 1,
      temporaryClientId: client.id,
      clientAddress: '12 Rue de la Paix, 75001 Paris',
      assignedToId: tech1.id,
      createdById: admin.id,
      scheduledDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
      scheduledStartTime: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000 + 8 * 3600 * 1000),
      scheduledEndTime: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000 + 12 * 3600 * 1000),
      dispatchedAt: new Date(),
    },
  });

  const wo2 = await prisma.workOrder.create({
    data: {
      referenceNumber: 'BT-2026-0002',
      title: 'Réparation fuite eau',
      description: 'Fuite d\'eau sous évier cuisine.',
      type: WorkOrderType.REPAIR,
      status: WorkOrderStatus.CREATED,
      priority: 2,
      externalClientId: 'EXT-12345',
      externalClientName: 'Société Exemple SAS',
      clientAddress: '45 Avenue des Fleurs, 69001 Lyon',
      createdById: admin.id,
      scheduledDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    },
  });

  const wo3 = await prisma.workOrder.create({
    data: {
      referenceNumber: 'BT-2026-0003',
      title: 'Maintenance annuelle climatisation',
      type: WorkOrderType.MAINTENANCE,
      status: WorkOrderStatus.ASSIGNED,
      priority: 0,
      externalClientName: 'Résidence Les Pins',
      clientAddress: '8 Boulevard du Lac, 33000 Bordeaux',
      assignedToId: tech2.id,
      createdById: admin.id,
      scheduledDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  console.log(`✅ Work orders: ${wo1.referenceNumber}, ${wo2.referenceNumber}, ${wo3.referenceNumber}`);

  // ── Notes ─────────────────────────────────────────────────────────────────
  await prisma.note.create({
    data: {
      content: 'Matériel commandé, livraison prévue lundi matin.',
      workOrderId: wo1.id,
      authorId: admin.id,
    },
  });

  console.log('✅ Notes created');

  // ── Task types ────────────────────────────────────────────────────────────
  await seedTaskTypes(prisma);

  // ── Client types ──────────────────────────────────────────────────────────
  await seedClientTypes(prisma);

  // ── Address types ─────────────────────────────────────────────────────────
  await seedAddressTypes(prisma);

  console.log('\n🎉 Seed completed successfully!');
  console.log('\n📋 Credentials:');
  console.log('   Admin:       admin@taskmgr.local / admin123!');
  console.log('   Tech 1:      tech1@taskmgr.local / tech123!');
  console.log('   Tech 2:      tech2@taskmgr.local / tech123!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
