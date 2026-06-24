/**
 * Pluggable property-valuation provider abstraction.
 *
 * IMPORTANT (and by design): realestate.com.au has NO free public valuation
 * API, and scraping it violates their Terms of Service and is unreliable. So we
 * DO NOT scrape. The `realestate_link` provider simply builds a deep link to
 * the official realestate.com.au search/estimate page for an address so the
 * broker can open the lender-grade estimate themselves. The manual "Est.
 * valuation" / "Rent p.w" the broker types remains the SOURCE OF TRUTH used by
 * the servicing/ROI engine — automated estimates only ever pre-fill a field
 * the broker can accept or override.
 *
 * Two real data providers can be plugged into the SAME interface and selected
 * via the VALUATION_PROVIDER env var:
 *
 *   manual          -> no automated estimate; manual entry only (DEFAULT)
 *   realestate_link -> build a realestate.com.au deep link (no estimate value)
 *   domain_avm      -> Domain Group Rental AVM API (returns a WEEKLY RENT
 *                      estimate). Gated behind DOMAIN_API_KEY.
 *   apify           -> generic Apify actor/task connector that can return a
 *                      sale value and/or weekly rent. Gated behind APIFY_TOKEN.
 *
 * The Domain "Rental AVM" package returns a RENTAL estimate (weekly rent), not
 * a sale value — so it pre-fills the property's "Rent p.w" suggestion. Apify is
 * a generic connector: whichever actor you point it at must output a value
 * and/or rent field.
 *
 * NOTE ON NETWORK: live external calls require outbound egress + an API key,
 * which exist on the Render deployment. They were not exercised in the build
 * sandbox (no egress to api.domain.com.au / api.apify.com). All failures
 * (missing key, non-200, timeout) are handled gracefully and never crash the
 * server — the UI falls back to the realestate.com.au link + manual entry.
 */

export type ValuationProviderName =
  | 'manual'
  | 'realestate_link'
  | 'domain_avm'
  | 'apify'
  // Back-compat alias kept so an existing VALUATION_PROVIDER=external keeps working.
  | 'external';

export interface ValuationQuery {
  address: string;
  postcode?: string | null;
}

export interface ValuationResult {
  provider: ValuationProviderName;
  /** Estimated value, when a provider can return one (null for link/manual). */
  estimatedValue: number | null;
  /** Deep link the broker can open to view the official estimate, when any. */
  link: string | null;
  /** Human-readable note about the source / how to use the result. */
  source: string;
}

/** Address + attribute inputs accepted by automated rental-estimate providers. */
export interface RentalEstimateQuery {
  address: string;
  postcode?: string | null;
  suburb?: string | null;
  state?: string | null;
  propertyType?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  carspaces?: number | null;
}

/**
 * Normalized estimate returned by /api/valuation/estimate. The shape is stable
 * across providers so the frontend can render it uniformly. Any subset of the
 * estimate fields may be present depending on what the provider returns.
 */
export interface RentalEstimateResult {
  provider: ValuationProviderName;
  /** false when no key/config is present -> UI falls back to the link button. */
  configured: boolean;
  /** Short provider tag for display: 'domain' | 'apify' | 'manual' ... */
  source: string;
  /** Sale/market value estimate (Apify-style providers may return this). */
  estimatedValue?: number | null;
  /** Weekly rent estimate (Domain Rental AVM populates this). */
  rentalEstimateWeekly?: number | null;
  /** Lower bound of the weekly rent range, when provided. */
  rentalRangeLow?: number | null;
  /** Upper bound of the weekly rent range, when provided. */
  rentalRangeHigh?: number | null;
  /** Provider confidence indicator (string label or numeric score). */
  confidence?: string | number | null;
  /** Normalized property address echoed back by the provider, when present. */
  address?: string | null;
  /** Human-readable note for the UI (e.g. why it's not configured). */
  message?: string;
  /** Error detail for graceful failures (missing key, non-200, timeout). */
  error?: string;
  /** Raw provider payload for debugging (never includes the API key). */
  raw?: unknown;
}

