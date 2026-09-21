import { ValhallaClient, decodePolyline6 } from './valhalla.client';

/** Reference encoder (Google polyline algorithm, 1e-6) used to build fixtures. */
function encodePolyline6(points: Array<{ lat: number; lng: number }>): string {
  let out = '';
  let prevLat = 0;
  let prevLng = 0;
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    let str = '';
    while (n >= 0x20) {
      str += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    return str + String.fromCharCode(n + 63);
  };
  for (const p of points) {
    const lat = Math.round(p.lat * 1e6);
    const lng = Math.round(p.lng * 1e6);
    out += enc(lat - prevLat) + enc(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return out;
}

describe('decodePolyline6', () => {
  it('decodes a Valhalla shape with 1e-6 precision', () => {
    const encoded = encodePolyline6([{ lat: 45.5017, lng: -73.5673 }, { lat: 45.5027, lng: -73.5663 }]);
    const pts = decodePolyline6(encoded);
    expect(pts).toHaveLength(2);
    expect(pts[0].lat).toBeCloseTo(45.5017, 5);
    expect(pts[0].lng).toBeCloseTo(-73.5673, 5);
    expect(pts[1].lat).toBeCloseTo(45.5027, 5);
    expect(pts[1].lng).toBeCloseTo(-73.5663, 5);
  });
  it('returns an empty list for an empty shape', () => {
    expect(decodePolyline6('')).toEqual([]);
  });
});

describe('ValhallaClient', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('maps a /route answer to kilometres, minutes, legs and maneuvers', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        trip: {
          summary: { length: 12.345, time: 1080 },
          legs: [{ summary: { length: 12.345, time: 1080 }, shape: encodePolyline6([{ lat: 45.5, lng: -73.5 }, { lat: 45.6, lng: -73.6 }]), maneuvers: [{ instruction: 'Tournez à droite', length: 1.5, time: 120, type: 10 }] }],
        },
      }),
    } as never);
    const res = await new ValhallaClient().route([{ lat: 45.5, lng: -73.5 }, { lat: 45.6, lng: -73.6 }], { language: 'fr' });
    expect(res).toMatchObject({ distanceKm: 12.35, durationMin: 18 });
    expect(res?.legs[0].maneuvers[0]).toEqual({ instruction: 'Tournez à droite', distanceKm: 1.5, durationMin: 2, type: 10 });
    expect(res?.shape).toHaveLength(2);
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({ costing: 'auto', locations: [{ lat: 45.5, lon: -73.5 }, { lat: 45.6, lon: -73.6 }] });
  });

  it('returns null (never throws) when the engine is unreachable or errors', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await new ValhallaClient().route([{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }])).toBeNull();
    expect(await new ValhallaClient().matrix([{ lat: 1, lng: 2 }], [{ lat: 3, lng: 4 }])).toBeNull();
    expect((await new ValhallaClient().status()).available).toBe(false);
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'bad' } as never);
    expect(await new ValhallaClient().route([{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }])).toBeNull();
  });

  it('maps a matrix to minutes / kilometres with null for unreachable cells', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sources_to_targets: [[{ time: 0, distance: 0 }, { time: 600, distance: 8.2 }], [{ time: null, distance: null }, { time: 0, distance: 0 }]] }),
    } as never);
    const m = await new ValhallaClient().matrix([{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }], [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }]);
    expect(m?.durationsMin).toEqual([[0, 10], [null, 0]]);
    expect(m?.distancesKm).toEqual([[0, 8.2], [null, 0]]);
  });
});
