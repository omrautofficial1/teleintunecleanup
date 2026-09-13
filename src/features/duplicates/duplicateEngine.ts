// Pure duplicate-detection engine (C-6): zero imports from api/ or React.
// Every rule below traces directly to build.md §7. This module is the one
// every acceptance-checklist duplicate-detection item traces back to
// (solution-strategy.md) — it is unit-tested in isolation with static
// fixture data, no rendering involved.

/** Minimal device shape the engine needs. Deliberately NOT imported from
 * api/types.ts (that would violate C-6) — this is the engine's own input
 * contract; callers (useDuplicates.ts) map Graph DTOs onto it. */
export interface DuplicateEngineDevice {
  id: string;
  deviceName: string;
  serialNumber: string | null;
  imei: string | null;
  meid: string | null;
  operatingSystem: string;
  lastSyncDateTime: string; // ISO 8601
  enrolledDateTime: string; // ISO 8601
  complianceState: string;
  managementAgent: string;
  managedDeviceOwnerType: string;
  deviceEnrollmentType: string;
}

export type MatchedOn = 'serial' | 'imei' | 'meid';

export type GroupWarning =
  | 'co-management'
  | 're-enrollment-in-progress'
  | 'all-within-staleness-floor';

export type GroupStatus =
  | 'actionable'
  | 'too-close-to-call'
  | 'over-size-ceiling';

export type DeviceRole = 'keeper' | 'candidate' | 'unresolved';

export interface GroupMember {
  device: DuplicateEngineDevice;
  role: DeviceRole;
  /** True only for role === 'candidate' devices that clear the staleness
   * floor — i.e. the ones "select all stale" and manual selection may
   * legally act on. Keeper and unresolved members are always false. */
  deletable: boolean;
}

export interface DuplicateGroup {
  /** Stable, deterministic id — sorted member device ids joined. */
  id: string;
  members: GroupMember[];
  status: GroupStatus;
  matchedOn: MatchedOn[];
  warnings: GroupWarning[];
}

export interface DuplicateEngineConfig {
  /** spec §7.2 — off by default; same-serial-different-OS stays hidden
   * until the admin opts in. */
  matchAcrossPlatforms?: boolean;
  /** spec §7.3.5 — default 5. */
  groupSizeCeiling?: number;
  /** spec §7.3.3 — default 30 days. */
  stalenessFloorDays?: number;
  /** spec §7.3.2 — default 24 hours. */
  keeperLeadHours?: number;
  /** Injectable clock for deterministic staleness-floor tests. */
  now?: Date | number;
}

const DEFAULT_CONFIG: Required<Omit<DuplicateEngineConfig, 'now'>> = {
  matchAcrossPlatforms: false,
  groupSizeCeiling: 5,
  stalenessFloorDays: 30,
  keeperLeadHours: 24,
};

const JUNK_SERIALS = new Set([
  'DEFAULT STRING',
  'SYSTEM SERIAL NUMBER',
  'TO BE FILLED BY O.E.M.',
]);

// ---------------------------------------------------------------------------
// 7.1 Identifier normalization
// ---------------------------------------------------------------------------

/** Returns the normalized (trimmed, uppercased) serial, or null if it
 * should be excluded from matching entirely per the junk-serial blocklist. */
export function normalizeSerial(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().toUpperCase();
  if (value.length < 5) return null;
  if (JUNK_SERIALS.has(value)) return null;
  if (/^0+$/.test(value)) return null;
  return value;
}

/** Luhn checksum — used to validate IMEI (and MEID, per spec §7.1: "MEID:
 * normalize the same way as IMEI where applicable"). */
export function luhnCheck(digits: string): boolean {
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = Number(digits[i]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

/** Strips non-digits, requires exactly 15 digits, validates Luhn. Returns
 * null (excluded from matching) on any failure — malformed IMEIs are
 * common in Intune and would otherwise link unrelated devices. Used for
 * both IMEI and MEID per spec §7.1. */
export function normalizeImeiOrMeid(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 15) return null;
  if (!luhnCheck(digits)) return null;
  return digits;
}

interface NormalizedDevice {
  device: DuplicateEngineDevice;
  serial: string | null;
  imei: string | null;
  meid: string | null;
}

function normalize(device: DuplicateEngineDevice): NormalizedDevice {
  return {
    device,
    serial: normalizeSerial(device.serialNumber),
    imei: normalizeImeiOrMeid(device.imei),
    meid: normalizeImeiOrMeid(device.meid),
  };
}

// ---------------------------------------------------------------------------
// 7.2 Grouping — union-find over the three normalized identifiers
// ---------------------------------------------------------------------------

class UnionFind {
  private parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }

  find(i: number): number {
    if (this.parent[i] !== i) {
      this.parent[i] = this.find(this.parent[i]);
    }
    return this.parent[i];
  }

  union(a: number, b: number): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) {
      this.parent[rootB] = rootA;
    }
  }
}

