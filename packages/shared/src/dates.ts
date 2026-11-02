const DAY_MS = 86_400_000;

export type DateRange = {
  from: number;
  to: number;
  fromDate: string;
  toDate: string;
};

export function toDateString(value: number | Date = Date.now()): string {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseDateOnly(value: unknown): { date: string; ms: number } {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!match) throw new Error(`日期“${raw}”应为 YYYY-MM-DD`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error(`日期“${raw}”不存在`);
  }
  return { date: toDateString(date), ms: date.getTime() };
}

export function startOfToday(now = Date.now()): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** range 取值 'today' | '7' | '30' | 'custom'（不是 '7d'）；custom 区间翻转时取 min/max。 */
export function resolveRange(input: { range?: string; from?: string; to?: string; now?: number } = {}): DateRange {
  const now = input.now ?? Date.now();
  const today = startOfToday(now);
  const kind = input.range || 'today';
  let from = today;
  let to = today + DAY_MS;
  if (kind === '7') from = today - 6 * DAY_MS;
  if (kind === '30') from = today - 29 * DAY_MS;
  if (kind === 'custom') {
    try {
      const f = input.from ? parseDateOnly(input.from).ms : today;
      const t = input.to ? parseDateOnly(input.to).ms : f;
      from = Math.min(f, t);
      to = Math.max(f, t) + DAY_MS;
    } catch {
      from = today;
      to = today + DAY_MS;
    }
  }
  return { from, to, fromDate: toDateString(from), toDate: toDateString(to - 1) };
}

export function monthRange(now = Date.now()): DateRange {
  const d = new Date(now);
  const from = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  return { from, to, fromDate: toDateString(from), toDate: toDateString(to - 1) };
}

export function addDays(date: string, days: number): string {
  const { ms } = parseDateOnly(date);
  return toDateString(ms + days * DAY_MS);
}
