import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, WorkOrderType } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { WorkOrdersService } from '../../work-orders/work-orders.service';
import { CreateWorkRequestDto } from '../api/dto/create-work-request.dto';

/** Authenticated portal user, as attached by JwtStrategy. */
export interface PortalUser {
  id: string;
  role: Role;
  clientId: string | null;
}

/**
 * B21 — client-facing reads + work requests.
 *
 * Every query is anchored on `user.clientId`; the select below is the
 * FULL contract of what a portal user may see about a work order —
 * never internal notes, audit, templateData or staff contact details.
 */
const PORTAL_WORK_ORDER_SELECT = {
  id: true,
  referenceNumber: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  scheduledDate: true,
  completionNotes: true,
  negativeReason: true,
  signedAt: true,
  createdAt: true,
  updatedAt: true,
  currentStep: {
    select: {
      code: true,
      name: true,
      nameFr: true,
      nameEn: true,
      color: true,
      isTerminalPositive: true,
      isTerminalNegative: true,
      isRequested: true,
    },
  },
  taskType: { select: { id: true, name: true, nameFr: true, nameEn: true } },
  clientAddress_rel: {
    select: { street: true, city: true, postalCode: true, province: true },
  },
  assignedTo: { select: { firstName: true } },
} satisfies Prisma.WorkOrderSelect;

@Injectable()
export class PortalService {
  private readonly logger = new Logger(PortalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workOrdersService: WorkOrdersService,
  ) {}

  private clientIdOf(user: PortalUser): string {
    if (!user.clientId) {
      throw new ForbiddenException(
        'Compte portail non rattaché à un client — contactez votre fournisseur.',
      );
    }
    return user.clientId;
  }

  async listWorkOrders(user: PortalUser) {
    const clientId = this.clientIdOf(user);
    return this.prisma.workOrder.findMany({
      where: { clientId },
      select: PORTAL_WORK_ORDER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 404 (not 403) when the WO belongs to someone else — no existence leak. */
  async getWorkOrder(id: string, user: PortalUser) {
    const clientId = this.clientIdOf(user);
    const workOrder = await this.prisma.workOrder.findFirst({
      where: { id, clientId },
      select: PORTAL_WORK_ORDER_SELECT,
    });
    if (!workOrder) {
      throw new NotFoundException('Bon de travail introuvable');
    }
    return workOrder;
  }

  async listAddresses(user: PortalUser) {
    const clientId = this.clientIdOf(user);
    return this.prisma.clientAddress.findMany({
      where: { clientId },
      select: {
        id: true,
        street: true,
        city: true,
        postalCode: true,
        province: true,
        addressType: true,
        isDefault: true,
      },
      orderBy: [{ isDefault: 'desc' }, { city: 'asc' }],
    });
  }

  async listTaskTypes() {
    return this.prisma.taskType.findMany({
      where: { isActive: true },
      select: { id: true, name: true, nameFr: true, nameEn: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Client work request → a real WorkOrder parked at the « Demandé »
   * pre-approval step (no scheduled date, no technician). Approval and
   * rejection happen through the normal staff transition flow.
   */
  async createWorkRequest(dto: CreateWorkRequestDto, user: PortalUser) {
    const clientId = this.clientIdOf(user);

    const address = await this.prisma.clientAddress.findFirst({
      where: { id: dto.clientAddressId, clientId },
      select: { id: true },
    });
    if (!address) {
      throw new NotFoundException('Adresse introuvable pour ce client');
    }

    const taskType = await this.prisma.taskType.findFirst({
      where: { id: dto.taskTypeId, isActive: true },
      select: { id: true, name: true, nameFr: true },
    });
    if (!taskType) {
      throw new NotFoundException('Type de tâche introuvable ou inactif');
    }

    const created = await this.workOrdersService.create(
      {
        title: dto.title?.trim() || taskType.nameFr || taskType.name,
        description: dto.description,
        type: WorkOrderType.OTHER,
        clientId,
        clientAddressId: dto.clientAddressId,
        taskTypeId: dto.taskTypeId,
      },
      { id: user.id, role: user.role },
      { asRequest: true },
    );

    this.logger.log(
      `Portal work request ${created.referenceNumber} created by user ${user.id} (client ${clientId})`,
    );
    // Return the sanitized view, not the staff-shaped create result.
    return this.getWorkOrder(created.id, user);
  }
}
