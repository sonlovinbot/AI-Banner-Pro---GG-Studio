// Local tracker for Pipeboard MCP usage. Pipeboard's free tier is 30 calls/week
// — easy to burn through without realizing. We log each request from client
// side (server returns `pipeboardCallsUsed` per response) and surface a
// rolling weekly total in Settings + the Push modal pre-flight.
//
// Note: this is a *local estimate*, not the source of truth. The real meter
// lives on Pipeboard's side. If multiple users share a Pipeboard token the
// number here will under-count.

const LOG_KEY = 'pipeboard-quota-log';
const TOGGLE_KEY = 'meta-push-enabled';
export const PIPEBOARD_FREE_WEEKLY_LIMIT = 30;

export interface CallLogEntry {
  /** epoch ms */
  ts: number;
  /** What triggered the calls — used for the breakdown view. */
  label: string;
  /** Number of underlying Pipeboard tool calls this request made. */
  count: number;
}

export interface QuotaUsage {
  used: number;
  limit: number;
  remaining: number;
  /** epoch ms — when the rolling window resets (next Monday 00:00 local). */
  resetAt: number;
  logs: CallLogEntry[];
}

function readLog(): CallLogEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    return raw ? (JSON.parse(raw) as CallLogEntry[]) : [];
  } catch {
    return [];
  }
}

function writeLog(logs: CallLogEntry[]): void {
  try {
    // Keep last 200 entries to bound storage.
    localStorage.setItem(LOG_KEY, JSON.stringify(logs.slice(-200)));
  } catch {}
}

/** Monday 00:00 local time of the week containing `ts`. */
function startOfWeek(ts: number): number {
  const d = new Date(ts);
  const day = d.getDay(); // 0 = Sun
  const diffToMon = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMon);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function logPipeboardCalls(label: string, count: number): void {
  if (!count || count < 1) return;
  const logs = readLog();
  logs.push({ ts: Date.now(), label, count });
  writeLog(logs);
}

export function getWeeklyUsage(): QuotaUsage {
  const logs = readLog();
  const weekStart = startOfWeek(Date.now());
  const weekLogs = logs.filter(l => l.ts >= weekStart);
  const used = weekLogs.reduce((s, l) => s + l.count, 0);
  return {
    used,
    limit: PIPEBOARD_FREE_WEEKLY_LIMIT,
    remaining: Math.max(0, PIPEBOARD_FREE_WEEKLY_LIMIT - used),
    resetAt: weekStart + 7 * 24 * 60 * 60 * 1000,
    logs: weekLogs.slice().reverse(),
  };
}

export function clearQuotaLog(): void {
  try { localStorage.removeItem(LOG_KEY); } catch {}
}

// ──────────── Meta push enable/disable toggle ────────────

export function isMetaPushEnabled(): boolean {
  try {
    const v = localStorage.getItem(TOGGLE_KEY);
    return v == null ? true : v !== 'false';
  } catch {
    return true;
  }
}

export function setMetaPushEnabled(v: boolean): void {
  try { localStorage.setItem(TOGGLE_KEY, String(v)); } catch {}
}
