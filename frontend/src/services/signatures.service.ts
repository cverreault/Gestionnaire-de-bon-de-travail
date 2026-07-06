import api from './api';

/**
 * B12 — Save work-order signatures (base64 PNG data-URLs).
 *
 * Both fields are individually optional:
 *   - Omit a field → keep the stored value
 *   - Pass an explicit `null` → clear the stored value
 *   - Pass a data-URL → replace the stored value
 */
export async function saveSignatures(
  workOrderId: string,
  input: {
    signatureClient?: string | null;
    signatureTechnician?: string | null;
  },
): Promise<{
  id: string;
  signatureClient: string | null;
  signatureTechnician: string | null;
  signedAt: string | null;
}> {
  const { data } = await api.post(`/work-orders/${workOrderId}/signatures`, input);
  return (data.data ?? data) as {
    id: string;
    signatureClient: string | null;
    signatureTechnician: string | null;
    signedAt: string | null;
  };
}
