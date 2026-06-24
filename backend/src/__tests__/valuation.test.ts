/**
 * Unit tests for the pluggable valuation providers.
 *
 * These tests NEVER make real network calls — global.fetch is mocked so the
 * Domain AVM and Apify providers can be exercised deterministically. Live
 * external calls (which require an API key + outbound egress) only run on the
 * Render deployment.
 */
import {
  getValuationProvider,
  getRentalEstimate,
  getApifyEstimate,
  buildRealestateLink,
} from '../services/valuation';

type FetchMock = jest.Mock<Promise<unknown>, unknown[]>;

const ORIGINAL_ENV = { ...process.env };

function mockFetchOnce(status: number, body: unknown): FetchMock {
  const fn: FetchMock = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  (global as unknown as { fetch: FetchMock }).fetch = fn;
  return fn;
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  jest.restoreAllMocks();
  delete (global as unknown as { fetch?: unknown }).fetch;
});

describe('Provider selection (VALUATION_PROVIDER)', () => {
  test('defaults to manual when unset', () => {
    delete process.env.VALUATION_PROVIDER;
    expect(getValuationProvider().name).toBe('manual');
  });

  test('selects each provider by name (case-insensitive)', () => {
    expect(getValuationProvider('realestate_link').name).toBe('realestate_link');
    expect(getValuationProvider('DOMAIN_AVM').name).toBe('domain_avm');
    expect(getValuationProvider('apify').name).toBe('apify');
    expect(getValuationProvider('external').name).toBe('external');
    expect(getValuationProvider('unknown-thing').name).toBe('manual');
  });

  test('realestate link builder is URL-encoded', () => {
    const url = buildRealestateLink({ address: '12 Smith St, Bondi', postcode: '2026' });
    expect(url).toContain('realestate.com.au');
    expect(url).toContain(encodeURIComponent('12 Smith St, Bondi 2026'));
  });
});

describe('manual / realestate_link estimate fallback', () => {
  test('manual returns configured:false with a message', async () => {
    const r = await getValuationProvider('manual').getRentalEstimate({ address: '1 A St' });
    expect(r.configured).toBe(false);
    expect(r.provider).toBe('manual');
    expect(r.message).toBeTruthy();
  });

  test('realestate_link returns configured:false with a message', async () => {
    const r = await getValuationProvider('realestate_link').getRentalEstimate({ address: '1 A St' });
    expect(r.configured).toBe(false);
    expect(r.message).toMatch(/realestate\.com\.au/i);
  });
});

