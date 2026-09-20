import { BadRequestException } from '@nestjs/common';
import { assertTagIds, tagLinksCreate, tagLinksReplace } from './tag-links';

describe('tag-links helpers', () => {
  it('assertTagIds dedupes and passes when every id exists in the tenant', async () => {
    const prisma = { tag: { count: jest.fn().mockResolvedValue(2) } };
    await expect(assertTagIds(prisma as never, ['a', 'b', 'a'])).resolves.toEqual(['a', 'b']);
    expect(prisma.tag.count).toHaveBeenCalledWith({ where: { id: { in: ['a', 'b'] } } });
  });

  it('assertTagIds rejects an unknown (or other-tenant) id', async () => {
    const prisma = { tag: { count: jest.fn().mockResolvedValue(1) } };
    await expect(assertTagIds(prisma as never, ['a', 'b'])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('assertTagIds leaves undefined untouched and short-circuits on []', async () => {
    const prisma = { tag: { count: jest.fn() } };
    await expect(assertTagIds(prisma as never, undefined)).resolves.toBeUndefined();
    await expect(assertTagIds(prisma as never, [])).resolves.toEqual([]);
    expect(prisma.tag.count).not.toHaveBeenCalled();
  });

  it('builds nested writes', () => {
    expect(tagLinksCreate(undefined)).toBeUndefined();
    expect(tagLinksCreate([])).toBeUndefined();
    expect(tagLinksCreate(['a'])).toEqual({ create: [{ tagId: 'a' }] });
    expect(tagLinksReplace(undefined)).toBeUndefined();
    expect(tagLinksReplace([])).toEqual({ deleteMany: {}, create: [] });
    expect(tagLinksReplace(['a'])).toEqual({ deleteMany: {}, create: [{ tagId: 'a' }] });
  });
});
