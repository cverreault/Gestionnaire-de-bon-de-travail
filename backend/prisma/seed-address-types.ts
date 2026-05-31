import { PrismaClient } from '@prisma/client';

/**
 * Seed the address_type_configs table with 4 default address types.
 * Uses upsert (keyed on `code`) to remain idempotent across re-runs.
 */
export async function seedAddressTypes(prisma: PrismaClient): Promise<void> {
  const addressTypes = [
    {
      name: 'Bureau',
      code: 'OFFICE',
      description: 'Adresse de bureau ou de siège social',
      color: '#3b82f6',
      icon: '🖥️',
      sortOrder: 0,
    },
    {
      name: 'Entrepôt',
      code: 'WAREHOUSE',
      description: 'Site de stockage ou dépôt de marchandises',
      color: '#f59e0b',
      icon: '📦',
      sortOrder: 1,
    },
    {
      name: 'Résidence',
      code: 'RESIDENCE',
      description: 'Domicile ou adresse personnelle du client',
      color: '#10b981',
      icon: '🏡',
      sortOrder: 2,
    },
    {
      name: 'Chantier',
      code: 'WORKSITE',
      description: "Site d'intervention ou chantier temporaire",
      color: '#ef4444',
      icon: '🔧',
      sortOrder: 3,
    },
  ];

  for (const addressType of addressTypes) {
    await prisma.addressTypeConfig.upsert({
      where: { code: addressType.code },
      update: {
        name: addressType.name,
        description: addressType.description,
        color: addressType.color,
        icon: addressType.icon,
        sortOrder: addressType.sortOrder,
      },
      create: {
        ...addressType,
        isActive: true,
      },
    });
  }

  console.log(
    `✅ Address types seeded: ${addressTypes.map((t) => t.name).join(', ')}`,
  );
}
