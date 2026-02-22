/**
 * Socrata Open Data API (SODA) client.
 * Shared across all city adapters since all Tier 1 cities use Socrata.
 */

export interface SocrataConfig {
  /** Base URL, e.g. "data.seattle.gov" */
  domain: string;
  /** Dataset ID, e.g. "tazs-3rd5" */
  datasetId: string;
  /** Optional Socrata app token for higher rate limits */
  appToken?: string;
  /** Max retries on 429 (default: 3) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 1000) */
  baseDelayMs?: number;
}

export interface SocrataQueryParams {
  $where?: string;
  $limit?: number;
  $offset?: number;
  $order?: string;
  $select?: string;
}

export interface SocrataFetchOptions {
  /** Records per page (default: 50000) */
  pageSize?: number;
  /** SoQL $where clause */
  where?: string;
  /** SoQL $order clause (default: ':id') */
  order?: string;
  /** SoQL $select clause */
  select?: string;
}

const DEFAULT_PAGE_SIZE = 50_000;

export class SocrataClient {
  private readonly baseUrl: string;
  private readonly appToken?: string;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;

  constructor(private readonly config: SocrataConfig) {
    this.baseUrl = `https://${config.domain}/resource/${config.datasetId}.json`;
    this.appToken = config.appToken;
    this.maxRetries = config.maxRetries ?? 3;
    this.baseDelayMs = config.baseDelayMs ?? 1_000;
  }

  /**
   * Fetch a single page of results.
   */
  async fetchPage<T = Record<string, unknown>>(
    params: SocrataQueryParams = {},
  ): Promise<T[]> {
    const url = new URL(this.baseUrl);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (this.appToken) {
      headers['X-App-Token'] = this.appToken;
    }

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      const response = await fetch(url.toString(), { headers });

      if (response.ok) {
        return (await response.json()) as T[];
      }

      if (response.status === 429) {
        // Rate limited — exponential backoff
        const delay = this.baseDelayMs * Math.pow(2, attempt);
        await sleep(delay);
        lastError = new Error(`Rate limited (429) on attempt ${attempt + 1}`);
        continue;
      }

      // Non-retryable error
      const body = await response.text();
      throw new Error(
        `Socrata API error ${response.status}: ${body}`,
      );
    }

    throw lastError ?? new Error('Socrata API: max retries exceeded');
  }

  /**
   * Fetch all records with automatic pagination.
   * Yields pages of records as async generator.
   */
  async *fetchAll<T = Record<string, unknown>>(
    options: SocrataFetchOptions = {},
  ): AsyncGenerator<T[], void, undefined> {
    const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    let offset = 0;

    while (true) {
      const params: SocrataQueryParams = {
        $limit: pageSize,
        $offset: offset,
        $order: options.order ?? ':id',
      };
      if (options.where) params.$where = options.where;
      if (options.select) params.$select = options.select;

      const page = await this.fetchPage<T>(params);
      if (page.length === 0) break;

      yield page;
      offset += page.length;

      // If we got fewer than pageSize, we've reached the end
      if (page.length < pageSize) break;
    }
  }

  /**
   * Count total records matching a filter.
   */
  async count(where?: string): Promise<number> {
    const params: SocrataQueryParams = {
      $select: 'count(*) as count',
    };
    if (where) params.$where = where;

    const [row] = await this.fetchPage<{ count: string }>(params);
    return Number(row.count);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
