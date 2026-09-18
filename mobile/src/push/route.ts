/**
 * Maps a push payload (`data.workOrderId` or the web `data.url`) to an
 * expo-router path. Pure ; null when the payload points nowhere useful.
 */
export function pushTargetRoute(data: Record<string, unknown> | null | undefined): string | null {
  if (!data) return null;
  const id = typeof data.workOrderId === 'string' ? data.workOrderId : null;
  if (id) return `/(app)/work-orders/${id}`;
  const url = typeof data.url === 'string' ? data.url : '';
  const m = url.match(/\/bons-de-travail\/([0-9a-f-]{36})/i);
  return m ? `/(app)/work-orders/${m[1]}` : null;
}
