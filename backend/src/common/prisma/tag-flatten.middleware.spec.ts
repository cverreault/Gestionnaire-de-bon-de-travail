import { buildTagFlattenMiddleware, flattenTagLinks } from './tag-flatten.middleware';

const tag = { id: 't1', name: 'Lumii', color: '#2563eb' };

describe('flattenTagLinks', () => {
  it('flattens tag links on the row and on nested relations', () => {
    const row = {
      id: 'c1',
      tags: [{ tag }],
      addresses: [{ id: 'a1', tags: [{ tag }] }, { id: 'a2', tags: [] }],
      createdAt: new Date('2026-01-01'),
    };
    const out = flattenTagLinks(row);
    expect(out.tags).toEqual([tag]);
    expect(out.addresses[0].tags).toEqual([tag]);
    expect(out.addresses[1].tags).toEqual([]);
    expect(out.createdAt).toBeInstanceOf(Date);
  });

  it('leaves already-flat or unrelated `tags` arrays alone', () => {
    const flat = { tags: [tag] };
    expect(flattenTagLinks(flat).tags).toEqual([tag]);
    const strings = { tags: ['a', 'b'] };
    expect(flattenTagLinks(strings).tags).toEqual(['a', 'b']);
  });

  it('handles arrays of rows and null results', () => {
    expect(flattenTagLinks(null)).toBeNull();
    const rows = flattenTagLinks([{ tags: [{ tag }] }, { tags: [{ tag }] }]);
    expect(rows.map((r) => r.tags)).toEqual([[tag], [tag]]);
  });
});

describe('buildTagFlattenMiddleware', () => {
  const mw = buildTagFlattenMiddleware();

  it('rewrites results of tag-bearing models only', async () => {
    const next = jest.fn().mockResolvedValue({ id: 'w1', tags: [{ tag }] });
    const wo = await mw({ model: 'WorkOrder', action: 'findUnique', args: {} } as never, next);
    expect(wo.tags).toEqual([tag]);

    const other = await mw({ model: 'Tag', action: 'findMany', args: {} } as never, jest.fn().mockResolvedValue([{ tags: [{ tag }] }]));
    expect(other[0].tags).toEqual([{ tag }]);
  });
});