export interface ValuationProvider {
  readonly name: ValuationProviderName;
  /** Build a deep link to an external estimate page (may be null). */
  buildLink(query: ValuationQuery): string | null;
  /** Return an automated estimate if the provider supports one. */
  estimate(query: ValuationQuery): Promise<ValuationResult>;
  /** Return a normalized rental/value estimate (automated providers). */
  getRentalEstimate(query: RentalEstimateQuery): Promise<RentalEstimateResult>;
}

const REALESTATE_BASE = 'https://www.realestate.com.au';

/**
 * Build a realestate.com.au search URL from a free-text address + optional
 * postcode. Everything is URL-encoded. This is a SEARCH/deep link only — it
 * does not call realestate.com.au or scrape any data.
 */
export function buildRealestateLink(query: ValuationQuery): string {
  const parts = [query.address || '', query.postcode || '']
    .map((p) => p.trim())
    .filter(Boolean);
  const term = parts.join(' ');
  // The /buy/ search path accepts a free-text location query string.
  return `${REALESTATE_BASE}/buy/in-${encodeURIComponent(term)}/list-1`;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Parse a numeric value out of mixed provider payloads (handles "$650/wk"). */
function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.\-]/g, '');
    if (!cleaned) return null;
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Pick the first present key from an object, trying several candidate names. */
function pick(obj: Record<string, unknown> | undefined | null, keys: string[]): unknown {
  if (!obj) return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

/**
 * fetch with an AbortController timeout so a hung external host can never wedge
 * a request. Uses Node's built-in global fetch (Node 18+/20+) — no HTTP deps.
 */
async function fetchWithTimeout(
  url: string,
  init: Record<string, unknown>,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal } as RequestInit);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Domain Group Rental AVM provider
// ---------------------------------------------------------------------------
// Docs: https://developer.domain.com.au/docs/latest/apis/pkg_rental_avm/references/properties_getrentalestimate
//
// The Domain "Rental AVM" package returns a WEEKLY RENT estimate for a
// property. The endpoint path defaults to the documented rental-estimate route
// but is overridable via DOMAIN_RENTAL_ESTIMATE_PATH should Domain version it.
// The API key is sent via a configurable header (default `X-Api-Key`); set
// DOMAIN_API_KEY_HEADER=Authorization to send it as a Bearer token instead.

const DOMAIN_DEFAULT_BASE = 'https://api.domain.com.au';
const DOMAIN_DEFAULT_PATH = '/v1/properties/_rentalEstimate';
const DOMAIN_TIMEOUT_MS = 10_000;

/** Build the header map carrying the Domain key, supporting Bearer or X-Api-Key. */
function buildDomainHeaders(apiKey: string, headerName: string): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (/^authorization$/i.test(headerName)) {
    headers.Authorization = /^bearer\s+/i.test(apiKey) ? apiKey : `Bearer ${apiKey}`;
  } else {
    headers[headerName] = apiKey;
  }
  return headers;
}

/** Normalize a Domain Rental AVM payload into our stable estimate shape. */
function normalizeDomain(data: Record<string, unknown>): RentalEstimateResult {
  const weekly = toNumberOrNull(
    pick(data, ['rentalEstimateWeekly', 'weeklyRent', 'estimate', 'rentEstimate', 'midRange', 'rent'])
  );
  const low = toNumberOrNull(
    pick(data, ['rentalRangeLow', 'lowerRangeRent', 'lowerRange', 'rangeLow', 'minRent', 'low'])
  );
  const high = toNumberOrNull(
    pick(data, ['rentalRangeHigh', 'upperRangeRent', 'upperRange', 'rangeHigh', 'maxRent', 'high'])
  );
  const confidenceRaw = pick(data, ['confidence', 'confidenceLevel', 'score']);
  return {
    provider: 'domain_avm',
    configured: true,
    source: 'domain',
    rentalEstimateWeekly: weekly,
    rentalRangeLow: low,
    rentalRangeHigh: high,
    confidence: (confidenceRaw as string | number | undefined) ?? null,
    raw: data,
  };
}

