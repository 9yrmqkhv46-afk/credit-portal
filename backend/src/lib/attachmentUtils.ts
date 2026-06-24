/**
 * Pure attachment helpers (no Prisma / no I/O) so they can be unit-tested in
 * isolation. Used by routes/attachments.ts.
 */

/**
 * Maximum decoded attachment size: ~5 MB. Base64 inflates payloads ~33%, which
 * is why the Express JSON body limit (index.ts) is set higher (8 MB) than this.
 */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/**
 * Compute the real (decoded) byte length of a base64 string WITHOUT allocating
 * the full buffer. Handles optional padding and a `data:` URL prefix. Returns 0
 * for empty / malformed input.
 */
export function decodeBase64Size(base64: string): number {
  if (!base64) return 0;
  const raw = stripDataUrlPrefix(base64);
  const clean = raw.replace(/[\r\n\s]/g, '');
  if (clean.length === 0) return 0;
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

/** Strip any `data:...;base64,` prefix so only the raw base64 payload is stored. */
export function stripDataUrlPrefix(base64: string): string {
  if (!base64) return '';
  const comma = base64.indexOf(',');
  return base64.startsWith('data:') && comma !== -1 ? base64.slice(comma + 1) : base64;
}

/** Minimal shape of an attachment row needed for an access decision. */
export interface AttachmentAccessShape {
  ownerUserId: string;
}

/** Minimal shape of an authenticated user needed for an access decision. */
export interface AccessUser {
  id: string;
  role: string;
}

/**
 * RBAC: an attachment may be fetched only by its owning user or by an ADMIN.
 * (The route additionally allows a client who owns the linked message thread.)
 */
export function canAccessAttachment(user: AccessUser, attachment: AttachmentAccessShape): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  return attachment.ownerUserId === user.id;
}
