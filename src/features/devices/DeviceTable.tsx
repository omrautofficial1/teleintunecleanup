import { useTable } from '@tanstack/react-table';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RawGraphDevice } from '../../api/types';
import { deviceColumns } from './columns';
import { deviceTableFeatures } from './tableFeatures';

const EMPTY_DEVICES: RawGraphDevice[] = [];
const PAGE_SIZE_OPTIONS = [25, 50, 100, 250];

function describeInventoryError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown Graph error';
  if (message.includes('Request not applicable to target tenant')) {
    return 'This tenant is not provisioned for Microsoft Intune device management. An administrator must activate an Intune subscription and assign an Intune-licensed account before managed devices can be listed.';
  }
  return message;
}

export interface DeviceTableProps {
  devices: RawGraphDevice[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}

/** The full device table (spec §9.2): client-side pagination/sorting over
 * the fully-fetched in-memory inventory. Loading / empty / error / success
 * states are all handled here explicitly. */
export function DeviceTable({ devices, isLoading, isError, error }: DeviceTableProps) {
  const data = devices ?? EMPTY_DEVICES;

  const table = useTable({
    features: deviceTableFeatures,
    columns: deviceColumns,
    data,
    initialState: { pagination: { pageIndex: 0, pageSize: 25 } },
  });

  const pageSize = table.state.pagination?.pageSize ?? 25;

  const rows = useMemo(() => table.getRowModel().rows, [table]);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const tableElementRef = useRef<HTMLTableElement>(null);
  const [tableWidth, setTableWidth] = useState(1450);

  useEffect(() => {
    const bottomScroll = bottomScrollRef.current;
    const tableScroll = tableScrollRef.current;
    if (!bottomScroll || !tableScroll) return;
    const syncFromBottom = () => { tableScroll.scrollLeft = bottomScroll.scrollLeft; };
    const syncFromTable = () => { bottomScroll.scrollLeft = tableScroll.scrollLeft; };
    bottomScroll.addEventListener('scroll', syncFromBottom);
    tableScroll.addEventListener('scroll', syncFromTable);
    return () => {
      bottomScroll.removeEventListener('scroll', syncFromBottom);
      tableScroll.removeEventListener('scroll', syncFromTable);
    };
  }, [data.length]);

  useEffect(() => {
    const tableElement = tableElementRef.current;
    if (!tableElement) return;

    const updateWidth = () => setTableWidth(Math.max(1450, tableElement.scrollWidth));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(tableElement);
    return () => observer.disconnect();
  }, [data.length, pageSize]);

  if (isError) {
    const message = describeInventoryError(error);
    return (
      <div role="alert" className="rounded-md border border-app-delete/40 bg-app-delete/5 p-6 text-sm text-app-delete">
        Failed to load the device inventory: {message}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div role="status" aria-live="polite" className="rounded-md border border-app-hairline bg-app-surface p-8 text-center text-sm text-app-ink/70">
        Loading device inventory…
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-md border border-app-hairline bg-app-surface p-8 text-center text-sm text-app-ink/70">
        No devices found. Try "Refresh inventory" or adjust filters.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div ref={tableScrollRef} className="scrollbar-none overflow-x-auto border border-app-hairline bg-app-surface shadow-sm">
        <table ref={tableElementRef} className="min-w-[1200px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-app-surface">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="border-b border-app-hairline">
                {group.headers.map((header) => (
                  <th key={header.id} scope="col" className="whitespace-nowrap border-b border-app-hairline px-3 py-3 font-semibold text-app-ink/70">
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1"
                      >
                        <table.FlexRender header={header} />
                        {{ asc: ' ▲', desc: ' ▼' }[header.column.getIsSorted() as string] ?? ''}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-app-hairline last:border-0 hover:bg-[#f5f9fc]">
                {row.getAllCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2 font-mono-tabular">
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div ref={bottomScrollRef} aria-label="Scroll device table horizontally" className="sticky bottom-0 z-20 overflow-x-auto border border-app-hairline bg-app-surface/95 px-1 py-1 shadow-[0_-2px_8px_rgba(27,42,56,0.12)] backdrop-blur">
        <div className="h-3" style={{ width: `${tableWidth}px` }} />
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <label htmlFor="page-size">Rows per page</label>
          <select
            id="page-size"
            value={pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
            className="rounded border border-app-hairline px-1 py-0.5"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="rounded border border-app-hairline px-2 py-1 disabled:opacity-40"
          >
            Previous
          </button>
          <span>
            Page {(table.state.pagination?.pageIndex ?? 0) + 1} of {Math.max(1, table.getPageCount())}
          </span>
          <button
            type="button"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="rounded border border-app-hairline px-2 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
