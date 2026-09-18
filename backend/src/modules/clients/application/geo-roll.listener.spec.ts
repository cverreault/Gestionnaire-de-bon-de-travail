import { GeoRollListener } from './geo-roll.listener';
import { GEO_ROLL_IMPORTED_EVENT } from '../../../common/contracts/geo-events.contract';

describe('GeoRollListener', () => {
  it('clears property_matched_at on every matched address so the sweep re-matches', async () => {
    const prisma = { clientAddress: { updateMany: jest.fn().mockResolvedValue({ count: 42 }) } };
    const listener = new GeoRollListener(prisma as never);
    await listener.onRollImported({
      eventName: GEO_ROLL_IMPORTED_EVENT, occurredAt: new Date(), aggregateId: 'j-1',
      actorUserId: 'sa-1', rollYear: 2027, rowsImported: 3900000,
    });
    expect(prisma.clientAddress.updateMany).toHaveBeenCalledWith({
      where: { propertyMatchedAt: { not: null } },
      data: { propertyMatchedAt: null },
    });
  });
});
