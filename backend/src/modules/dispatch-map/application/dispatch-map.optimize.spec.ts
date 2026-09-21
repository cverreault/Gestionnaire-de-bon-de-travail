import { DispatchMapService } from './dispatch-map.service';

/**
 * B47 — optimizeRoute : Valhalla matrix + 2-opt + route when the engine
 * answers, straight-line nearest-neighbour otherwise.
 */
function makePrisma(stops: Array<{ id: string; lat: number; lng: number }>) {
  return {
    technicianLocation: { findFirst: jest.fn().mockResolvedValue({ latitude: 45.5, longitude: -73.5 }) },
    workOrder: {
      findMany: jest.fn().mockResolvedValue(stops.map((s) => ({ id: s.id, clientAddress_rel: { latitude: s.lat, longitude: s.lng } }))),
    },
  };
}

const stops = [
  { id: 'a', lat: 45.51, lng: -73.51 },
  { id: 'b', lat: 45.52, lng: -73.52 },
  { id: 'c', lat: 45.53, lng: -73.53 },
];

describe('DispatchMapService.optimizeRoute (B47)', () => {
  it('orders stops on driving times and returns legs, totals and the road shape', async () => {
    // start=0, a=1, b=2, c=3 : fastest path 0→b→a→c.
    const durationsMin = [
      [0, 30, 5, 40],
      [30, 0, 5, 5],
      [5, 5, 0, 30],
      [40, 5, 30, 0],
    ];
    const distancesKm = durationsMin.map((row) => row.map((v) => v * 1.2));
    const router = {
      matrix: jest.fn().mockResolvedValue({ durationsMin, distancesKm }),
      route: jest.fn().mockResolvedValue({
        distanceKm: 18,
        durationMin: 15,
        legs: [
          { distanceKm: 6, durationMin: 5, shape: [{ lat: 45.5, lng: -73.5 }, { lat: 45.52, lng: -73.52 }], maneuvers: [] },
          { distanceKm: 6, durationMin: 5, shape: [{ lat: 45.51, lng: -73.51 }], maneuvers: [] },
          { distanceKm: 6, durationMin: 5, shape: [{ lat: 45.53, lng: -73.53 }], maneuvers: [] },
        ],
        shape: [{ lat: 45.5, lng: -73.5 }, { lat: 45.52, lng: -73.52 }, { lat: 45.51, lng: -73.51 }, { lat: 45.53, lng: -73.53 }],
      }),
      status: jest.fn(),
    };
    const svc = new DispatchMapService(makePrisma(stops) as never, router as never);
    const res = await svc.optimizeRoute('tech', ['a', 'b', 'c']);
    expect(res.engine).toBe('valhalla');
    expect(res.orderedWorkOrderIds).toEqual(['b', 'a', 'c']);
    expect(res.totalDistanceKm).toBe(18);
    expect(res.totalDurationMin).toBe(15);
    expect(res.legs.map((l) => l.workOrderId)).toEqual(['b', 'a', 'c']);
    expect(res.shape).toHaveLength(4);
    // The route is asked in the optimised order, starting from the technician.
    const asked = router.route.mock.calls[0][0] as Array<{ lat: number; lng: number }>;
    expect(asked.map((p) => p.lat)).toEqual([45.5, 45.52, 45.51, 45.53]);
  });

  it('falls back to the straight-line heuristic when the engine is down', async () => {
    const router = { matrix: jest.fn().mockResolvedValue(null), route: jest.fn(), status: jest.fn() };
    const svc = new DispatchMapService(makePrisma(stops) as never, router as never);
    const res = await svc.optimizeRoute('tech', ['a', 'b', 'c']);
    expect(res.engine).toBe('haversine');
    expect(res.orderedWorkOrderIds).toEqual(['a', 'b', 'c']);
    expect(res.totalDurationMin).toBeNull();
    expect(res.shape).toEqual([]);
    expect(router.route).not.toHaveBeenCalled();
  });

  it('works without any router bound', async () => {
    const svc = new DispatchMapService(makePrisma([stops[0]]) as never);
    const res = await svc.optimizeRoute('tech', ['a']);
    expect(res.engine).toBe('haversine');
    expect(res.orderedWorkOrderIds).toEqual(['a']);
  });
});
