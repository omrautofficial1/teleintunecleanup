import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertTrustedGraphUrl,
  fetchAllPages,
  fetchPage,
  GraphAuthError,
  GraphHttpError,
  graphRequest,
} from './graphClient';
import { deleteManagedDevice, listManagedDevices } from './devices';
import { server } from '../test/mswServer';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const LIST_URL = `${GRAPH_BASE}/deviceManagement/managedDevices`;

function baseOptions(overrides: Partial<Parameters<typeof graphRequest>[1]> = {}) {
  return {
    getAccessToken: vi.fn().mockResolvedValue('read-token'),
    waitFn: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('graphClient — pagination follows @odata.nextLink verbatim', () => {
  it('follows nextLink across three pages without reconstructing $skip', async () => {
    const page1Url = `${LIST_URL}?$select=id&$top=999`;
    const page2Url = `${GRAPH_BASE}/deviceManagement/managedDevices/page2?nextpage=abc123opaque`;
    const page3Url = `${GRAPH_BASE}/deviceManagement/managedDevices/page3?nextpage=def456opaque`;

    const seenUrls: string[] = [];
    server.use(
      http.get(LIST_URL, ({ request }) => {
        seenUrls.push(request.url);
        return HttpResponse.json({
          value: [{ id: '1' }],
          '@odata.nextLink': page2Url,
        });
      }),
      http.get(`${GRAPH_BASE}/deviceManagement/managedDevices/page2`, ({ request }) => {
        seenUrls.push(request.url);
        return HttpResponse.json({
          value: [{ id: '2' }],
          '@odata.nextLink': page3Url,
        });
      }),
      http.get(`${GRAPH_BASE}/deviceManagement/managedDevices/page3`, ({ request }) => {
        seenUrls.push(request.url);
        return HttpResponse.json({ value: [{ id: '3' }] }); // no nextLink: last page
      }),
    );

    const results = await fetchAllPages<{ id: string }>(page1Url, baseOptions());

    expect(results.map((r) => r.id)).toEqual(['1', '2', '3']);
    // Assert the opaque nextLink URLs were hit verbatim, not rebuilt with $skip.
    expect(seenUrls[1]).toContain('nextpage=abc123opaque');
    expect(seenUrls[1]).not.toContain('$skip');
    expect(seenUrls[2]).toContain('nextpage=def456opaque');
    expect(seenUrls[2]).not.toContain('$skip');
  });

  it('does not drop or duplicate records across pages', async () => {
    const page1Url = `${LIST_URL}?$select=id&$top=999`;
    const page2Url = `${GRAPH_BASE}/deviceManagement/managedDevices/page2?nextpage=xyz`;

    server.use(
      http.get(LIST_URL, () =>
        HttpResponse.json({ value: [{ id: 'a' }, { id: 'b' }], '@odata.nextLink': page2Url }),
      ),
      http.get(`${GRAPH_BASE}/deviceManagement/managedDevices/page2`, () =>
        HttpResponse.json({ value: [{ id: 'c' }] }),
      ),
    );

    const results = await fetchAllPages<{ id: string }>(page1Url, baseOptions());
    expect(results.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('fetchPage returns the raw nextLink untouched for callers to follow', async () => {
    const url = `${LIST_URL}?$select=id&$top=999`;
    const nextLink = `${GRAPH_BASE}/deviceManagement/managedDevices/page2?opaque=1`;
    server.use(
      http.get(LIST_URL, () =>
        HttpResponse.json({ value: [{ id: '1' }], '@odata.nextLink': nextLink }),
      ),
    );

    const page = await fetchPage<{ id: string }>(url, baseOptions());
    expect(page.nextLink).toBe(nextLink);
  });
});

// Phase 1 security audit, finding #2: the bearer token must never be
// attached to a request outside Microsoft Graph, including a hypothetical
// off-host @odata.nextLink.
describe('graphClient — refuses to attach the token to an untrusted host', () => {
  it('allows the real Graph host', () => {
    expect(() => assertTrustedGraphUrl(`${GRAPH_BASE}/deviceManagement/managedDevices`)).not.toThrow();
  });

  it('rejects a non-Graph host outright', () => {
    expect(() => assertTrustedGraphUrl('https://evil.example/steal-token')).toThrow(GraphHttpError);
  });

  it('rejects downgrading to plain http even on the real host', () => {
    expect(() => assertTrustedGraphUrl('http://graph.microsoft.com/v1.0/managedDevices')).toThrow(GraphHttpError);
  });

  it('fetchAllPages stops and throws rather than following an off-host nextLink', async () => {
    server.use(
      http.get(LIST_URL, () =>
        HttpResponse.json({ value: [{ id: '1' }], '@odata.nextLink': 'https://evil.example/page2' }),
      ),
    );

    await expect(
      fetchAllPages(`${LIST_URL}?$select=id&$top=999`, baseOptions()),
    ).rejects.toThrow(GraphHttpError);
  });
});

describe('graphClient — 429 honors Retry-After exactly', () => {
  it('waits exactly the Retry-After seconds (in ms) before retrying, not a fixed backoff', async () => {
    let callCount = 0;
    server.use(
      http.get(LIST_URL, () => {
        callCount += 1;
        if (callCount === 1) {
          return new HttpResponse(null, { status: 429, headers: { 'Retry-After': '7' } });
        }
        return HttpResponse.json({ value: [{ id: '1' }] });
      }),
    );

    const waitFn = vi.fn().mockResolvedValue(undefined);
    const results = await fetchAllPages<{ id: string }>(
      `${LIST_URL}?$select=id&$top=999`,
      baseOptions({ waitFn }),
    );

    expect(waitFn).toHaveBeenCalledTimes(1);
    expect(waitFn).toHaveBeenCalledWith(7000); // 7 seconds exactly, in ms
    expect(results).toHaveLength(1);
    expect(callCount).toBe(2);
  });

  it('does not retry immediately or with a fixed/exponential backoff on 429', async () => {
    server.use(
      http.get(LIST_URL, () => new HttpResponse(null, { status: 429, headers: { 'Retry-After': '3' } })),
    );

    const waitFn = vi.fn().mockResolvedValue(undefined);
    await expect(
      fetchAllPages(`${LIST_URL}?$select=id&$top=999`, baseOptions({ waitFn })),
    ).rejects.toThrow();

    // Exactly one Retry-After wait attempted (bounded retry, not a loop of
    // fixed-interval retries).
    expect(waitFn).toHaveBeenCalledTimes(1);
    expect(waitFn).toHaveBeenCalledWith(3000);
  });
});

describe('graphClient — 401 triggers one silent-refresh retry', () => {
  it('retries once with a refreshed token, then succeeds', async () => {
    let callCount = 0;
    server.use(
      http.get(LIST_URL, ({ request }) => {
        callCount += 1;
        const auth = request.headers.get('Authorization');
        if (callCount === 1) {
          return new HttpResponse(null, { status: 401 });
        }
        expect(auth).toBe('Bearer refreshed-token');
        return HttpResponse.json({ value: [{ id: '1' }] });
      }),
    );

    const refreshAccessToken = vi.fn().mockResolvedValue('refreshed-token');
    const results = await fetchAllPages<{ id: string }>(
      `${LIST_URL}?$select=id&$top=999`,
      baseOptions({ refreshAccessToken }),
    );

    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
  });

  it('throws GraphAuthError when refresh is unavailable or fails', async () => {
    server.use(http.get(LIST_URL, () => new HttpResponse(null, { status: 401 })));

    await expect(
      fetchAllPages(`${LIST_URL}?$select=id&$top=999`, baseOptions()),
    ).rejects.toThrow(GraphAuthError);
  });
});

describe('devices.ts — OS-filter try-then-fallback with status-line reporting', () => {
  it('reports server-filtered when the OS filter succeeds', async () => {
    server.use(
      http.get(LIST_URL, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('$filter')).toContain("operatingSystem eq 'Windows'");
        return HttpResponse.json({
          value: [{ id: '1', operatingSystem: 'Windows' }],
        });
      }),
    );

    const result = await listManagedDevices(baseOptions(), { operatingSystem: 'Windows' });
    expect(result.osFilterPath).toBe('server-filtered');
    expect(result.devices).toHaveLength(1);
  });

  it('falls back to client-side filtering and reports the fallback path on a 400', async () => {
    let callCount = 0;
    server.use(
      http.get(LIST_URL, ({ request }) => {
        callCount += 1;
        const url = new URL(request.url);
        if (url.searchParams.get('$filter')?.includes('operatingSystem')) {
          return new HttpResponse(null, { status: 400 });
        }
        return HttpResponse.json({
          value: [
            { id: '1', operatingSystem: 'Windows' },
            { id: '2', operatingSystem: 'iOS' },
          ],
        });
      }),
    );

    const result = await listManagedDevices(baseOptions(), { operatingSystem: 'Windows' });
    expect(result.osFilterPath).toBe('client-filtered-fallback');
    expect(result.devices.map((d) => d.id)).toEqual(['1']);
    expect(callCount).toBe(2); // one failed server-filtered attempt, one fallback fetch
  });
});

describe('devices.ts — delete', () => {
  it('issues a single DELETE call to the device endpoint', async () => {
    let method = '';
    server.use(
      http.delete(`${GRAPH_BASE}/deviceManagement/managedDevices/:id`, ({ request, params }) => {
        method = request.method;
        expect(params.id).toBe('device-123');
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await deleteManagedDevice('device-123', baseOptions());
    expect(method).toBe('DELETE');
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});
