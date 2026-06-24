import api from './api';

/** Human-readable file size (e.g. 1.4 MB). */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Read a File into a base64 string (without the data: URL prefix). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma !== -1 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Download an attachment by id. Uses the authenticated API client (Bearer
 * token) to fetch the bytes as a blob, then triggers a browser download.
 */
export async function downloadAttachment(id: string, filename: string): Promise<void> {
  const res = await api.get(`/attachments/${id}`, { responseType: 'blob' });
  const blob = res.data as Blob;
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

/**
 * Upload a File as a base64 attachment. Returns the created attachment
 * metadata. `messageId` / `profileDocumentKey` link the attachment to a chat
 * message or a Document Checklist item respectively.
 */
export async function uploadAttachment(
  file: File,
  opts: { messageId?: string; profileDocumentKey?: string } = {}
): Promise<{ id: string; filename: string; mimeType: string; sizeBytes: number; status: string }> {
  const dataBase64 = await fileToBase64(file);
  const res = await api.post('/attachments', {
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    dataBase64,
    ...(opts.messageId ? { messageId: opts.messageId } : {}),
    ...(opts.profileDocumentKey ? { profileDocumentKey: opts.profileDocumentKey } : {}),
  });
  return res.data;
}
