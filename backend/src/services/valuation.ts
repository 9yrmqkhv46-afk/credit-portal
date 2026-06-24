/**
 * Pluggable property-valuation provider abstraction.
 *
 * IMPORTANT (and by design): realestate.com.au has NO free public valuation
 * API, and scraping it violates their Terms of Service and is unreliable. So we
 * DO NOT scrape. Instead, the default `realestate_link` provider simply builds a
 * deep link to the official realestate.com.au search/estimate page for an
 * address so the broker can open the lender-grade estimate themselves. The
 * manual "Est. valuation" the broker types remains the source of truth used by
 * the servicing/ROI engine.
 *
 * A paid data provider (PropTrack, CoreLogic, Domain, etc.) can be plugged into
 * the SAME interface later by implementing `ValuationProvider.estimate()` with a
 * real HTTP call gated behind an API key — no engine/route changes required.
 *
 * Provider is selected via the VALUATION_PROVIDER env var:
 *   manual          -> no automated estimate; manual entry only (DEFAULT)
 *   realestate_link -> build a realestate.com.au deep link (no estimate value)
 *   external        -> placeholder for a future paid API (returns no estimate
 *                      until a key + implementation are supplied)
 */

export type ValuationProviderName = 'manual' | 'realestate_link' | 'external';

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

export interface ValuationProvider {
  readonly name: ValuationProviderName;
  /** Build a deep link to an external estimate page (may be null). */
  buildLink(query: ValuationQuery): string | null;
  /** Return an automated estimate if the provider supports one. */
  estimate(query: ValuationQuery): Promise<ValuationResult>;
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
}

/**
 * External paid-API provider placeholder. Wire a real HTTP client here behind
 * VALUATION_API_KEY (PropTrack/CoreLogic/Domain) when a key is available.
 */
class ExternalProvider implements ValuationProvider {
  readonly name = 'external' as const;
  buildLink(query: ValuationQuery): string {
    // Still offer the realestate.com.au link as a convenience fallback.
    return buildRealestateLink(query);
  }
  async estimate(query: ValuationQuery): Promise<ValuationResult> {
    const hasKey = !!process.env.VALUATION_API_KEY;
    return {
      provider: this.name,
      estimatedValue: null, // No real call wired yet; manual entry remains source of truth.
      link: this.buildLink(query),
      source: hasKey
        ? 'External provider configured but not yet implemented. Enter the estimated value manually.'
        : 'No VALUATION_API_KEY set. Configure a paid provider or enter the value manually.',
    };
  }
}

/** Resolve the active provider from VALUATION_PROVIDER (default: manual). */
export function getValuationProvider(
  name: string | undefined = process.env.VALUATION_PROVIDER
): ValuationProvider {
  switch ((name || 'manual').toLowerCase()) {
    case 'realestate_link':
      return new RealestateLinkProvider();
    case 'external':
      return new ExternalProvider();
    case 'manual':
    default:
      return new ManualProvider();
  }
}
