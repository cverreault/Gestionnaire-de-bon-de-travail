import { OPTIMISTIC_LOCK_CONFLICT, toTelUrl } from '@taskmgr/shared';

// Vérifie que la résolution du workspace @taskmgr/shared fonctionne depuis
// l'app (Metro en dev, jest-expo en test).
describe('@taskmgr/shared resolution', () => {
  it('exposes contracts and helpers', () => {
    expect(OPTIMISTIC_LOCK_CONFLICT).toBe('OPTIMISTIC_LOCK_CONFLICT');
    expect(toTelUrl('514 555 0199')).toBe('tel:+15145550199');
  });
});
