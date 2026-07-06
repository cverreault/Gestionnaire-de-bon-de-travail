import type { Prisma } from '@prisma/client';

/**
 * B10.2 — Auto-sync legacy single-language columns with the new bilingual
 * pair on every write.
 *
 * Nine config models were extended with `nameFr`/`nameEn`,
 * `descriptionFr`/`descriptionEn`, or `labelFr`/`labelEn`. The legacy
 * columns (`name`/`description`/`label`) are kept for backwards compat
 * during the transition.
 *
 * Rules on every `create` / `update` / `upsert` (single-row and Many):
 *   1. Caller sent `nameFr` OR `nameEn` (or both) → copy `nameFr` (or `nameEn`
 *      if FR is empty) into the legacy `name` column.
 *   2. Caller sent only legacy `name` → broadcast into `nameFr` AND `nameEn`
 *      so an older client bringing up a new row doesn't leave both FR/EN
 *      blank.
 *   3. Same rules for `description` ↔ `descriptionFr/En`, and for `label`
 *      ↔ `labelFr/En`.
 *
 * The middleware never OVERWRITES a value the caller explicitly set.
 */

// Models covered by this middleware and the field(s) they carry.
type FieldMap = { name?: boolean; description?: boolean; label?: boolean };
const MODEL_FIELDS: Record<string, FieldMap> = {
  TaskType: { name: true, description: true },
  WorkOrderTemplate: { name: true, description: true },
  TemplateSection: { name: true },
  TemplateField: { label: true },
  ClientTypeConfig: { name: true, description: true },
  AddressTypeConfig: { name: true, description: true },
  AddressTypeField: { label: true },
  ProcessStatus: { name: true },
  ProcessTransition: { label: true },
};

type WriteAction = 'create' | 'update' | 'upsert' | 'createMany' | 'updateMany';
const WRITE_ACTIONS: readonly WriteAction[] = [
  'create',
  'update',
  'upsert',
  'createMany',
  'updateMany',
] as const;

function isWriteAction(action: string): action is WriteAction {
  return (WRITE_ACTIONS as readonly string[]).includes(action);
}

export function buildBilingualSyncMiddleware(): Prisma.Middleware {
  return async (params, next) => {
    const model = params.model;
    const action = params.action;
    if (!model || !isWriteAction(action)) {
      return next(params);
    }
    const fields = MODEL_FIELDS[model];
    if (!fields) return next(params);

    // upsert carries two payloads to normalise.
    if (action === 'upsert') {
      const args = params.args as { create?: unknown; update?: unknown };
      normaliseData(args.create, fields);
      normaliseData(args.update, fields);
      return next(params);
    }

    const args = params.args as { data?: unknown };
    if (Array.isArray(args?.data)) {
      for (const row of args.data as unknown[]) normaliseData(row, fields);
    } else {
      normaliseData(args?.data, fields);
    }
    return next(params);
  };
}

/**
 * Rewrite `data` in place to keep legacy + bilingual columns in sync.
 * Idempotent: calling twice with the same input yields the same output.
 */
function normaliseData(data: unknown, fields: FieldMap): void {
  if (!data || typeof data !== 'object') return;
  const d = data as Record<string, unknown>;

  if (fields.name) syncTriple(d, 'name', 'nameFr', 'nameEn');
  if (fields.description) syncTriple(d, 'description', 'descriptionFr', 'descriptionEn');
  if (fields.label) syncTriple(d, 'label', 'labelFr', 'labelEn');
}

function syncTriple(
  d: Record<string, unknown>,
  legacyKey: string,
  frKey: string,
  enKey: string,
): void {
  const hasFr = Object.prototype.hasOwnProperty.call(d, frKey);
  const hasEn = Object.prototype.hasOwnProperty.call(d, enKey);
  const hasLegacy = Object.prototype.hasOwnProperty.call(d, legacyKey);

  if (hasFr || hasEn) {
    // Bilingual write. Sync legacy from FR (canonical) if the caller
    // didn't set it explicitly.
    if (!hasLegacy) {
      const fr = typeof d[frKey] === 'string' ? (d[frKey] as string) : '';
      const en = typeof d[enKey] === 'string' ? (d[enKey] as string) : '';
      d[legacyKey] = fr || en || '';
    }
    return;
  }

  if (hasLegacy) {
    // Legacy-only write (older client). Broadcast into both FR and EN
    // so a fresh row doesn't have both bilingual sides blank.
    const legacy = typeof d[legacyKey] === 'string' ? (d[legacyKey] as string) : '';
    d[frKey] = legacy;
    d[enKey] = legacy;
  }
}
