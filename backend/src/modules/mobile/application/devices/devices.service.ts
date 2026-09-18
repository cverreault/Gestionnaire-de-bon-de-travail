import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Device } from '@prisma/client';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import {
  MOBILE_DEVICE_REGISTERED_EVENT,
  MOBILE_DEVICE_REVOKED_EVENT,
  type MobileDeviceRegisteredPayload,
  type MobileDeviceRevokedPayload,
} from '../../../../common/contracts/mobile-events.contract';
import type { HeartbeatDto, RegisterDeviceDto } from '../../api/dto/register-device.dto';
import { MobileConfigService } from '../config/mobile-config.service';

export interface DeviceOwner {
  id: string;
  tenantId: string;
}

/** What the app and the profile page see — never the raw push token. */
export interface DeviceView {
  installationId: string;
  platform: Device['platform'];
  appVersion: string;
  osVersion: string | null;
  model: string | null;
  locale: string | null;
  hasPushToken: boolean;
  lastSeenAt: Date;
  createdAt: Date;
  revokedAt: Date | null;
}

/**
 * Device registry (B37.3, ADR-015 §1/§4/§5).
 *
 * One row per (tenant, installationId). Re-registering from another user
 * re-links the installation (shared phone) and emits `registered` again so
 * the previous user's push token is not reused. Revocation soft-deletes the
 * row (`revokedAt`) and emits `revoked`, which `auth` consumes to kill the
 * device's refresh tokens before the HTTP response returns.
 */
@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly config: MobileConfigService,
  ) {}

  async register(owner: DeviceOwner, installationId: string, dto: RegisterDeviceDto): Promise<DeviceView> {
    const existing = await this.prisma.device.findUnique({
      where: { tenantId_installationId: { tenantId: owner.tenantId, installationId } },
    });
    const relinked = !!existing && existing.userId !== owner.id;
    const pushToken = await this.claimPushToken(dto.pushToken, owner.tenantId, installationId);

    const data = {
      userId: owner.id,
      platform: dto.platform,
      appVersion: dto.appVersion,
      osVersion: dto.osVersion ?? existing?.osVersion ?? null,
      model: dto.model ?? existing?.model ?? null,
      locale: dto.locale ?? existing?.locale ?? null,
      lastSeenAt: new Date(),
      revokedAt: null,
      ...(pushToken !== undefined ? { pushToken, pushTokenInvalidatedAt: null } : {}),
      // A re-linked installation must not keep the previous user's token.
      ...(relinked && pushToken === undefined ? { pushToken: null } : {}),
    };

    const device = existing
      ? await this.prisma.device.update({ where: { id: existing.id }, data })
      : await this.prisma.device.create({
          data: { tenantId: owner.tenantId, installationId, ...data, pushToken: pushToken ?? null },
        });

    if (!existing || relinked || existing.revokedAt) {
      const payload: MobileDeviceRegisteredPayload = {
        tenantId: owner.tenantId,
        installationId,
        userId: owner.id,
        platform: device.platform,
        appVersion: device.appVersion,
        relinked,
      };
      this.events.emit(MOBILE_DEVICE_REGISTERED_EVENT, payload);
      this.logger.log(`Device ${installationId} ${relinked ? 're-linked to' : 'registered for'} user ${owner.id}`);
    }
    return toView(device);
  }

  async listMine(owner: DeviceOwner): Promise<DeviceView[]> {
    const rows = await this.prisma.device.findMany({
      where: { tenantId: owner.tenantId, userId: owner.id, revokedAt: null },
      orderBy: { lastSeenAt: 'desc' },
    });
    return rows.map(toView);
  }

  async heartbeat(owner: DeviceOwner, installationId: string, dto: HeartbeatDto) {
    const device = await this.findOwned(owner, installationId);
    const pushToken = await this.claimPushToken(dto.pushToken, owner.tenantId, installationId);
    const updated = await this.prisma.device.update({
      where: { id: device.id },
      data: {
        lastSeenAt: new Date(),
        ...(dto.appVersion ? { appVersion: dto.appVersion } : {}),
        ...(dto.osVersion ? { osVersion: dto.osVersion } : {}),
        ...(pushToken !== undefined ? { pushToken, pushTokenInvalidatedAt: null } : {}),
      },
    });
    const gate = await this.config.upgradeRequired(updated.platform, updated.appVersion);
    return { ...gate, latestAppVersion: (await this.config.versionPolicy()).latestAppVersion, serverTime: new Date().toISOString() };
  }

  async revoke(owner: DeviceOwner, installationId: string, reason: MobileDeviceRevokedPayload['reason'] = 'user'): Promise<void> {
    const device = await this.findOwned(owner, installationId);
    await this.prisma.device.update({
      where: { id: device.id },
      data: { revokedAt: new Date(), pushToken: null, pushTokenInvalidatedAt: new Date() },
    });
    const payload: MobileDeviceRevokedPayload = { tenantId: owner.tenantId, installationId, userId: owner.id, reason };
    // emitAsync: auth revokes the device's refresh tokens before we answer.
    await this.events.emitAsync(MOBILE_DEVICE_REVOKED_EVENT, payload);
  }

  /** Object-level RBAC: unknown, revoked or someone else's installation → 404 (never 403). */
  private async findOwned(owner: DeviceOwner, installationId: string): Promise<Device> {
    const device = await this.prisma.device.findUnique({
      where: { tenantId_installationId: { tenantId: owner.tenantId, installationId } },
    });
    if (!device || device.userId !== owner.id || device.revokedAt) {
      throw new NotFoundException('Appareil introuvable');
    }
    return device;
  }

  /**
   * `push_token` is unique platform-wide: a token that moved to another
   * installation (app reinstalled → new installationId) is detached from the
   * old row first. Returns `undefined` when the request carries no token.
   */
  private async claimPushToken(token: string | undefined, tenantId: string, installationId: string): Promise<string | null | undefined> {
    if (token === undefined) return undefined;
    if (token === '') return null;
    await this.prisma.device.updateMany({
      where: { pushToken: token, NOT: { tenantId, installationId } },
      data: { pushToken: null, pushTokenInvalidatedAt: new Date() },
    });
    return token;
  }
}

export function toView(d: Device): DeviceView {
  return {
    installationId: d.installationId,
    platform: d.platform,
    appVersion: d.appVersion,
    osVersion: d.osVersion,
    model: d.model,
    locale: d.locale,
    hasPushToken: !!d.pushToken,
    lastSeenAt: d.lastSeenAt,
    createdAt: d.createdAt,
    revokedAt: d.revokedAt,
  };
}
