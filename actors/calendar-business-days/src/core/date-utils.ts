/**
 * 日付の内部表現と整数日算術（handover §2.4）。
 * JSの Date によるタイムゾーン依存の算術を避け、y/m/d の整数と
 * epoch days（1970-01-01 からの日数）で完結させる。
 * タイムゾーンを要するのは todayInJst() のみ。
 */

export interface YmdDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH[month - 1] ?? 0;
}

export function isValidYmd(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** ISO 8601 (YYYY-MM-DD) をパース。実在しない日付は null（推測しない） */
export function parseIsoDate(input: string): YmdDate | null {
  const m = input.match(ISO_DATE_PATTERN);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!isValidYmd(year, month, day)) return null;
  return { year, month, day };
}

export function formatIso(date: YmdDate): string {
  return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

/**
 * グレゴリオ暦 y/m/d → epoch days（1970-01-01 = 0）。
 * Howard Hinnant の days_from_civil アルゴリズム（純粋な整数演算）。
 */
export function toEpochDays(date: YmdDate): number {
  const y = date.year - (date.month <= 2 ? 1 : 0);
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (date.month + (date.month > 2 ? -3 : 9)) + 2) / 5) + date.day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** epoch days → グレゴリオ暦 y/m/d（civil_from_days アルゴリズム） */
export function fromEpochDays(epochDays: number): YmdDate {
  const z = epochDays + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp + (mp < 10 ? 3 : -9);
  return { year: y + (month <= 2 ? 1 : 0), month, day };
}

export const WEEKDAYS_EN = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

export type WeekdayEn = (typeof WEEKDAYS_EN)[number];

export const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** 曜日インデックス（0=日曜〜6=土曜）。1970-01-01は木曜 */
export function weekdayIndex(date: YmdDate): number {
  return (((toEpochDays(date) + 4) % 7) + 7) % 7;
}

export function weekdayEn(date: YmdDate): WeekdayEn {
  const w = WEEKDAYS_EN[weekdayIndex(date)];
  if (w === undefined) throw new Error('unreachable: weekday index out of range');
  return w;
}

export function weekdayJa(date: YmdDate): string {
  const w = WEEKDAYS_JA[weekdayIndex(date)];
  if (w === undefined) throw new Error('unreachable: weekday index out of range');
  return w;
}

/** 日付比較: a < b なら負、a === b なら0、a > b なら正 */
export function compareYmd(a: YmdDate, b: YmdDate): number {
  return toEpochDays(a) - toEpochDays(b);
}

/** 日本の会計年度（4月開始・日本標準）。FR-1 */
export function fiscalYear(date: YmdDate): number {
  return date.month >= 4 ? date.year : date.year - 1;
}

/**
 * JSTの「今日」（FR-5のデフォルト値）。タイムゾーンを要する唯一の箇所（§2.4）。
 * en-CA ロケールは YYYY-MM-DD 形式を返す。
 */
export function todayInJst(now: Date = new Date()): YmdDate {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const parsed = parseIsoDate(formatted);
  if (parsed === null) throw new Error(`unreachable: Intl returned unparsable date: ${formatted}`);
  return parsed;
}
