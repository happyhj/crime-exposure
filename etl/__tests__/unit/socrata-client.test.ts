import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SocrataClient } from '../../src/adapters/socrata-client.js';

function mockFetchResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response;
}

// Use minimal delay for tests
const TEST_CONFIG = {
  domain: 'data.seattle.gov',
  datasetId: 'tazs-3rd5',
  baseDelayMs: 1,
} as const;

describe('SocrataClient', () => {
  const client = new SocrataClient(TEST_CONFIG);

  const clientWithToken = new SocrataClient({
    ...TEST_CONFIG,
    appToken: 'test-token-123',
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchPage', () => {
    it('fetches a single page with correct URL params', async () => {
      const mockData = [{ id: 1 }, { id: 2 }];
      vi.mocked(fetch).mockResolvedValue(mockFetchResponse(mockData));

      const result = await client.fetchPage({ $limit: 10, $offset: 0 });

      expect(result).toEqual(mockData);
      expect(fetch).toHaveBeenCalledTimes(1);

      const calledUrl = new URL(vi.mocked(fetch).mock.calls[0][0] as string);
      expect(calledUrl.origin + calledUrl.pathname).toBe(
        'https://data.seattle.gov/resource/tazs-3rd5.json',
      );
      expect(calledUrl.searchParams.get('$limit')).toBe('10');
      expect(calledUrl.searchParams.get('$offset')).toBe('0');
    });

    it('sends X-App-Token header when configured', async () => {
      vi.mocked(fetch).mockResolvedValue(mockFetchResponse([]));

      await clientWithToken.fetchPage();

      const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>;
      expect(headers['X-App-Token']).toBe('test-token-123');
    });

    it('throws on non-429 HTTP errors', async () => {
      vi.mocked(fetch).mockResolvedValue(mockFetchResponse({ error: 'bad' }, 400));

      await expect(client.fetchPage()).rejects.toThrow('Socrata API error 400');
    });

    it('retries on 429 with exponential backoff', async () => {
      const mockData = [{ id: 1 }];

      vi.mocked(fetch)
        .mockResolvedValueOnce(mockFetchResponse(null, 429))
        .mockResolvedValueOnce(mockFetchResponse(mockData));

      const result = await client.fetchPage();

      expect(result).toEqual(mockData);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('throws after max retries on persistent 429', async () => {
      vi.mocked(fetch)
        .mockResolvedValue(mockFetchResponse(null, 429));

      await expect(client.fetchPage()).rejects.toThrow('Rate limited (429)');
      expect(fetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('fetchAll', () => {
    it('paginates through all pages', async () => {
      const page1 = Array.from({ length: 100 }, (_, i) => ({ id: i }));
      const page2 = Array.from({ length: 50 }, (_, i) => ({ id: 100 + i }));

      vi.mocked(fetch)
        .mockResolvedValueOnce(mockFetchResponse(page1))
        .mockResolvedValueOnce(mockFetchResponse(page2));

      const allPages: unknown[][] = [];
      for await (const page of client.fetchAll({ pageSize: 100 })) {
        allPages.push(page);
      }

      expect(allPages).toHaveLength(2);
      expect(allPages[0]).toHaveLength(100);
      expect(allPages[1]).toHaveLength(50);
    });

    it('stops when empty page returned', async () => {
      const page1 = [{ id: 1 }];

      vi.mocked(fetch)
        .mockResolvedValueOnce(mockFetchResponse(page1))
        .mockResolvedValueOnce(mockFetchResponse([]));

      const allPages: unknown[][] = [];
      for await (const page of client.fetchAll({ pageSize: 100 })) {
        allPages.push(page);
      }

      expect(allPages).toHaveLength(1);
    });

    it('passes where clause to each page request', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(mockFetchResponse([]));

      const pages: unknown[][] = [];
      for await (const page of client.fetchAll({
        where: "date > '2024-01-01'",
        pageSize: 10,
      })) {
        pages.push(page);
      }

      const calledUrl = new URL(vi.mocked(fetch).mock.calls[0][0] as string);
      expect(calledUrl.searchParams.get('$where')).toBe("date > '2024-01-01'");
    });
  });

  describe('count', () => {
    it('returns count from Socrata', async () => {
      vi.mocked(fetch).mockResolvedValue(mockFetchResponse([{ count: '42' }]));

      const result = await client.count();
      expect(result).toBe(42);

      const calledUrl = new URL(vi.mocked(fetch).mock.calls[0][0] as string);
      expect(calledUrl.searchParams.get('$select')).toBe('count(*) as count');
    });

    it('passes where clause for filtered count', async () => {
      vi.mocked(fetch).mockResolvedValue(mockFetchResponse([{ count: '10' }]));

      await client.count("city = 'seattle'");

      const calledUrl = new URL(vi.mocked(fetch).mock.calls[0][0] as string);
      expect(calledUrl.searchParams.get('$where')).toBe("city = 'seattle'");
    });
  });
});
