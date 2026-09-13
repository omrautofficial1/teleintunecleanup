import type { ReactNode } from 'react';

export interface TableColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  emptyMessage?: ReactNode;
  caption?: string;
}

/** Headless-table-agnostic presentational table. @tanstack/react-table
 * supplies row/column models elsewhere (useDevices/columns.ts); this
 * component just renders whatever rows it's given. */
export function Table<T>({
  columns,
  rows,
  getRowKey,
  emptyMessage = 'No records to show.',
  caption,
}: TableProps<T>) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-app-hairline bg-app-surface p-8 text-center text-sm text-app-ink/70">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-app-hairline bg-app-surface">
      <table className="w-full min-w-full text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-app-hairline">
            {columns.map((col) => (
              <th key={col.key} scope="col" className={`px-3 py-2 font-semibold ${col.className ?? ''}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)} className="border-b border-app-hairline last:border-0 hover:bg-app-background/60">
              {columns.map((col) => (
                <td key={col.key} className={`px-3 py-2 ${col.className ?? ''}`}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