describe('Domain Rental AVM provider', () => {
  test('returns configured:false when DOMAIN_API_KEY is unset', async () => {
    delete process.env.DOMAIN_API_KEY;
    const r = await getRentalEstimate({ address: '1 A St', postcode: '2026' });
    expect(r.configured).toBe(false);
    expect(r.rentalEstimateWeekly).toBeUndefined();
    expect(r.message).toMatch(/DOMAIN_API_KEY/);
  });

  test('normalizes a successful rental estimate and sends the X-Api-Key header', async () => {
    process.env.DOMAIN_API_KEY = 'test-key';
    delete process.env.DOMAIN_API_KEY_HEADER;
    const fetchMock = mockFetchOnce(200, {
      rentalEstimateWeekly: 650,
      lowerRangeRent: 600,
      upperRangeRent: 700,
      confidence: 'HIGH',
    });

    const r = await getRentalEstimate({
      address: '12 Smith St',
      postcode: '2026',
      suburb: 'Bondi',
      state: 'NSW',
      bedrooms: 3,
    });

    expect(r.configured).toBe(true);
    expect(r.source).toBe('domain');
    expect(r.rentalEstimateWeekly).toBe(650);
    expect(r.rentalRangeLow).toBe(600);
    expect(r.rentalRangeHigh).toBe(700);
    expect(r.confidence).toBe('HIGH');

    // Header + query assertions (key sent via default X-Api-Key header).
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('api.domain.com.au');
    expect(calledUrl).toContain('postcode=2026');
    expect(calledUrl).toContain('bedrooms=3');
    expect((init.headers as Record<string, string>)['X-Api-Key']).toBe('test-key');
  });

  test('sends a Bearer token when DOMAIN_API_KEY_HEADER=Authorization', async () => {
    process.env.DOMAIN_API_KEY = 'abc123';
    process.env.DOMAIN_API_KEY_HEADER = 'Authorization';
    const fetchMock = mockFetchOnce(200, { weeklyRent: 500 });

    await getRentalEstimate({ address: '1 A St' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer abc123');
  });

  test('handles a non-200 gracefully (no throw)', async () => {
    process.env.DOMAIN_API_KEY = 'test-key';
    mockFetchOnce(403, { message: 'forbidden' });
    const r = await getRentalEstimate({ address: '1 A St' });
    expect(r.configured).toBe(true);
    expect(r.error).toMatch(/HTTP 403/);
    expect(r.rentalEstimateWeekly).toBeUndefined();
  });

  test('handles a thrown fetch error gracefully', async () => {
    process.env.DOMAIN_API_KEY = 'test-key';
    (global as unknown as { fetch: jest.Mock }).fetch = jest
      .fn()
      .mockRejectedValue(new Error('network down'));
    const r = await getRentalEstimate({ address: '1 A St' });
    expect(r.configured).toBe(true);
    expect(r.error).toMatch(/failed/i);
  });
});

describe('Apify connector', () => {
  test('returns configured:false when token/actor missing', async () => {
    delete process.env.APIFY_TOKEN;
    delete process.env.APIFY_ACTOR_ID;
    delete process.env.APIFY_TASK_ID;
    const r = await getApifyEstimate({ address: '1 A St' });
    expect(r.configured).toBe(false);
    expect(r.message).toMatch(/APIFY_TOKEN/);
  });

  test('normalizes the first dataset item from a successful run', async () => {
    process.env.APIFY_TOKEN = 'apify-token';
    process.env.APIFY_ACTOR_ID = 'me~my-actor';
    const fetchMock = mockFetchOnce(200, [
      { estimatedValue: 1200000, rentPerWeek: 780, confidence: 0.82 },
      { estimatedValue: 0 },
    ]);

    const r = await getApifyEstimate({ address: '12 Smith St', postcode: '2026' });

    expect(r.configured).toBe(true);
    expect(r.source).toBe('apify');
    expect(r.estimatedValue).toBe(1200000);
    expect(r.rentalEstimateWeekly).toBe(780);
    expect(r.confidence).toBe(0.82);

    // POSTs to the run-sync-get-dataset-items endpoint with the token query param.
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('api.apify.com/v2/acts/');
    expect(calledUrl).toContain('run-sync-get-dataset-items');
    expect(calledUrl).toContain('token=apify-token');
    expect(init.method).toBe('POST');
  });

  test('uses the actor-tasks route when only APIFY_TASK_ID is set', async () => {
    process.env.APIFY_TOKEN = 'apify-token';
    delete process.env.APIFY_ACTOR_ID;
    process.env.APIFY_TASK_ID = 'my-task';
    const fetchMock = mockFetchOnce(200, [{ rent: 500 }]);

    await getApifyEstimate({ address: '1 A St' });

    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl).toContain('api.apify.com/v2/actor-tasks/my-task');
  });

  test('handles an empty dataset gracefully', async () => {
    process.env.APIFY_TOKEN = 'apify-token';
    process.env.APIFY_ACTOR_ID = 'me~my-actor';
    mockFetchOnce(200, []);
    const r = await getApifyEstimate({ address: '1 A St' });
    expect(r.configured).toBe(true);
    expect(r.error).toMatch(/no dataset items/i);
  });

  test('handles a non-200 gracefully', async () => {
    process.env.APIFY_TOKEN = 'apify-token';
    process.env.APIFY_ACTOR_ID = 'me~my-actor';
    mockFetchOnce(429, { error: 'rate limited' });
    const r = await getApifyEstimate({ address: '1 A St' });
    expect(r.configured).toBe(true);
    expect(r.error).toMatch(/HTTP 429/);
  });

  test('defaults to the realestate-au actor when APIFY_ACTOR_ID is unset', async () => {
    process.env.APIFY_TOKEN = 'apify-token';
    delete process.env.APIFY_ACTOR_ID;
    delete process.env.APIFY_TASK_ID;
    const fetchMock = mockFetchOnce(200, [{ price: 950000 }]);

    const r = await getApifyEstimate({ address: '12 Smith St', postcode: '2026' });
    expect(r.configured).toBe(true);
    expect(r.estimatedValue).toBe(950000);

    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    // Default actor id `abotapi~realestate-au-scraper` is URL-encoded into the path.
    expect(calledUrl).toContain('api.apify.com/v2/acts/');
    expect(calledUrl).toContain(encodeURIComponent('abotapi~realestate-au-scraper'));
  });

  test('builds a flexible input with searchUrl + startUrls', async () => {
    process.env.APIFY_TOKEN = 'apify-token';
    process.env.APIFY_ACTOR_ID = 'me~my-actor';
    const fetchMock = mockFetchOnce(200, [{ priceEstimate: 1010000, rentEstimate: 720 }]);

    const r = await getApifyEstimate({ address: '12 Smith St', postcode: '2026' });
    // priceEstimate / rentEstimate are mapped defensively.
    expect(r.estimatedValue).toBe(1010000);
    expect(r.rentalEstimateWeekly).toBe(720);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(typeof body.searchUrl).toBe('string');
    expect(body.searchUrl).toContain('realestate.com.au');
    expect(Array.isArray(body.startUrls)).toBe(true);
    expect(body.startUrls[0].url).toContain('realestate.com.au');
  });

  test('async run mode starts a run, polls, then reads the dataset', async () => {
    process.env.APIFY_TOKEN = 'apify-token';
    process.env.APIFY_ACTOR_ID = 'me~my-actor';
    process.env.APIFY_RUN_MODE = 'async';

    const fn = jest
      .fn()
      // 1) start run
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: { id: 'run1', defaultDatasetId: 'ds1' } }) })
      // 2) poll status -> SUCCEEDED
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: { status: 'SUCCEEDED', defaultDatasetId: 'ds1' } }) })
      // 3) dataset items
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [{ estimatedValue: 880000, rentPerWeek: 640 }] });
    (global as unknown as { fetch: jest.Mock }).fetch = fn;

    const r = await getApifyEstimate({ address: '9 Ocean Rd', postcode: '2099' });
    expect(r.configured).toBe(true);
    expect(r.estimatedValue).toBe(880000);
    expect(r.rentalEstimateWeekly).toBe(640);

    const [startUrl, startInit] = fn.mock.calls[0] as [string, RequestInit];
    expect(startUrl).toContain('/runs?token=apify-token');
    expect(startInit.method).toBe('POST');
    const [pollUrl] = fn.mock.calls[1] as [string];
    expect(pollUrl).toContain('actor-runs/run1');
    const [itemsUrl] = fn.mock.calls[2] as [string];
    expect(itemsUrl).toContain('datasets/ds1/items');
  });
});
