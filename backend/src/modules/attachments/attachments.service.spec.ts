/**
 * QA — attachments.service.spec.ts (B37.9)
 *
 * The streaming proxy `getContent` must enforce the same object-level RBAC
 * as `getDownloadUrl` : a technician only reaches attachments of work orders
 * assigned to them ; everyone gets 404 on unknown ids.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { Readable } from 'stream';
import { AttachmentsService } from './attachments.service';
import { AttachmentsController } from './attachments.controller';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

function makeService(attachment: unknown) {
  const stream = Readable.from(['x']);
  const prisma = { attachment: { findUnique: jest.fn().mockResolvedValue(attachment) } };
  const minio = { getObjectStream: jest.fn().mockResolvedValue(stream) };
  const svc = new AttachmentsService(prisma as never, minio as never, { emit: jest.fn() } as never);
  return { svc, prisma, minio, stream };
}

const ATT = {
  id: 'att-1',
  fileName: 'photo.jpg',
  mimeType: 'image/jpeg',
  fileSize: 1234,
  storageKey: 'wo-1/photo.jpg',
  workOrder: { assignedToId: 'tech-1' },
};

describe('AttachmentsService.getContent (B37.9)', () => {
  it('streams the object with its metadata for the assigned technician', async () => {
    const { svc, minio, stream } = makeService(ATT);
    const out = await svc.getContent('att-1', { id: 'tech-1', role: Role.TECHNICIAN });
    expect(minio.getObjectStream).toHaveBeenCalledWith('wo-1/photo.jpg');
    expect(out).toMatchObject({ fileName: 'photo.jpg', mimeType: 'image/jpeg', fileSize: 1234 });
    expect(out.stream).toBe(stream);
  });

  it('refuses a technician who is not assigned to the work order (IDOR)', async () => {
    const { svc, minio } = makeService(ATT);
    await expect(svc.getContent('att-1', { id: 'tech-2', role: Role.TECHNICIAN })).rejects.toBeInstanceOf(ForbiddenException);
    expect(minio.getObjectStream).not.toHaveBeenCalled();
  });

  it('lets a dispatcher read any attachment of the tenant', async () => {
    const { svc } = makeService(ATT);
    await expect(svc.getContent('att-1', { id: 'disp-1', role: Role.DISPATCHER })).resolves.toBeDefined();
  });

  it('returns 404 on an unknown id', async () => {
    const { svc } = makeService(null);
    await expect(svc.getContent('nope', { id: 'tech-1', role: Role.TECHNICIAN })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AttachmentsController.getContent — roles', () => {
  it('is restricted to ADMIN, DISPATCHER and TECHNICIAN (never CLIENT)', () => {
    const roles = new Reflector().get<Role[]>(ROLES_KEY, AttachmentsController.prototype.getContent);
    expect(roles).toEqual([Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN]);
    expect(roles).not.toContain(Role.CLIENT);
  });

  it('delete is open to staff ; a technician is refused on someone else\'s work order', async () => {
    const roles = new Reflector().get<Role[]>(ROLES_KEY, AttachmentsController.prototype.remove);
    expect(roles).toEqual([Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN]);
    const prisma = { attachment: { findUnique: jest.fn().mockResolvedValue({ ...ATT, workOrderId: 'wo-1' }), delete: jest.fn().mockResolvedValue({}) }, workOrder: { update: jest.fn().mockResolvedValue({ updatedAt: new Date() }) }, $transaction: jest.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])) };
    const minio = { deleteFile: jest.fn().mockResolvedValue(undefined) };
    const svc = new AttachmentsService(prisma as never, minio as never, { emit: jest.fn() } as never);
    await expect(svc.remove('att-1', { id: 'tech-2', role: Role.TECHNICIAN })).rejects.toBeInstanceOf(ForbiddenException);
    expect(minio.deleteFile).not.toHaveBeenCalled();
    await expect(svc.remove('att-1', { id: 'tech-1', role: Role.TECHNICIAN })).resolves.toMatchObject({ message: expect.any(String) });
    expect(minio.deleteFile).toHaveBeenCalledWith('wo-1/photo.jpg');
  });
});
