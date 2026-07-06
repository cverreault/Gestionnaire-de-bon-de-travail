import { Injectable, Logger } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { AlertRuleRow } from './alerts.service';

/**
 * B10 — Turn an alert rule + a work-order event into a list of concrete
 * dispatch targets.
 *
 * Two target shapes:
 *   • Internal — `{ userId, channels[] }`. NotificationsService.create()
 *     handles per-user preferences downstream.
 *   • External — `{ externalEmail?, externalPhone?, channels[], label }`.
 *     Bypasses the inbox; goes straight to EmailChannel + (v1.1) SmsChannel.
 *
 * Deduplication is by `userId` for internal targets — if a user matches
 * both a role AND is in the explicit user list, they still get exactly one
 * notification with the union of channels. External targets can't
 * duplicate an internal user (different key space), so the union across
 * both sets is what the caller sends.
 */
@Injectable()
export class RecipientResolverService {
  private readonly logger = new Logger(RecipientResolverService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    rule: AlertRuleRow,
    ctx: ResolveContext,
  ): Promise<ResolvedTargets> {
    const internal = new Map<string, InternalTarget>();
    const external: ExternalTarget[] = [];
    const channels = [...rule.channels];

    // ── Internal: by role ────────────────────────────────────────
    if (rule.recipientRoles.length > 0) {
      const users = await this.prisma.user.findMany({
        where: {
          tenantId: ctx.tenantId,
          role: { in: rule.recipientRoles as Role[] },
          isActive: true,
        },
        select: { id: true },
      });
      for (const u of users) {
        this.upsertInternal(internal, u.id, channels);
      }
    }

    // ── Internal: explicit user list ─────────────────────────────
    if (rule.recipientUserIds.length > 0) {
      const users = await this.prisma.user.findMany({
        where: {
          tenantId: ctx.tenantId,
          id: { in: rule.recipientUserIds },
          isActive: true,
        },
        select: { id: true },
      });
      for (const u of users) {
        this.upsertInternal(internal, u.id, channels);
      }
    }

    // ── Internal: assigned technician ────────────────────────────
    if (rule.recipientAssignedTechnician && ctx.assignedTechnicianUserId) {
      this.upsertInternal(internal, ctx.assignedTechnicianUserId, channels);
    }

    // ── External: client ─────────────────────────────────────────
    if (rule.recipientClient && ctx.clientId) {
      const client = await this.prisma.client.findUnique({
        where: { id: ctx.clientId },
        select: {
          id: true,
          email: true,
          phone: true,
          firstName: true,
          lastName: true,
          companyName: true,
        },
      });
      if (client && (client.email || client.phone)) {
        const externalChannels = channels.filter(
          (c) => c === 'email' || c === 'sms',
        );
        if (externalChannels.length > 0) {
          external.push({
            label: client.companyName ?? `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim(),
            externalEmail: client.email ?? undefined,
            externalPhone: client.phone ?? undefined,
            channels: externalChannels,
            kind: 'client',
          });
        }
      } else {
        this.logger.warn(
          `Alert rule ${rule.id} asks for client notification but client ${ctx.clientId} has neither email nor phone.`,
        );
      }
    }

    return {
      internal: Array.from(internal.values()),
      external,
    };
  }

  private upsertInternal(
    map: Map<string, InternalTarget>,
    userId: string,
    channels: string[],
  ): void {
    // For internal recipients we keep the union of channels — however
    // there's only one channel list per rule so this is really just
    // "insert if not already there". Kept as a Map for future rule-level
    // channel overrides without touching this call site.
    if (!map.has(userId)) {
      map.set(userId, { userId, channels: [...channels] });
    }
  }
}

// ─── Types ─────────────────────────────────────────────────────────

export interface ResolveContext {
  tenantId: string;
  workOrderId?: string;
  assignedTechnicianUserId?: string | null;
  clientId?: string | null;
}

export interface InternalTarget {
  userId: string;
  /** Channels the rule wants delivered — final per-user prefs applied downstream. */
  channels: string[];
}

export interface ExternalTarget {
  label: string;
  externalEmail?: string;
  externalPhone?: string;
  channels: string[];
  kind: 'client';
}

export interface ResolvedTargets {
  internal: InternalTarget[];
  external: ExternalTarget[];
}
