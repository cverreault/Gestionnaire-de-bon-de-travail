import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WO_EVENT_NAMES, type WorkOrderCompletedEvent } from '../domain/events/work-order-events';
import { TravelService } from './travel.service';

/** B49 — compute the round-trip mileage when a work order reaches a terminal step. */
@Injectable()
export class TravelListener {
  constructor(private readonly travel: TravelService) {}

  @OnEvent(WO_EVENT_NAMES.COMPLETED, { async: true, promisify: true })
  async onCompleted(event: WorkOrderCompletedEvent): Promise<void> {
    await this.travel.computeSilently(event.aggregateId);
  }
}
