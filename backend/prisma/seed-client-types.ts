import { PrismaClient } from '@prisma/client';

/**
 * Seed the client_type_configs table with 4 default client types.
 * Uses upsert (keyed on `code`) to remain idempotent across re-runs.
 */
export async function seedClientTypes(prisma: PrismaClient): Promise<void> {
  const clientTypes = [
    {
      name: 'Résidentiel',
      code: 'RESIDENTIAL',
      description: 'Particuliers et logements privés',
      color: '#10b981',
      icon: '🏠',
      sortOrder: 0,
    },
    {
      name: 'Commercial',
      code: 'COMMERCIAL',
      description: 'Commerces, bureaux et locaux professionnels',
      color: '#3b82f6',
      icon: '🏢',
      sortOrder: 1,
    },
    {
      name: 'Industriel',
      code: 'INDUSTRIAL',
      description: 'Usines, entrepôts et sites de production',
      color: '#f59e0b',
      icon: '🏭',
      sortOrder: 2,
    },
    {
      name: 'Institutionnel',
      code: 'INSTITUTIONAL',
      description: 'Établissements publics, hôpitaux, écoles',
      color: '#8b5cf6',
      icon: '🏛️',
      sortOrder: 3,
    },
  ];

  for (const clientType of clientTypes) {
    await prisma.clientTypeConfig.upsert({
      where: { code: clientType.code },
      update: {
        name: clientType.name,
        description: clientType.description,
        color: clientType.color,
        icon: clientType.icon,
        sortOrder: clientType.sortOrder,
      },
      create: {
        ...clientType,
        isActive: true,
      },
    });
  }

  console.log(
    `✅ Client types seeded: ${clientTypes.map((t) => t.name).join(', ')}`,
  );
}
