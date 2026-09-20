import type { Prisma } from '@prisma/client';

/**
 * B44 — Tags are stored through explicit join tables (`work_order_tags`,
 * `client_tags`, `address_tags`), so a Prisma include yields
 * `tags: [{ tag: { id, name, color } }]`. Every API consumer (web, mobile
 * sync, CSV export) wants the flat `tags: [{ id, name, color }]` instead.
 *
 * Rather than remembering to flatten at ~20 return sites, this middleware
 * rewrites the result of any query on a tag-bearing model, walking nested
 * relations (a client's addresses, a work order's client…). Rows without
 * a `tags` key are untouched.
 */

const TAG_BEARING_MODELS = new Set<string>(['WorkOrder', 'Client', 'ClientAddress']);

type TagLink = { tag: { id: string; name: string; color: string } };

function isTagLinkArray(value: unknown): value is TagLink[] {
  return (
    Array.isArray(value) &&
    value.every((v) => v && typeof v === 'object' && 'tag' in v && (v as TagLink).tag && typeof (v as TagLink).tag === 'object')
  );
}

/** Recursively flattens `tags: [{ tag }]` → `tags: [tag]` in place. */
export function flattenTagLinks<T>(value: T, depth = 0): T {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    for (const item of value) flattenTagLinks(item, depth + 1);
    return value;
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const child = obj[key];
    if (key === 'tags' && isTagLinkArray(child)) {
      obj[key] = child.map((l) => l.tag);
    } else if (child && typeof child === 'object') {
      flattenTagLinks(child, depth + 1);
    }
  }
  return value;
}

export function buildTagFlattenMiddleware(): Prisma.Middleware {
  return async function tagFlattenMiddleware(params, next) {
    const result = await next(params);
    if (!params.model || !TAG_BEARING_MODELS.has(params.model)) return result;
    return flattenTagLinks(result);
  };
}
