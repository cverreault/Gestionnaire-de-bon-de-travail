import { orderByMatrix } from './route-optimizer';

describe('orderByMatrix (B47)', () => {
  it('returns an empty order without stops', () => {
    expect(orderByMatrix([[0]])).toEqual([]);
  });

  it('follows driving times, not straight lines', () => {
    // start=0 ; stops 1,2,3. Fast road 0→2→1→3, everything else slow.
    const D = [
      [0, 30, 5, 40],
      [30, 0, 5, 5],
      [5, 5, 0, 30],
      [40, 5, 30, 0],
    ];
    expect(orderByMatrix(D)).toEqual([2, 1, 3]);
  });

  it('improves a bad nearest-neighbour seed with 2-opt', () => {
    // NN from 0 picks 1 (cost 1), then 3 (2), then 2 (10) = 13 ; optimum 0→1→2→3 = 1+2+2 = 5.
    const D = [
      [0, 1, 9, 9],
      [1, 0, 2, 2],
      [9, 2, 0, 2],
      [9, 2, 2, 0],
    ];
    const order = orderByMatrix(D);
    const total = D[0][order[0]] + D[order[0]][order[1]] + D[order[1]][order[2]];
    expect(total).toBe(5);
  });

  it('treats unreachable cells as very expensive', () => {
    const D: (number | null)[][] = [
      [0, null, 5],
      [null, 0, 5],
      [5, 5, 0],
    ];
    expect(orderByMatrix(D)).toEqual([2, 1]);
  });
});