/**
 * Call the Domain Rental AVM "get rental estimate" endpoint. Returns a
 * normalized result. Never throws: missing key / non-200 / timeout all return
 * a result carrying `error` (or `configured:false`) so the server stays up.
 */
export async function getRentalEstimate(query: RentalEstimateQuery): Promise<RentalEstimateResult> {
  const apiKey = process.env.DOMAIN_API_KEY;
  if (!apiKey) {
    return {
      provider: 'domain_avm',
      configured: false,
      source: 'domain',
      message:
        'Domain AVM not configured (DOMAIN_API_KEY unset). Use the realestate.com.au link or enter the rent manually.',
    };
  }

  const base = (process.env.DOMAIN_API_BASE || DOMAIN_DEFAULT_BASE).replace(/\/+$/, '');
  const path = process.env.DOMAIN_RENTAL_ESTIMATE_PATH || DOMAIN_DEFAULT_PATH;
  const headerName = process.env.DOMAIN_API_KEY_HEADER || 'X-Api-Key';

  const params = new URLSearchParams();
  if (query.address) params.set('address', query.address);
  if (query.suburb) params.set('suburb', query.suburb);
  if (query.state) params.set('state', query.state);
  if (query.postcode) params.set('postcode', query.postcode);
  if (query.propertyType) params.set('propertyCategory', query.propertyType);
  if (query.bedrooms != null) params.set('bedrooms', String(query.bedrooms));
  if (query.bathrooms != null) params.set('bathrooms', String(query.bathrooms));
  if (query.carspaces != null) params.set('carspaces', String(query.carspaces));

  const url = `${base}${path}?${params.toString()}`;

  try {
    const res = await fetchWithTimeout(
      url,
      { method: 'GET', headers: buildDomainHeaders(apiKey, headerName) },
      DOMAIN_TIMEOUT_MS
    );
    if (!res.ok) {
      return {
        provider: 'domain_avm',
        configured: true,
        source: 'domain',
        error: `Domain API responded with HTTP ${res.status}.`,
      };
    }
    const data = (await res.json()) as Record<string, unknown>;
    return normalizeDomain(data);
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return {
      provider: 'domain_avm',
      configured: true,
      source: 'domain',
      error: aborted ? 'Domain API request timed out.' : 'Domain API request failed.',
    };
  }
}

// ---------------------------------------------------------------------------
// Apify generic connector
// ---------------------------------------------------------------------------
// Calls Apify's run-sync-get-dataset-items endpoint and normalizes the first
// dataset item. The chosen actor/task MUST output a value and/or rent field;
// this is a generic connector. Uses APIFY_ACTOR_ID (acts/...) or, if only
// APIFY_TASK_ID is set, the actor-tasks/... route.

const APIFY_BASE = 'https://api.apify.com/v2';
const APIFY_TIMEOUT_MS = 60_000;
/** Default Apify actor for realestate.com.au valuations (overridable via env). */
const DEFAULT_APIFY_ACTOR_ID = 'abotapi~realestate-au-scraper';
/** Async-mode polling cadence + ceiling. */
const APIFY_POLL_INTERVAL_MS = 2_000;
const APIFY_ASYNC_MAX_MS = 90_000;

/** Normalize the first Apify dataset item into our stable estimate shape. */
function normalizeApify(item: Record<string, unknown> | undefined): RentalEstimateResult {
  if (!item) {
    return {
      provider: 'apify',
      configured: true,
      source: 'apify',
      error: 'Apify run returned no dataset items.',
    };
  }
  // Map likely value fields defensively (the actor schema is not guaranteed).
  const value = toNumberOrNull(
    pick(item, ['estimatedValue', 'value', 'price', 'priceEstimate', 'estimate', 'salePrice', 'avm', 'valuation'])
  );
  const weekly = toNumberOrNull(
    pick(item, [
      'rentalEstimateWeekly', 'weeklyRent', 'rentPerWeek', 'rent', 'rentEstimate', 'rentalEstimate', 'weekly',
    ])
  );
  const low = toNumberOrNull(pick(item, ['rentalRangeLow', 'rentLow', 'lowerRange', 'priceLow', 'low']));
  const high = toNumberOrNull(pick(item, ['rentalRangeHigh', 'rentHigh', 'upperRange', 'priceHigh', 'high']));
  const confidenceRaw = pick(item, ['confidence', 'confidenceLevel', 'score']);
  const address = pick(item, ['address', 'displayAddress', 'fullAddress', 'streetAddress']);
  return {
    provider: 'apify',
    configured: true,
    source: 'apify',
    estimatedValue: value,
    rentalEstimateWeekly: weekly,
    rentalRangeLow: low,
    rentalRangeHigh: high,
    confidence: (confidenceRaw as string | number | undefined) ?? null,
    address: typeof address === 'string' ? address : undefined,
    raw: item,
  };
}

