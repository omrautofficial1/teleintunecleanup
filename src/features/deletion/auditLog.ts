// Append-only audit log (ADR-005): in-memory + sessionStorage mirror so an
// accidental reload during a real deletion run doesn't silently erase the
// record of what was actually deleted. Not a persistent backend audit
// trail — clears on tab/browser close, same lifetime as the MSAL token
// cache (ADR-002).

const STORAGE_KEY = 'duplicate-device-cleanup:audit-log:v1';

import { GRAPH_DEVICE_SELECT_FIELDS, type RawGraphDevice } from '../../api/types';

export interface AuditLogEntry {
  deviceId: string;
  deviceName: string;
  serialNumber: string | null;
  imei: string | null;
  matchedOn: string;
  previousLastSync: string;
  action: 'retire' | 'factory-reset';
  timestamp: string;
  outcome: 'success' | 'failed';
  deviceSnapshot: RawGraphDevice;
}

let entries: AuditLogEntry[] = [];
let hydrated = false;

function readFromSessionStorage(): AuditLogEntry[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeToSessionStorage(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // sessionStorage can throw (quota, private browsing) — the in-memory
    // log still works for the current tab session; losing the mirror is
    // not fatal to the current session's CSV export.
  }
}

/** Rehydrates from sessionStorage on first access (e.g. after an
 * accidental reload mid-session). Idempotent. */
export function ensureHydrated(): void {
  if (hydrated) return;
  entries = readFromSessionStorage();
  hydrated = true;
}

export function appendAuditLogEntry(entry: AuditLogEntry): void {
  ensureHydrated();
  entries = [...entries, entry];
  writeToSessionStorage();
}

export function getAuditLog(): AuditLogEntry[] {
  ensureHydrated();
  return entries;
}

export function clearAuditLog(): void {
  entries = [];
  hydrated = true;
  writeToSessionStorage();
}

/** Display label for an audit entry's action, matching the wording already
 * shown in the UI (ReviewDeleteScreen's consequence badges: "Delete" /
 * "Factory reset") — the raw 'retire'/'factory-reset' enum values are
 * internal identifiers, not something to show an admin in the log table or
 * an exported CSV. */
export function actionLabel(action: AuditLogEntry['action']): string {
  return action === 'factory-reset' ? 'Factory reset' : 'Delete';
}

// Security fix (Phase 1 audit, finding #1): several exported fields
// (deviceName, manufacturer, model) are set at device enrollment time and
// are not admin-controlled, so they're an injection surface. A value
// starting with = + - @ (or a tab/CR) is interpreted as a formula by
// Excel/Sheets/LibreOffice on open. Neutralize by prefixing a leading
// apostrophe — the standard OWASP CSV-injection mitigation — before the
// existing quote/comma escaping runs.
const FORMULA_TRIGGER_CHARS = new Set(['=', '+', '-', '@', '\t', '\r']);

function neutralizeFormulaInjection(value: string): string {
  if (value.length === 0) return value;
  return FORMULA_TRIGGER_CHARS.has(value[0]) ? `'${value}` : value;
}

function csvEscape(rawValue: string): string {
  const value = neutralizeFormulaInjection(rawValue);
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Full device record columns (one per Graph field) replace the old single
 * JSON-blob "deviceSnapshot" cell — each key becomes its own column, one
 * row per deleted device, so the export opens as a proper spreadsheet
 * instead of a column containing embedded JSON. */
export function auditLogToCsv(log: AuditLogEntry[] = getAuditLog()): string {
  const header = [...GRAPH_DEVICE_SELECT_FIELDS, 'matchedOn', 'Action', 'timestamp', 'outcome'];
  const lines = [header.join(',')];
  for (const entry of log) {
    lines.push(
      [
        ...GRAPH_DEVICE_SELECT_FIELDS.map((field) => entry.deviceSnapshot[field] ?? ''),
        entry.matchedOn,
        actionLabel(entry.action),
        entry.timestamp,
        entry.outcome,
      ]
        .map((v) => csvEscape(String(v)))
        .join(','),
    );
  }
  return lines.join('\n');
}
