import { pushTargetRoute } from './route';

describe('pushTargetRoute (B38.9)', () => {
  const id = '3f9a2b1c-6d4e-4f8a-9b0c-1d2e3f4a5b6c';
  it('prefers workOrderId, falls back to the web url, else null', () => {
    expect(pushTargetRoute({ workOrderId: id })).toBe(`/(app)/work-orders/${id}`);
    expect(pushTargetRoute({ url: `/bons-de-travail/${id}` })).toBe(`/(app)/work-orders/${id}`);
    expect(pushTargetRoute({ url: '/inventaire' })).toBeNull();
    expect(pushTargetRoute(null)).toBeNull();
  });
});
