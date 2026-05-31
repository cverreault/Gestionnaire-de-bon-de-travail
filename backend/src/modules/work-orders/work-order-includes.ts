import { Prisma } from '@prisma/client';

/**
 * Shared Prisma include block for full WorkOrder detail responses.
 * Used by both ProcessEngineService and WorkOrdersService to avoid divergence.
 */
export const WORK_ORDER_DETAIL_INCLUDE = {
  currentStep: true,
  processDefinition: {
    select: { id: true, name: true, version: true },
  },
  assignedTo: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
    },
  },
  createdBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  temporaryClient: true,
  client: true,
  clientAddress_rel: true,
  taskType: {
    include: {
      template: {
        include: {
          sections: {
            orderBy: { sortOrder: 'asc' as const },
            include: {
              fields: {
                orderBy: { sortOrder: 'asc' as const },
              },
            },
          },
        },
      },
    },
  },
  notes: {
    include: {
      author: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' as const },
  },
  attachments: {
    orderBy: { uploadedAt: 'desc' as const },
  },
} satisfies Prisma.WorkOrderInclude;
