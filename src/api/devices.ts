// Typed list/delete calls over graphClient.ts (ADR-001, ADR-003).
// Owns the OS-filter try-once-then-fallback behavior (spec §6) and reports
// which path ran so the UI status line has ground truth, not an inference.

import {
  fetchAllPages,
  GraphHttpError,
  graphRequest,
  type GraphRequestOptions,
} from './graphClient';
import { GRAPH_DEVICE_SELECT_FIELDS, type RawGraphDevice } from './types';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const PAGE_SIZE = 999;

export type OsFilterPath = 'server-filtered' | 'client-filtered-fallback' | 'unfiltered';

export interface ListDevicesOptions {
  /** managementState eq 'managed' toggle — off by default per spec §6. */
  managedOnly?: boolean;
  /** operatingSystem eq '...' — tried server-side once, falls back to
   * client-side filtering on failure (undocumented filter, sometimes 400s). */
  operatingSystem?: string;
  onPage?: (info: { pageCount: number; totalSoFar: number }) => void;
}

export interface ListDevicesResult {
  devices: RawGraphDevice[];
  osFilterPath: OsFilterPath;
}

function buildListUrl(options: ListDevicesOptions, includeOsFilter: boolean): string {
  const select = GRAPH_DEVICE_SELECT_FIELDS.join(',');
  const filters: string[] = [];
  if (options.managedOnly) {
    filters.push("managementState eq 'managed'");
  }
  if (includeOsFilter && options.operatingSystem) {
    filters.push(`operatingSystem eq '${options.operatingSystem}'`);
  }

  const params = new URLSearchParams();
  params.set('$select', select);
  params.set('$top', String(PAGE_SIZE));
  if (filters.length > 0) {
    params.set('$filter', filters.join(' and '));
  }
  return `${GRAPH_BASE}/deviceManagement/managedDevices?${params.toString()}`;
}

/**
 * Fetches the full device inventory. If an `operatingSystem` filter is
 * requested, tries it server-side once; on any failure (Graph sometimes
 * 400s on this undocumented filter), falls back to fetching everything and
 * filtering client-side. Returns which path actually ran (Q-3 — transparent,
 * not silently magic).
 */
export async function listManagedDevices(
  requestOptions: GraphRequestOptions,
  listOptions: ListDevicesOptions = {},
): Promise<ListDevicesResult> {
  if (listOptions.operatingSystem) {
    try {
      const url = buildListUrl(listOptions, true);
      const devices = await fetchAllPages<RawGraphDevice>(url, {
        ...requestOptions,
        onPage: listOptions.onPage,
      });
      return { devices, osFilterPath: 'server-filtered' };
    } catch (error) {
      // Only fall back on an HTTP-level failure from the server-side filter
      // itself (e.g. 400) — a network error or auth error should still
      // surface as a hard failure, not silently swallow into a full fetch.
      if (!(error instanceof GraphHttpError)) {
        throw error;
      }
      const fallbackUrl = buildListUrl(listOptions, false);
      const allDevices = await fetchAllPages<RawGraphDevice>(fallbackUrl, {
        ...requestOptions,
        onPage: listOptions.onPage,
      });
      const filtered = allDevices.filter(
        (d) => d.operatingSystem === listOptions.operatingSystem,
      );
      return { devices: filtered, osFilterPath: 'client-filtered-fallback' };
    }
  }

  const url = buildListUrl(listOptions, false);
  const devices = await fetchAllPages<RawGraphDevice>(url, {
    ...requestOptions,
    onPage: listOptions.onPage,
  });
  return { devices, osFilterPath: 'unfiltered' };
}

/** Deletes a single managed device. Callers (useDeleteDevices) are
 * responsible for sequencing calls one at a time (C-10) — this function
 * issues exactly one Graph DELETE and does not batch or parallelize. */
export async function deleteManagedDevice(
  deviceId: string,
  requestOptions: GraphRequestOptions,
): Promise<void> {
  const url = `${GRAPH_BASE}/deviceManagement/managedDevices/${encodeURIComponent(deviceId)}`;
  await graphRequest(url, {
    ...requestOptions,
    init: { method: 'DELETE' },
  });
}
