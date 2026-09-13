// Hand-rolled Graph HTTP client (ADR-003). Owns three exact, non-standard
// behaviors the spec requires and the Graph SDK makes hard to guarantee:
//   - pagination follows @odata.nextLink verbatim, never $skip (C-4)
//   - 429 waits exactly Retry-After, not a fixed/exponential backoff (C-5)
//   - 401 triggers one silent-refresh retry before bubbling up to
//     interactive login (spec §5)
//
// This module knows nothing about MSAL, React, or devices — callers inject
// token acquisition and (in tests) a fake waitFn so 429 tests don't sleep
// for real seconds.

export class GraphHttpError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(message: string, status: number, url: string) {
    super(message);
    this.name = 'GraphHttpError';
    this.status = status;
    this.url = url;
  }
}

/** Thrown when a 401 survives one silent-refresh retry — caller should
 * fall back to interactive login. */
export class GraphAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphAuthError';
  }
}

export interface GraphPage<T> {
  value: T[];
  nextLink: string | null;
}

export type WaitFn = (ms: number) => Promise<void>;

export const defaultWaitFn: WaitFn = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface GraphRequestOptions {
  /** Returns the current bearer token, acquired silently where possible. */
  getAccessToken: () => Promise<string>;
  /** Called once on a 401; must return a freshly (silently) acquired token.
   * If it throws or is omitted, a 401 becomes a GraphAuthError immediately. */
  refreshAccessToken?: () => Promise<string>;
  /** Injectable for tests; defaults to a real setTimeout-based sleep. */
  waitFn?: WaitFn;
  /** Extra fetch init (method, body, headers) merged with the Bearer header. */
  init?: RequestInit;
}

// Security fix (Phase 1 audit, finding #2): @odata.nextLink is followed
// verbatim per spec C-4 (never reconstructed with $skip), but the bearer
// token must never be attached to a URL outside Microsoft Graph. Graph
// itself never returns a foreign nextLink today; this is defense-in-depth
// against a future proxy/compromise scenario, not a fix for an observed bug.
const ALLOWED_GRAPH_HOSTS = new Set(['graph.microsoft.com', 'graph.microsoft.us', 'dod-graph.microsoft.us', 'graph.microsoft.de', 'microsoftgraph.chinacloudapi.cn']);

export function assertTrustedGraphUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new GraphHttpError(`Refusing to call malformed Graph URL: ${url}`, 0, url);
  }
  if (parsed.protocol !== 'https:' || !ALLOWED_GRAPH_HOSTS.has(parsed.host)) {
    throw new GraphHttpError(
      `Refusing to attach an access token to an untrusted host: ${parsed.host}`,
      0,
      url,
    );
  }
}

function parseRetryAfterSeconds(header: string | null): number {
  if (!header) return 1;
  const asInt = Number.parseInt(header, 10);
  if (Number.isFinite(asInt) && asInt >= 0) return asInt;
  // Retry-After can also be an HTTP date; fall back to a conservative 1s
  // wait rather than guessing at a duration.
  const asDate = Date.parse(header);
  if (!Number.isNaN(asDate)) {
    return Math.max(0, Math.ceil((asDate - Date.now()) / 1000));
  }
  return 1;
}

/**
 * Issues one Graph HTTP request with 401-refresh-once and
 * 429-Retry-After-once handling. Does not paginate — see `fetchAllPages`
 * for the nextLink loop built on top of this.
 */
export async function graphRequest(
  url: string,
  options: GraphRequestOptions,
): Promise<Response> {
  assertTrustedGraphUrl(url);
  const waitFn = options.waitFn ?? defaultWaitFn;
  let token = await options.getAccessToken();
  let usedRefresh = false;
  let usedRetryAfter = false;

  // Bounded loop: at most one 401-refresh retry and one 429-wait retry.
  for (; ;) {
    const response = await fetch(url, {
      ...options.init,
      headers: {
        ...(options.init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 401 && !usedRefresh) {
      usedRefresh = true;
      if (!options.refreshAccessToken) {
        throw new GraphAuthError(
          'Graph request returned 401 and no refresh handler was provided.',
        );
      }
      try {
        token = await options.refreshAccessToken();
      } catch {
        throw new GraphAuthError(
          'Silent token refresh failed after a 401 from Graph.',
        );
      }
      continue;
    }

    if (response.status === 429 && !usedRetryAfter) {
      usedRetryAfter = true;
      const retryAfterSeconds = parseRetryAfterSeconds(
        response.headers.get('Retry-After'),
      );
      await waitFn(retryAfterSeconds * 1000);
      continue;
    }

    if (!response.ok) {
      const responseBody = await response.text();
      const detail = responseBody ? `: ${responseBody.slice(0, 500)}` : '';
      throw new GraphHttpError(
        `Graph request to ${url} failed with ${response.status}${detail}`,
        response.status,
        url,
      );
    }

    return response;
  }
}

/**
 * Follows @odata.nextLink verbatim until it is absent (C-4). Never
 * reconstructs pagination with $skip. Calls `onPage` after each page so
 * callers can drive a "Fetched N of ~M..." progress indicator.
 */
export async function fetchAllPages<T>(
  initialUrl: string,
  options: GraphRequestOptions & {
    onPage?: (info: { pageCount: number; totalSoFar: number }) => void;
  },
): Promise<T[]> {
  const results: T[] = [];
  let url: string | null = initialUrl;

  while (url) {
    const response = await graphRequest(url, options);
    const body = (await response.json()) as {
      value: T[];
      '@odata.nextLink'?: string;
    };
    results.push(...body.value);
    options.onPage?.({
      pageCount: body.value.length,
      totalSoFar: results.length,
    });
    url = body['@odata.nextLink'] ?? null;
  }

  return results;
}

/** Fetches a single page (used by graphClient.test.ts to assert nextLink
 * is followed verbatim without decoding/rebuilding it). */
export async function fetchPage<T>(
  url: string,
  options: GraphRequestOptions,
): Promise<GraphPage<T>> {
  const response = await graphRequest(url, options);
  const body = (await response.json()) as {
    value: T[];
    '@odata.nextLink'?: string;
  };
  return { value: body.value, nextLink: body['@odata.nextLink'] ?? null };
}
