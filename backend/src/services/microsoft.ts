/**
 * Microsoft 365 / Microsoft Graph integration (Mandate 5 — Section D).
 *
 * Implements the OAuth 2.0 authorization-code flow and Teams online-meeting
 * creation via Microsoft Graph. Credentials are read from environment
 * variables (NEVER hard-coded) — set these on the host (e.g. Render):
 *
 *   GRAPH_CLIENT_ID, GRAPH_TENANT_ID, GRAPH_CLIENT_SECRET,
 *   GRAPH_REDIRECT_URI, GRAPH_SCOPES
 *
 * When the credentials are NOT configured, every method degrades gracefully:
 * meeting creation returns a clearly-marked SIMULATED join link so the rest of
 * the portal (modal -> meeting card -> .ics download) works end-to-end without
 * keys. Swap in real credentials and the same code path calls Graph for real.
 */

// Avoid depending on DOM/undici fetch typings (tsconfig lib is ES2020): use the
// Node 18+ global fetch via a loose cast so the build stays portable.
const httpFetch: (input: string, init?: unknown) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<any>;
  text: () => Promise<string>;
}> = (globalThis as any).fetch;

const DEFAULT_SCOPES =
  'Calendars.ReadWrite OnlineMeetings.ReadWrite Files.ReadWrite User.Read offline_access';

export interface GraphConfig {
  clientId: string;
  tenantId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
}

export function getGraphConfig(): GraphConfig {
  return {
    clientId: process.env.GRAPH_CLIENT_ID || '',
    tenantId: process.env.GRAPH_TENANT_ID || '',
    clientSecret: process.env.GRAPH_CLIENT_SECRET || '',
    redirectUri: process.env.GRAPH_REDIRECT_URI || '',
    scopes: process.env.GRAPH_SCOPES || DEFAULT_SCOPES,
  };
}

export function isConfigured(): boolean {
  const c = getGraphConfig();
  return Boolean(c.clientId && c.tenantId && c.clientSecret && c.redirectUri);
}

// ---------------------------------------------------------------------------
// Token store — in-memory scaffold. For production, persist per-admin tokens
// in the database (encrypted) keyed by user id. Kept process-local here so the
// scaffold has zero external dependencies.
// ---------------------------------------------------------------------------
interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // epoch ms
}
let tokenStore: TokenSet | null = null;

export function isConnected(): boolean {
  return Boolean(tokenStore && tokenStore.accessToken);
}

/** Build the Microsoft authorize URL to begin the OAuth redirect flow. */
export function buildAuthUrl(state?: string): string {
  const c = getGraphConfig();
  const params = new URLSearchParams({
    client_id: c.clientId,
    response_type: 'code',
    redirect_uri: c.redirectUri,
    response_mode: 'query',
    scope: c.scopes,
    ...(state ? { state } : {}),
  });
  return `https://login.microsoftonline.com/${c.tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
}

/** Exchange an authorization code for access + refresh tokens. */
export async function exchangeCodeForTokens(code: string): Promise<TokenSet> {
  const c = getGraphConfig();
  const body = new URLSearchParams({
    client_id: c.clientId,
    client_secret: c.clientSecret,
    code,
    redirect_uri: c.redirectUri,
    grant_type: 'authorization_code',
    scope: c.scopes,
  });
  const resp = await httpFetch(
    `https://login.microsoftonline.com/${c.tenantId}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() }
  );
  if (!resp.ok) {
    throw new Error(`Token exchange failed (${resp.status}): ${await resp.text()}`);
  }
  const json = await resp.json();
  tokenStore = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return tokenStore;
}

/** Silently refresh the access token if it is expired / about to expire. */
async function ensureAccessToken(): Promise<string | null> {
  if (!tokenStore) return null;
  if (Date.now() < tokenStore.expiresAt - 60_000) return tokenStore.accessToken;
  if (!tokenStore.refreshToken) return tokenStore.accessToken;
  const c = getGraphConfig();
  const body = new URLSearchParams({
    client_id: c.clientId,
    client_secret: c.clientSecret,
    refresh_token: tokenStore.refreshToken,
    grant_type: 'refresh_token',
    scope: c.scopes,
  });
  const resp = await httpFetch(
    `https://login.microsoftonline.com/${c.tenantId}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() }
  );
  if (!resp.ok) return tokenStore.accessToken;
  const json = await resp.json();
  tokenStore = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? tokenStore.refreshToken,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return tokenStore.accessToken;
}

export interface CreateMeetingInput {
  subject: string;
  startDateTime: string; // ISO 8601 with offset
  endDateTime: string;
  attendeeEmails?: string[];
}

export interface MeetingResult {
  id: string;
  subject: string;
  startDateTime: string;
  endDateTime: string;
  joinWebUrl: string;
  joinUrl: string;
  simulated: boolean;
}

/**
 * Create a Teams online meeting. Uses Microsoft Graph when configured +
 * connected; otherwise returns a clearly-marked simulated result so the UI
 * flow remains fully functional without credentials.
 */
export async function createOnlineMeeting(input: CreateMeetingInput): Promise<MeetingResult> {
  const token = await ensureAccessToken();

  if (isConfigured() && token) {
    // --- Real Microsoft Graph call ---
    const resp = await httpFetch('https://graph.microsoft.com/v1.0/me/onlineMeetings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: input.subject,
        startDateTime: input.startDateTime,
        endDateTime: input.endDateTime,
        participants: {
          attendees: (input.attendeeEmails ?? []).map((address) => ({
            emailAddress: { address },
            type: 'required',
          })),
        },
      }),
    });
    if (!resp.ok) {
      throw new Error(`Graph onlineMeetings failed (${resp.status}): ${await resp.text()}`);
    }
    const json = await resp.json();
    return {
      id: json.id,
      subject: input.subject,
      startDateTime: input.startDateTime,
      endDateTime: input.endDateTime,
      joinWebUrl: json.joinWebUrl || json.joinUrl,
      joinUrl: json.joinUrl || json.joinWebUrl,
      simulated: false,
    };
  }

  // --- Simulated fallback (no credentials configured) ---
  const fakeId = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const joinUrl = `https://teams.microsoft.com/l/meetup-join/sim/${fakeId}`;
  return {
    id: fakeId,
    subject: input.subject,
    startDateTime: input.startDateTime,
    endDateTime: input.endDateTime,
    joinWebUrl: joinUrl,
    joinUrl,
    simulated: true,
  };
}

/** Upcoming calendar events (Graph calendarView). Empty when not connected. */
export async function getUpcomingMeetings(): Promise<unknown[]> {
  const token = await ensureAccessToken();
  if (!isConfigured() || !token) return [];
  const start = new Date().toISOString();
  const end = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
  const resp = await httpFetch(
    `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${start}&endDateTime=${end}&$orderby=start/dateTime&$top=20`,
    { method: 'GET', headers: { Authorization: `Bearer ${token}` } }
  );
  if (!resp.ok) return [];
  const json = await resp.json();
  return json.value ?? [];
}