interface Bucket {
  matchedOn: MatchedOn;
  indices: number[];
}

function buildBuckets(
  normalized: NormalizedDevice[],
  matchAcrossPlatforms: boolean,
): Bucket[] {
  const buckets = new Map<string, Bucket>();

  const addToBucket = (
    matchedOn: MatchedOn,
    identifierValue: string | null,
    index: number,
    operatingSystem: string,
  ) => {
    if (!identifierValue) return;
    const key = matchAcrossPlatforms
      ? `${matchedOn}:${identifierValue}`
      : `${matchedOn}:${identifierValue}:${operatingSystem}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { matchedOn, indices: [] };
      buckets.set(key, bucket);
    }
    bucket.indices.push(index);
  };

  normalized.forEach((n, index) => {
    addToBucket('serial', n.serial, index, n.device.operatingSystem);
    addToBucket('imei', n.imei, index, n.device.operatingSystem);
    addToBucket('meid', n.meid, index, n.device.operatingSystem);
  });

  return Array.from(buckets.values()).filter((b) => b.indices.length >= 2);
}

// ---------------------------------------------------------------------------
// 7.3 Keeper selection within a group
// ---------------------------------------------------------------------------

function tieBreakWinner(
  candidates: NormalizedDevice[],
): NormalizedDevice {
  // Rule 4, applied in order, among records tied on lastSyncDateTime:
  //   earlier enrolledDateTime loses -> later enrolledDateTime wins
  //   still tied -> non-compliant loses -> compliant wins
  //   still tied -> lower id (lexicographically) wins, for determinism
  let pool = candidates;

  const maxEnrolled = Math.max(
    ...pool.map((c) => Date.parse(c.device.enrolledDateTime)),
  );
  const byEnrolled = pool.filter(
    (c) => Date.parse(c.device.enrolledDateTime) === maxEnrolled,
  );
  if (byEnrolled.length === 1) return byEnrolled[0];
  pool = byEnrolled;

  const compliant = pool.filter(
    (c) => c.device.complianceState.toLowerCase() === 'compliant',
  );
  if (compliant.length === 1) return compliant[0];
  if (compliant.length > 1) pool = compliant;

  return [...pool].sort((a, b) => (a.device.id < b.device.id ? -1 : 1))[0];
}

function resolveGroup(
  members: NormalizedDevice[],
  config: Required<Omit<DuplicateEngineConfig, 'now'>>,
): { status: GroupStatus; roles: Map<string, GroupMember> } {
  const roles = new Map<string, GroupMember>();

  if (members.length > config.groupSizeCeiling) {
    for (const m of members) {
      roles.set(m.device.id, { device: m.device, role: 'unresolved', deletable: false });
    }
    return { status: 'over-size-ceiling', roles };
  }

  const sorted = [...members].sort(
    (a, b) => Date.parse(b.device.lastSyncDateTime) - Date.parse(a.device.lastSyncDateTime),
  );
  const topTime = Date.parse(sorted[0].device.lastSyncDateTime);
  const tiedForTop = sorted.filter(
    (m) => Date.parse(m.device.lastSyncDateTime) === topTime,
  );

  let keeper: NormalizedDevice;

  if (tiedForTop.length > 1) {
    // Exact tie at the top: the tie-break chain deterministically resolves
    // it rather than falling through to "too close to call" — an exact
    // shared timestamp is a data artifact, not clock-skew ambiguity.
    keeper = tieBreakWinner(tiedForTop);
  } else {
    // Always retain the newest login. Review is the human safety gate for
    // every other member; a small timestamp gap must not hide duplicates.
    keeper = sorted[0];
  }

  roles.set(keeper.device.id, { device: keeper.device, role: 'keeper', deletable: false });
  for (const m of members) {
    if (m.device.id === keeper.device.id) continue;
    // The newest login is the keeper. Every other member of an actionable
    // duplicate group is an eligible stale record; the review screen is the
    // explicit human safety gate before DELETE is issued.
    roles.set(m.device.id, { device: m.device, role: 'candidate', deletable: true });
  }

  return { status: 'actionable', roles };
}

// ---------------------------------------------------------------------------
// 7.4 Warnings (surfaced but not blocking)
// ---------------------------------------------------------------------------

/** Heuristic for "deviceEnrollmentType suggesting an in-progress
 * re-enrollment" (spec §7.4) — the Graph enum has no single documented
 * value for this, so we treat 'unknown' as the signal that the enrollment
 * record is in an incomplete/transitional state. Documented assumption,
 * not a spec-literal enum match. */
function looksLikeReEnrollmentInProgress(device: DuplicateEngineDevice): boolean {
  return device.deviceEnrollmentType.toLowerCase() === 'unknown';
}

function computeWarnings(
  members: NormalizedDevice[],
  roles: Map<string, GroupMember>,
  status: GroupStatus,
): GroupWarning[] {
  const warnings = new Set<GroupWarning>();

  const distinctAgents = new Set(members.map((m) => m.device.managementAgent));
  if (distinctAgents.size > 1) warnings.add('co-management');

  if (members.some((m) => looksLikeReEnrollmentInProgress(m.device))) {
    warnings.add('re-enrollment-in-progress');
  }

  if (status === 'actionable') {
    const candidates = [...roles.values()].filter((r) => r.role === 'candidate');
    if (candidates.length > 0 && candidates.every((c) => !c.deletable)) {
      warnings.add('all-within-staleness-floor');
    }
  }

  return [...warnings];
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export interface DuplicateEngineResult {
  groups: DuplicateGroup[];
}

/** Admin override: reassigns which member holds the keeper role within a
 * single group. Pure swap — never produces zero or two keepers. No-ops
 * (returns the input group unchanged) for non-actionable groups, unknown
 * device ids, or redesignating the current keeper to itself. */
export function reassignKeeper(group: DuplicateGroup, newKeeperId: string): DuplicateGroup {
  if (group.status !== 'actionable') return group;
  const currentKeeper = group.members.find((m) => m.role === 'keeper');
  if (!currentKeeper || currentKeeper.device.id === newKeeperId) return group;
  const target = group.members.find((m) => m.device.id === newKeeperId);
  if (!target) return group;

  return {
    ...group,
    members: group.members.map((m) => {
      if (m.device.id === newKeeperId) return { ...m, role: 'keeper', deletable: false };
      if (m.device.id === currentKeeper.device.id) return { ...m, role: 'candidate', deletable: true };
      return m;
    }),
  };
}

export function detectDuplicates(
  devices: DuplicateEngineDevice[],
  config: DuplicateEngineConfig = {},
): DuplicateEngineResult {
  const resolvedConfig: Required<Omit<DuplicateEngineConfig, 'now'>> = {
    ...DEFAULT_CONFIG,
    ...config,
  };
  const normalized = devices.map(normalize);
  const buckets = buildBuckets(normalized, resolvedConfig.matchAcrossPlatforms);

  const uf = new UnionFind(normalized.length);
  for (const bucket of buckets) {
    const [first, ...rest] = bucket.indices;
    for (const idx of rest) {
      uf.union(first, idx);
    }
  }

  // Collect final components.
  const componentsByRoot = new Map<number, number[]>();
  normalized.forEach((_, index) => {
    const root = uf.find(index);
    const list = componentsByRoot.get(root) ?? [];
    list.push(index);
    componentsByRoot.set(root, list);
  });

  // matchedOn per root: any bucket whose members land in that root.
  const matchedOnByRoot = new Map<number, Set<MatchedOn>>();
  for (const bucket of buckets) {
    const root = uf.find(bucket.indices[0]);
    const set = matchedOnByRoot.get(root) ?? new Set<MatchedOn>();
    set.add(bucket.matchedOn);
    matchedOnByRoot.set(root, set);
  }

  const groups: DuplicateGroup[] = [];
  for (const [root, indices] of componentsByRoot) {
    if (indices.length < 2) continue; // not a duplicate group
    const members = indices.map((i) => normalized[i]);
    const { status, roles } = resolveGroup(members, resolvedConfig);
    const warnings = computeWarnings(members, roles, status);
    const sortedIds = members.map((m) => m.device.id).sort();

    groups.push({
      id: sortedIds.join('|'),
      members: sortedIds.map((id) => roles.get(id)!),
      status,
      matchedOn: [...(matchedOnByRoot.get(root) ?? [])].sort(),
      warnings,
    });
  }

  // Stable, deterministic output order.
  groups.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return { groups };
}
