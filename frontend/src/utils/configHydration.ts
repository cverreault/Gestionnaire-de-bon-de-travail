/**
 * Pure helpers behind the super-admin configuration form (B53 fix).
 *
 * The form keeps two maps keyed by config key: the server snapshot and the
 * local edit state. Values arrive asynchronously (one query per key), so
 * hydration must only ever overwrite keys the user has NOT touched — and
 * only with values that have actually loaded. Blindly copying the local
 * state over the server snapshot on every refetch left every field empty
 * after a full page load (the first pass ran before any query resolved and
 * pinned '' as a "local edit" for all keys).
 */

/** Server values that have finished loading, keyed by config key. */
export type LoadedValues = Record<string, string>;

/**
 * Merge freshly loaded server values into the local edit state.
 * Keys the user touched keep their local value; everything else takes the
 * server value. Keys that have not loaded are left untouched.
 */
export function hydrateLocalValues(
  prev: Record<string, string>,
  loaded: LoadedValues,
  touched: ReadonlySet<string>,
): Record<string, string> {
  const next = { ...prev };
  for (const [key, value] of Object.entries(loaded)) {
    if (!touched.has(key)) next[key] = value;
  }
  return next;
}

/**
 * Split a section's fields into upserts and deletes for the save call.
 * A field whose server value never loaded is skipped entirely: deleting a
 * key we never read would silently wipe a configured value.
 */
export function planSectionSave(
  keys: readonly string[],
  values: Record<string, string>,
  serverValues: Record<string, string>,
  loaded: ReadonlySet<string>,
): { upsert: Array<{ key: string; value: string }>; remove: string[] } {
  const upsert: Array<{ key: string; value: string }> = [];
  const remove: string[] = [];
  for (const key of keys) {
    if (!loaded.has(key)) continue;
    const next = values[key] ?? '';
    const before = serverValues[key] ?? '';
    if (next === before) continue;
    if (next.trim().length === 0) remove.push(key);
    else upsert.push({ key, value: next });
  }
  return { upsert, remove };
}
