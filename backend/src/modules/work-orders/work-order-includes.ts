import { Prisma } from '@prisma/client';
import { TAG_LINK_SELECT } from '../../common/prisma/tag-links';

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
  // B42 — donneur d'ordre (sous-traitance)
  principalClient: {
    select: { id: true, firstName: true, lastName: true, companyName: true, clientType: true, phone: true, email: true },
  },
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
  // B44 — flattened to `tags: [{ id, name, color }]` by the tag-flatten middleware.
  tags: TAG_LINK_SELECT,
} satisfies Prisma.WorkOrderInclude;