/**
 * Run an Apify actor/task and normalize the first dataset item.
 *
 * Run mode is controlled by APIFY_RUN_MODE (sync | async, default sync):
 *   - sync  -> POST /run-sync-get-dataset-items (one call, returns items)
 *   - async -> POST /runs, poll the run until it finishes, then GET the
 *              default dataset items.
 *
 * The actor id comes from APIFY_ACTOR_ID (default `abotapi~realestate-au-scraper`);
 * if only APIFY_TASK_ID is set, the actor-tasks route is used instead. The
 * token is supplied via APIFY_TOKEN and only ever sent as a query param (never
 * logged). The actor INPUT is built flexibly (address parts + a realestate.com.au
 * searchUrl + startUrls) so it works across likely actor input schemas.
 *
 * Never throws: missing token, non-200, empty dataset and timeout all return a
 * graceful result so the server stays up.
 */
export async function getApifyEstimate(query: RentalEstimateQuery): Promise<RentalEstimateResult> {
  const token = process.env.APIFY_TOKEN;
  const explicitActorId = process.env.APIFY_ACTOR_ID;
  const taskId = process.env.APIFY_TASK_ID;
  // Default to the realestate-au actor ONLY when neither an explicit actor nor
  // a saved task is configured, so an APIFY_TASK_ID-only setup still works.
  const actorId = explicitActorId || (taskId ? undefined : DEFAULT_APIFY_ACTOR_ID);
  const resourceId = actorId || taskId;

  if (!token || !resourceId) {
    return {
      provider: 'apify',
      configured: false,
      source: 'apify',
      message:
        'Apify not configured (APIFY_TOKEN required; APIFY_ACTOR_ID defaults to ' +
        `${DEFAULT_APIFY_ACTOR_ID}). Use the realestate.com.au link or enter values manually.`,
    };
  }

  // Prefer an explicit/default actor id; otherwise use the task route.
  const resourcePath = actorId
    ? `acts/${encodeURIComponent(actorId)}`
    : `actor-tasks/${encodeURIComponent(taskId as string)}`;

  // Build a realestate.com.au search URL from the address + postcode and pass a
  // flexible input that covers common actor schemas (free-text address parts,
  // a searchUrl, and a startUrls array).
  const searchUrl = buildRealestateLink({ address: query.address, postcode: query.postcode ?? null });
  const input = {
    address: query.address,
    postcode: query.postcode ?? undefined,
    suburb: query.suburb ?? undefined,
    state: query.state ?? undefined,
    propertyType: query.propertyType ?? undefined,
    bedrooms: query.bedrooms ?? undefined,
    bathrooms: query.bathrooms ?? undefined,
    carspaces: query.carspaces ?? undefined,
    searchUrl,
    startUrls: [{ url: searchUrl }],
  };

  const runMode = (process.env.APIFY_RUN_MODE || 'sync').toLowerCase();

  try {
    if (runMode === 'async') {
      return await runApifyAsync(resourcePath, token, input);
    }
    return await runApifySync(resourcePath, token, input);
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return {
      provider: 'apify',
      configured: true,
      source: 'apify',
      error: aborted ? 'Apify request timed out.' : 'Apify request failed.',
    };
  }
}

