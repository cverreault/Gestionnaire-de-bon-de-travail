import { BadRequestException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

/**
 * B44 — helpers shared by the aggregates that carry tags (work orders,
 * clients, addresses). The catalogue itself belongs to the settings module ;
 * here we only validate ids and shape the link rows.
 */

export interface TagRef {
  id: string;
  name: string;
  color: string;
}

/** Prisma select for a `*Tag[]` relation, to be flattened with `flattenTags`. */
export const TAG_LINK_SELECT = {
  select: { tag: { select: { id: true, name: true, color: true } } },
  orderBy: { tag: { name: 'asc' as const } },
};

type TagLinkRow = { tag: TagRef };

/** `{ tags: [{ tag }] }` → `{ tags: [tag] }` ; rows without `tags` pass through. */
export function flattenTags<T extends { tags?: TagLinkRow[] }>(
  row: T,
): Omit<T, 'tags'> & { tags: TagRef[] } {
  const { tags, ...rest } = row;
  return { ...rest, tags: (tags ?? []).map((l) => l.tag) };
}

/** Dedupe + verify every id is a tag of the current tenant (middleware-scoped). */
export async function assertTagIds(
  prisma: Pick<PrismaClient, 'tag'>,
  tagIds: string[] | undefined,
): Promise<string[] | undefined> {
  if (tagIds === undefined) return undefined;
  const unique = [...new Set(tagIds)];
  if (unique.length === 0) return [];
  const found = await prisma.tag.count({ where: { id: { in: unique } } });
  if (found !== unique.length) {
    throw new BadRequestException('Un ou plusieurs tags sont introuvables.');
  }
  return unique;
}

/** Nested write for a create : one link row per tag. */
export function tagLinksCreate(tagIds: string[] | undefined) {
  if (!tagIds || tagIds.length === 0) return undefined;
  return { create: tagIds.map((tagId) => ({ tagId })) };
}

/** Nested write for an update : replace the whole set (undefined = untouched). */
export function tagLinksReplace(tagIds: string[] | undefined) {
  if (tagIds === undefined) return undefined;
  return { deleteMany: {}, create: tagIds.map((tagId) => ({ tagId })) };
}
