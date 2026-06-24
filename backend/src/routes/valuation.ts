import { Router, Request, Response } from 'express';
import { buildRealestateLink, getValuationProvider } from '../services/valuation';

/**
 * Property-valuation deep-link endpoint.
 *
 * GET /api/valuation/link?address=...&postcode=...[&redirect=1]
 *   - Returns a realestate.com.au search/estimate URL built from the address +
 *     postcode (URL-encoded) so the broker can open the official estimate page.
 *   - With redirect=1, responds with a 302 redirect to that URL instead of JSON.
 *
 * This is a LINK BUILDER only: it never calls or scrapes realestate.com.au.
 * Public (no auth) because it returns no user data — just a constructed URL.
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

export default router;