/** Synchronous run: one call returns the dataset items directly. */
async function runApifySync(
  resourcePath: string,
  token: string,
  input: Record<string, unknown>
): Promise<RentalEstimateResult> {
  const url = `${APIFY_BASE}/${resourcePath}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input),
    },
    APIFY_TIMEOUT_MS
  );
  if (!res.ok) {
    return { provider: 'apify', configured: true, source: 'apify', error: `Apify responded with HTTP ${res.status}.` };
  }
  const items = (await res.json()) as unknown;
  const first = Array.isArray(items) ? (items[0] as Record<string, unknown> | undefined) : undefined;
  return normalizeApify(first);
}

/**
 * Asynchronous run: start the run, poll until it finishes, then fetch the
 * default dataset items. All requests carry the token query param only.
 */
async function runApifyAsync(
  resourcePath: string,
  token: string,
  input: Record<string, unknown>
): Promise<RentalEstimateResult> {
  const startUrl = `${APIFY_BASE}/${resourcePath}/runs?token=${encodeURIComponent(token)}`;
  const startRes = await fetchWithTimeout(
    startUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input),
    },
    APIFY_TIMEOUT_MS
  );
  if (!startRes.ok) {
    return { provider: 'apify', configured: true, source: 'apify', error: `Apify responded with HTTP ${startRes.status}.` };
  }
  const started = (await startRes.json()) as { data?: { id?: string; defaultDatasetId?: string } };
  const runId = started?.data?.id;
  let datasetId = started?.data?.defaultDatasetId;
  if (!runId) {
    return { provider: 'apify', configured: true, source: 'apify', error: 'Apify run did not start.' };
  }

  // Poll the run status until it terminates or we hit the async ceiling.
  const deadline = Date.now() + APIFY_ASYNC_MAX_MS;
  let status = 'RUNNING';
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, APIFY_POLL_INTERVAL_MS));
    const statusUrl = `${APIFY_BASE}/actor-runs/${encodeURIComponent(runId)}?token=${encodeURIComponent(token)}`;
    const statusRes = await fetchWithTimeout(statusUrl, { method: 'GET', headers: { Accept: 'application/json' } }, APIFY_TIMEOUT_MS);
    if (!statusRes.ok) continue;
    const body = (await statusRes.json()) as { data?: { status?: string; defaultDatasetId?: string } };
    status = body?.data?.status || status;
    if (body?.data?.defaultDatasetId) datasetId = body.data.defaultDatasetId;
    if (status === 'SUCCEEDED' || status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') break;
  }

  if (status !== 'SUCCEEDED') {
    return { provider: 'apify', configured: true, source: 'apify', error: `Apify run did not succeed (status ${status}).` };
  }
  if (!datasetId) {
    return { provider: 'apify', configured: true, source: 'apify', error: 'Apify run produced no dataset.' };
  }

  const itemsUrl = `${APIFY_BASE}/datasets/${encodeURIComponent(datasetId)}/items?token=${encodeURIComponent(token)}`;
  const itemsRes = await fetchWithTimeout(itemsUrl, { method: 'GET', headers: { Accept: 'application/json' } }, APIFY_TIMEOUT_MS);
  if (!itemsRes.ok) {
    return { provider: 'apify', configured: true, source: 'apify', error: `Apify dataset fetch failed (HTTP ${itemsRes.status}).` };
  }
  const items = (await itemsRes.json()) as unknown;
  const first = Array.isArray(items) ? (items[0] as Record<string, unknown> | undefined) : undefined;
  return normalizeApify(first);
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

/** Standard "not configured" estimate for providers without an automated API. */
function notConfiguredEstimate(
  provider: ValuationProviderName,
  message: string
): RentalEstimateResult {
  return { provider, configured: false, source: provider, message };
}

/** Manual provider: no automated estimate, no link. */
class ManualProvider implements ValuationProvider {
  readonly name = 'manual' as const;
  buildLink(): string | null {
    return null;
  }
  async estimate(): Promise<ValuationResult> {
    return {
      provider: this.name,
      estimatedValue: null,
      link: null,
      source: 'Manual entry. Enter the estimated value directly.',
    };
  }
  async getRentalEstimate(): Promise<RentalEstimateResult> {
    return notConfiguredEstimate(
      this.name,
      'Manual entry only. Enter the rent and valuation directly.'
    );
  }
}

/** realestate.com.au deep-link provider (no value, link only). */
class RealestateLinkProvider implements ValuationProvider {
  readonly name = 'realestate_link' as const;
  buildLink(query: ValuationQuery): string {
    return buildRealestateLink(query);
  }
  async estimate(query: ValuationQuery): Promise<ValuationResult> {
    return {
      provider: this.name,
      estimatedValue: null,
      link: this.buildLink(query),
      source:
        'Opens the official realestate.com.au search/estimate page. ' +
        'No automated value (no free public API); enter the estimated value manually.',
    };
  }
  async getRentalEstimate(query: ValuationQuery): Promise<RentalEstimateResult> {
    return {
      ...notConfiguredEstimate(
        this.name,
        'No automated estimate. Open the realestate.com.au link and enter values manually.'
      ),
      // Surface the link so the UI can still offer it.
      message:
        'No automated estimate for this provider. Use the realestate.com.au link, then enter the rent manually.',
    };
  }
}

/** Domain Group Rental AVM provider (weekly rent estimate). */
class DomainAvmProvider implements ValuationProvider {
  readonly name = 'domain_avm' as const;
  buildLink(query: ValuationQuery): string {
    // Offer the realestate.com.au link as a convenience fallback.
    return buildRealestateLink(query);
  }
  async estimate(query: ValuationQuery): Promise<ValuationResult> {
    return {
      provider: this.name,
      estimatedValue: null, // Domain AVM returns RENT, not sale value; manual stays source of truth.
      link: this.buildLink(query),
      source: 'Domain Rental AVM returns a weekly rent estimate via /api/valuation/estimate.',
    };
  }
  getRentalEstimate(query: RentalEstimateQuery): Promise<RentalEstimateResult> {
    return getRentalEstimate(query);
  }
}

/** Apify generic connector provider (value and/or weekly rent). */
class ApifyProvider implements ValuationProvider {
  readonly name = 'apify' as const;
  buildLink(query: ValuationQuery): string {
    return buildRealestateLink(query);
  }
  async estimate(query: ValuationQuery): Promise<ValuationResult> {
    return {
      provider: this.name,
      estimatedValue: null,
      link: this.buildLink(query),
      source: 'Apify connector returns value/rent via /api/valuation/estimate.',
    };
  }
  getRentalEstimate(query: RentalEstimateQuery): Promise<RentalEstimateResult> {
    return getApifyEstimate(query);
  }
}

/**
 * External paid-API provider placeholder (back-compat alias). Wire a real HTTP
 * client here behind VALUATION_API_KEY when a key is available.
 */
class ExternalProvider implements ValuationProvider {
  readonly name = 'external' as const;
  buildLink(query: ValuationQuery): string {
    return buildRealestateLink(query);
  }
  async estimate(query: ValuationQuery): Promise<ValuationResult> {
    const hasKey = !!process.env.VALUATION_API_KEY;
    return {
      provider: this.name,
      estimatedValue: null,
      link: this.buildLink(query),
      source: hasKey
        ? 'External provider configured but not yet implemented. Enter the estimated value manually.'
        : 'No VALUATION_API_KEY set. Configure a paid provider or enter the value manually.',
    };
  }
  async getRentalEstimate(): Promise<RentalEstimateResult> {
    return notConfiguredEstimate(
      this.name,
      'External provider has no automated estimate wired. Enter values manually.'
    );
  }
}

/** Resolve the active provider from VALUATION_PROVIDER (default: manual). */
export function getValuationProvider(
  name: string | undefined = process.env.VALUATION_PROVIDER
): ValuationProvider {
  switch ((name || 'manual').toLowerCase()) {
    case 'realestate_link':
      return new RealestateLinkProvider();
    case 'domain_avm':
      return new DomainAvmProvider();
    case 'apify':
      return new ApifyProvider();
    case 'external':
      return new ExternalProvider();
    case 'manual':
    default:
      return new ManualProvider();
  }
}
