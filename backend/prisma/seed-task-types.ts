import { PrismaClient } from '@prisma/client';

/**
 * Seed the task_types table with the 5 default task types.
 * Uses upsert (keyed on `name`) to remain idempotent across re-runs.
 */
export async function seedTaskTypes(prisma: PrismaClient): Promise<void> {
  const taskTypes = [
    {
      name: 'Installation',
      prefix: 'INST',
      description: 'Installation de nouveaux équipements ou systèmes',
      color: '#3B82F6',
      icon: 'tool',
    },
    {
      name: 'Réparation',
      prefix: 'REP',
      description: 'Réparation et remise en état d\'équipements défectueux',
      color: '#EF4444',
      icon: 'wrench',
    },
    {
      name: 'Maintenance',
      prefix: 'MNT',
      description: 'Entretien préventif et maintenance régulière',
      color: '#F59E0B',
      icon: 'settings',
    },
    {
      name: 'Inspection',
      prefix: 'INSP',
      description: 'Inspection et vérification de conformité',
      color: '#8B5CF6',
      icon: 'search',
    },
    {
      name: 'Autre',
      prefix: 'AUT',
      description: 'Type de tâche non catégorisé',
      color: '#6B7280',
      icon: 'more-horizontal',
    },
  ];

  for (const taskType of taskTypes) {
    await prisma.taskType.upsert({
      where: { name: taskType.name },
      update: {
        description: taskType.description,
        color: taskType.color,
        icon: taskType.icon,
      },
      create: {
        ...taskType,
        isActive: true,
      },
    });
  }

  console.log(`✅ Task types seeded: ${taskTypes.map((t) => t.name).join(', ')}`);
}
