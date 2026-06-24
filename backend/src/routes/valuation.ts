import { Router, Request, Response } from 'express';
import {
  buildRealestateLink,
  getValuationProvider,
  RentalEstimateQuery,
} from '../services/valuation';
import { authenticate } from '../middleware/auth';

/**
 * Property-valuation endpoints.
 *
 * GET /api/valuation/link?address=...&postcode=...[&redirect=1]
 *   - Returns a realestate.com.au search/estimate URL built from the address +
 *     postcode (URL-encoded) so the broker can open the official estimate page.
 *   - With redirect=1, responds with a 302 redirect to that URL instead of JSON.
 *   - LINK BUILDER only: never calls or scrapes realestate.com.au. Public (no
 *     auth) because it returns no user data — just a constructed URL.
 *
 * GET /api/valuation/estimate?address=...&postcode=...&suburb=...&state=...
 *                            &propertyType=...&bedrooms=...&bathrooms=...&carspaces=...
 *   - Runs the configured automated provider (domain_avm / apify) and returns a
 *     normalized estimate JSON. For manual / realestate_link providers it
 *     returns { provider, configured:false, message } so the UI can fall back
 *     to the realestate.com.au link button + manual entry.
 *   - Auth-protected. The API key is NEVER logged or returned.
 */
const router = Router();

router.get('/link', (req: Request, res: Response): void => {
  const address = typeof req.query.address === 'string' ? req.query.address : '';
  const postcode = typeof req.query.postcode === 'string' ? req.query.postcode : '';

  if (!address.trim() && !postcode.trim()) {
    res.status(400).json({ error: 'An address or postcode is required.' });
    return;
  }

  const url = buildRealestateLink({ address, postcode });
  const provider = getValuationProvider().name;

  if (req.query.redirect === '1' || req.query.redirect === 'true') {
    res.redirect(302, url);
    return;
  }

  res.json({
    provider,
    url,
    source:
      'realestate.com.au search link (no automated value; enter the estimated value manually).',
  });
});

/** Coerce a query-string value to a number, or undefined when absent/blank. */
function queryNum(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Coerce a query-string value to a trimmed string, or undefined when absent. */
function queryStr(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t === '' ? undefined : t;
}

router.get('/estimate', authenticate, async (req: Request, res: Response): Promise<void> => {
  const address = queryStr(req.query.address);
  const postcode = queryStr(req.query.postcode);

  if (!address && !postcode) {
    res.status(400).json({ error: 'An address or postcode is required.' });
    return;
  }

  const query: RentalEstimateQuery = {
    address: address ?? '',
    postcode: postcode ?? null,
    suburb: queryStr(req.query.suburb) ?? null,
    state: queryStr(req.query.state) ?? null,
    propertyType: queryStr(req.query.propertyType) ?? null,
    bedrooms: queryNum(req.query.bedrooms) ?? null,
    bathrooms: queryNum(req.query.bathrooms) ?? null,
    carspaces: queryNum(req.query.carspaces) ?? null,
  };

  const provider = getValuationProvider();

  try {
    const result = await provider.getRentalEstimate(query);
    res.json(result);
  } catch {
    // Defensive: providers are written not to throw, but never crash the route.
    res.status(200).json({
      provider: provider.name,
      configured: false,
      source: provider.name,
      error: 'Unable to retrieve an automated estimate. Enter the value manually.',
    });
  }
});

export default router;
