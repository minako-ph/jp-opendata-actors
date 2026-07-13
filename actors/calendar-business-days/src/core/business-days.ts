/**
 * 営業日判定・加算・カウント（FR-6〜FR-9 / FR-13）。
 * すべて epoch days の整数算術で実装する（§2.4。JSのDateによるTZ依存算術を使わない）。
 * 祝日データの収録範囲外に触れる計算はエラー（FR-10。include_national_holidays=false でも
 * 一貫して収録範囲を要求する: 範囲は応答から自明になり、判定条件による分岐を持たない）。
 */
import { formatIso, fromEpochDays, toEpochDays, weekdayIndex, type YmdDate } from './date-utils';
import { holidayNameJaOf, isWithinCoveredRange } from './holidays';

/** FR-13: 入力上限（暴走防止） */
export const MAX_ADD_DAYS = 5000;
export const MAX_COUNT_PERIOD_DAYS = 36525; // 100年（365.25日×100）
export const MAX_EXTRA_HOLIDAYS = 100;

export interface BusinessDayOptions {
  /** 休みとする曜日（0=日曜〜6=土曜のインデックス）。デフォルトは土日 */
  weekendIndices: ReadonlySet<number>;
  /** 企業独自休業日（ISO日付） */
  extraHolidays: ReadonlySet<string>;
  /** 国民の祝日を休みに含めるか。デフォルト true */
  includeNationalHolidays: boolean;
}

export type BusinessDayReason = 'weekend' | 'national_holiday' | 'extra_holiday' | 'business_day';

export interface BusinessDayCheck {
  isBusinessDay: boolean;
  /** 非営業日の理由。判定順: weekend → national_holiday → extra_holiday（ドキュメントに明記） */
  reason: BusinessDayReason;
  /** reason が national_holiday のときの祝日名（日本語原文）。それ以外は null */
  holidayNameJa: string | null;
}

/** 営業日判定（FR-6）。収録範囲内であることは呼び出し側で保証する */
export function checkBusinessDay(date: YmdDate, options: BusinessDayOptions): BusinessDayCheck {
  if (options.weekendIndices.has(weekdayIndex(date))) {
    return { isBusinessDay: false, reason: 'weekend', holidayNameJa: null };
  }
  if (options.includeNationalHolidays) {
    const nameJa = holidayNameJaOf(date);
    if (nameJa !== null) {
      return { isBusinessDay: false, reason: 'national_holiday', holidayNameJa: nameJa };
    }
  }
  if (options.extraHolidays.has(formatIso(date))) {
    return { isBusinessDay: false, reason: 'extra_holiday', holidayNameJa: null };
  }
  return { isBusinessDay: true, reason: 'business_day', holidayNameJa: null };
}

export type AddBusinessDaysResult =
  { ok: true; date: YmdDate } | { ok: false; error: 'out_of_covered_range'; lastInRange: YmdDate };

/**
 * N営業日後（負値は遡り。FR-7）。days=0 は入力日をそのまま返す（営業日かは問わない）。
 * 計算が収録範囲を跨いだ時点でエラー（FR-10）。|days| の上限は呼び出し側で検証する（FR-13）。
 */
export function addBusinessDays(
  start: YmdDate,
  days: number,
  options: BusinessDayOptions,
): AddBusinessDaysResult {
  const step = days >= 0 ? 1 : -1;
  let remaining = Math.abs(days);
  let cursor = toEpochDays(start);
  let current = start;
  while (remaining > 0) {
    cursor += step;
    const candidate = fromEpochDays(cursor);
    if (!isWithinCoveredRange(candidate)) {
      return { ok: false, error: 'out_of_covered_range', lastInRange: current };
    }
    if (checkBusinessDay(candidate, options).isBusinessDay) {
      remaining -= 1;
    }
    current = candidate;
  }
  return { ok: true, date: fromEpochDays(cursor) };
}

/**
 * 期間内の営業日数（FR-8）。from・to の両端を含む（レスポンスのフィールド名でも自明にする）。
 * from <= to と期間上限・収録範囲は呼び出し側で検証する。
 */
export function countBusinessDays(from: YmdDate, to: YmdDate, options: BusinessDayOptions): number {
  const fromDays = toEpochDays(from);
  const toDays = toEpochDays(to);
  let count = 0;
  for (let cursor = fromDays; cursor <= toDays; cursor += 1) {
    if (checkBusinessDay(fromEpochDays(cursor), options).isBusinessDay) count += 1;
  }
  return count;
}
