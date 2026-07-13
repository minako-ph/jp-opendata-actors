/**
 * 祝日判定・一覧・次回祝日（FR-4 / FR-5 / FR-10）。
 * データはビルド時同梱の src/generated/holidays-data.ts のみを根拠とし、
 * 収録範囲（COVERED_FROM/COVERED_TO）の外では判定しない（「根拠のない値は返さない」）。
 */
import { COVERED_FROM, COVERED_TO, HOLIDAYS_JA } from '../generated/holidays-data';
import { compareYmd, formatIso, parseIsoDate, type YmdDate } from './date-utils';

/**
 * 祝日英語名の参考訳（handover §7.1 起点＋実CSVの全ユニーク名称で確定。
 * 公式英語名は存在しないため参考訳である旨をドキュメントに注記する: FR-4）。
 * 未知名称は PUBLIC_HOLIDAY_EN にフォールバックし、テストで検知する（§7.1）。
 */
export const HOLIDAY_NAME_EN: Readonly<Record<string, string>> = {
  元日: "New Year's Day",
  成人の日: 'Coming of Age Day',
  建国記念の日: 'National Foundation Day',
  天皇誕生日: "The Emperor's Birthday",
  春分の日: 'Vernal Equinox Day',
  昭和の日: 'Showa Day',
  憲法記念日: 'Constitution Memorial Day',
  みどりの日: 'Greenery Day',
  こどもの日: "Children's Day",
  海の日: 'Marine Day',
  山の日: 'Mountain Day',
  敬老の日: 'Respect for the Aged Day',
  秋分の日: 'Autumnal Equinox Day',
  スポーツの日: 'Sports Day',
  体育の日: 'Health and Sports Day',
  '体育の日（スポーツの日）': 'Health and Sports Day (Sports Day)',
  文化の日: 'Culture Day',
  勤労感謝の日: 'Labor Thanksgiving Day',
  休日: 'Public Holiday',
  '休日（祝日扱い）': 'Public Holiday',
  結婚の儀: 'Imperial Wedding Ceremony',
  大喪の礼: 'Imperial Funeral Ceremony',
  即位礼正殿の儀: 'Enthronement Ceremony',
};

const PUBLIC_HOLIDAY_EN = 'Public Holiday';

export function holidayNameEn(nameJa: string): string {
  return HOLIDAY_NAME_EN[nameJa] ?? PUBLIC_HOLIDAY_EN;
}

/**
 * 「休日」系（振替休日・国民の休日・祝日扱いの休日）かどうか。
 * CSVは振替休日と国民の休日をどちらも「休日」と表記し区別しない（decisions.md 2026-07-11）。
 */
export function isGeneralPublicHoliday(nameJa: string): boolean {
  return nameJa === '休日' || nameJa === '休日（祝日扱い）';
}

const coveredFromParsed = parseIsoDate(COVERED_FROM);
const coveredToParsed = parseIsoDate(COVERED_TO);
if (coveredFromParsed === null || coveredToParsed === null) {
  throw new Error('unreachable: generated COVERED_FROM/COVERED_TO are not valid ISO dates');
}
export const COVERED_FROM_DATE: YmdDate = coveredFromParsed;
export const COVERED_TO_DATE: YmdDate = coveredToParsed;
export { COVERED_FROM, COVERED_TO };

export function isWithinCoveredRange(date: YmdDate): boolean {
  return compareYmd(date, COVERED_FROM_DATE) >= 0 && compareYmd(date, COVERED_TO_DATE) <= 0;
}

export function isYearCovered(year: number): boolean {
  return year >= COVERED_FROM_DATE.year && year <= COVERED_TO_DATE.year;
}

export interface Holiday {
  date: string;
  nameJa: string;
  nameEn: string;
  isGeneralPublicHoliday: boolean;
}

function toHoliday(date: string, nameJa: string): Holiday {
  return {
    date,
    nameJa,
    nameEn: holidayNameEn(nameJa),
    isGeneralPublicHoliday: isGeneralPublicHoliday(nameJa),
  };
}

/** 祝日名（日本語原文）。祝日でなければ null。収録範囲内であることは呼び出し側で保証する */
export function holidayNameJaOf(date: YmdDate): string | null {
  return HOLIDAYS_JA.get(formatIso(date)) ?? null;
}

// 年→祝日一覧の索引（モジュール初期化時に一度だけ構築。Workersのisolate起動後は再利用される）
const HOLIDAYS_BY_YEAR = new Map<number, Holiday[]>();
const HOLIDAYS_SORTED: Holiday[] = [];
for (const [date, nameJa] of HOLIDAYS_JA) {
  const holiday = toHoliday(date, nameJa);
  HOLIDAYS_SORTED.push(holiday);
  const year = Number(date.slice(0, 4));
  const list = HOLIDAYS_BY_YEAR.get(year);
  if (list === undefined) {
    HOLIDAYS_BY_YEAR.set(year, [holiday]);
  } else {
    list.push(holiday);
  }
}

/** 年間祝日一覧（FR-4）。収録範囲内であることは呼び出し側で保証する */
export function holidaysOfYear(year: number): ReadonlyArray<Holiday> {
  return HOLIDAYS_BY_YEAR.get(year) ?? [];
}

/**
 * 次の祝日（FR-5）。from 当日を含む（on or after。ドキュメントに明記）。
 * 収録範囲内に該当がなければ null（呼び出し側で FR-10 に従い応答する）。
 */
export function nextHolidayOnOrAfter(from: YmdDate): Holiday | null {
  const fromIso = formatIso(from);
  for (const holiday of HOLIDAYS_SORTED) {
    if (holiday.date >= fromIso) return holiday;
  }
  return null;
}
