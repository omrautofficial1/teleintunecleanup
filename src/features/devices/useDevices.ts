// React Query wiring for the device inventory (spec §6). Fetches the full
// inventory (all pages) before returning, since duplicate detection needs
// to compare every record against every other record — not just the
// current page. Manual refresh only (no silent re-fetch on navigation).

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { listManagedDevices, type OsFilterPath } from '../../api/devices';
import type { RawGraphDevice } from '../../api/types';
import { useAuth } from '../../auth/useAuth';

export const DEVICES_QUERY_KEY = ['devices'] as const;

export interface FetchProgress {
  pageCount: number;
  totalSoFar: number;
}

export interface UseDevicesResult {
  devices: RawGraphDevice[] | undefined;
  osFilterPath: OsFilterPath | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  progress: FetchProgress | null;
  refresh: () => void;
}

export function useDevices(): UseDevicesResult {
  const { getReadToken } = useAuth();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<FetchProgress | null>(null);

  const query = useQuery({
    queryKey: DEVICES_QUERY_KEY,
    queryFn: async () => {
      setProgress(null);
      const result = await listManagedDevices(
        { getAccessToken: getReadToken, refreshAccessToken: getReadToken },
        { onPage: (info) => setProgress(info) },
      );
      return result;
    },
    // Manual refresh only — do not silently re-fetch on every navigation
    // (spec §6).
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: false,
  });

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: DEVICES_QUERY_KEY });
    query.refetch();
  }, [queryClient, query]);

  return {
    devices: query.data?.devices,
    osFilterPath: query.data?.osFilterPath,
    isLoading: query.isLoading || query.isFetching,
    isError: query.isError,
    error: query.error,
    progress,
    refresh,
  };
}
