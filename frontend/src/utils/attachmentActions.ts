import api from '../services/api';

/** Fetches the protected content as a blob (bearer via axios) and returns an object URL. */
export async function fetchAttachmentBlobUrl(attachmentId: string): Promise<string> {
  const res = await api.get<Blob>(`/attachments/${attachmentId}/content`, { responseType: 'blob' });
  return URL.createObjectURL(res.data);
}

/** Opens the file in a new tab (PDF / image viewers of the browser). */
export async function viewAttachment(attachmentId: string): Promise<void> {
  const url = await fetchAttachmentBlobUrl(attachmentId);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Triggers a download with the original file name. */
export async function downloadAttachment(attachmentId: string, fileName: string): Promise<void> {
  const url = await fetchAttachmentBlobUrl(attachmentId);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
