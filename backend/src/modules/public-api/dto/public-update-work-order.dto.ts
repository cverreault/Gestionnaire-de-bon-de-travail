import { OmitType, PartialType } from '@nestjs/swagger';
import { UpdateWorkOrderDto } from '../../work-orders/dto/update-work-order.dto';

/**
 * Public-API variant of `UpdateWorkOrderDto` (B8).
 *
 * The internal PATCH accepts a `status` field to allow ADMIN/DISPATCHER
 * to force a status change (e.g. re-open a completed BT). Exposing that
 * publicly would let an external system bypass the ProcessEngine's
 * transition validation (allowed transitions per role, required fields,
 * etc.) — the whole reason the process module exists. The public
 * variant strips `status`; callers must go through
 * `POST /api/v1/work-orders/:id/transition` instead.
 *
 * `completionNotes` and `negativeReason` stay — external systems may
 * legitimately set them (e.g. syncing back from a dispatch tool).
 */
export class PublicUpdateWorkOrderDto extends PartialType(
  OmitType(UpdateWorkOrderDto, ['status'] as const),
) {}
