import { withCommonMeta, type CommonMeta } from '@jp-opendata/attribution';
import {
  addBusinessDays,
  checkBusinessDay,
  countBusinessDays,
  MAX_ADD_DAYS,
  MAX_COUNT_PERIOD_DAYS,
  type BusinessDayOptions,
} from './core/business-days';
import {
  compareYmd,
  fiscalYear,
  formatIso,
  isLeapYear,
  parseIsoDate,
  toEpochDays,
  weekdayEn,
  weekdayJa,
  type YmdDate,
} from './core/date-utils';
import { GREGORIAN_ADOPTION, parseWareki, toWareki, type WarekiInfo } from './core/era';
import {
  COVERED_FROM,
  COVERED_TO,
  holidayNameEn,
  holidayNameJaOf,
  holidaysOfYear,
  isWithinCoveredRange,
  isYearCovered,
  nextHolidayOnOrAfter,
  type Holiday,
} from './core/holidays';

/**
 * 入力項目 → datasetレコード変換（FR7-2）。
 * スキーマ契約は移植元 jp-business-api の各エンドポイント返却フィールドとの同値性
 * （snake_case・値の意味を変えない。src/routes/ の c.json(...) と突合して確定）＋
 * 家族共通部（FR-C2メタ・attribution・schema_version・operation）。
 * エラーは項目単位の `_error` レコード（FR-C8・非課金）。収録範囲外のメッセージには
 * covered_from / covered_to を含める（FR7-3）。
 */

export const CALENDAR_SCHEMA_VERSION = '0.1.0';

/** 祝日データの取得元（ビルド時同梱snapshotの出典URL。実行時にはアクセスしない: N7-1） */
export const HOLIDAY_SOURCE_URL = 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv';

export type Operation =
  | 'date_info'
  | 'wareki_to_western'
  | 'holidays'
  | 'holidays_next'
  | 'business_days_add'
  | 'business_days_count';

const SUPPORTED_FROM = formatIso(GREGORIAN_ADOPTION);

/** FR7-3: 収録範囲外メッセージの共通サフィックス */
function coveredRangeSuffix(): string {
  return ` (covered_from=${COVERED_FROM}, covered_to=${COVERED_TO})`;
}

export interface TransformContext {
  retrievedAt: string;
}

function meta(
  item: Record<string, unknown>,
  context: TransformContext,
): Record<string, unknown> & CommonMeta {
  return withCommonMeta(item, {
    source: 'cao_holidays',
    sourceUrl: HOLIDAY_SOURCE_URL,
    schemaVersion: CALENDAR_SCHEMA_VERSION,
    retrievedAt: context.retrievedAt,
  });
}

/** 1入力項目の変換結果。errorレコードは非課金（FR-C8） */
export type ItemResult =
  | { ok: true; records: Array<Record<string, unknown>> }
  | { ok: false; record: Record<string, unknown> };

function errorRecord(
  operation: Operation,
  echo: Record<string, unknown>,
  message: string,
  context: TransformContext,
): ItemResult {
  return { ok: false, record: meta({ operation, ...echo, _error: message }, context) };
}

/** 移植元 shared.ts validateDateParam と同文のメッセージで不正日付を弾く */
function invalidDateMessage(raw: string): string {
  return `"${raw}" is not a valid calendar date. Use ISO 8601 format YYYY-MM-DD (e.g. 2026-07-11).`;
}

function warekiJson(wareki: WarekiInfo): Record<string, unknown> {
  return {
    era: wareki.era,
    era_ja: wareki.eraJa,
    year: wareki.year,
    is_first_year: wareki.isFirstYear,
    formatted_ja: wareki.formattedJa,
  };
}

function holidayJson(holiday: Holiday): Record<string, unknown> {
  return {
    date: holiday.date,
    name_ja: holiday.nameJa,
    // 参考訳（公式英語名は存在しない。README注記あり: CR7-2）
    name_en: holiday.nameEn,
    // 「休日」系（振替休日・国民の休日等。CSVは区別しない）
    is_general_public_holiday: holiday.isGeneralPublicHoliday,
  };
}

/** date_info: 移植元 /v1/date/{date}（＋/wareki/from-westernのnote）を1レコードに */
export function dateInfoItem(
  raw: string,
  options: BusinessDayOptions,
  today: YmdDate,
  context: TransformContext,
): ItemResult {
  const operation: Operation = 'date_info';
  const date = parseIsoDate(raw.trim());
  if (date === null) {
    return errorRecord(operation, { input: raw }, invalidDateMessage(raw), context);
  }
  const iso = formatIso(date);
  // 祝日・営業日判定はデータ収録範囲が根拠（FR7-3）。範囲は1955年〜のため和暦の1873下限より狭く、
  // 範囲内なら toWareki が失敗することはない（移植元 date.ts と同じ前提）
  if (!isWithinCoveredRange(date)) {
    return errorRecord(
      operation,
      { input: raw },
      `${iso} is outside the holiday data coverage, so holiday/business-day fields cannot be answered. For era conversion of any date since ${SUPPORTED_FROM}, use the wareki_to_western operation.${coveredRangeSuffix()}`,
      context,
    );
  }
  const wareki = toWareki(date, today);
  if (!wareki.ok) {
    throw new Error('unreachable: covered range is within wareki-supported range');
  }
  const holidayNameJa = holidayNameJaOf(date);
  const business = checkBusinessDay(date, options);
  return {
    ok: true,
    records: [
      meta(
        {
          operation,
          date: iso,
          weekday: weekdayEn(date),
          weekday_ja: weekdayJa(date),
          wareki: warekiJson(wareki.wareki),
          is_holiday: holidayNameJa !== null,
          holiday_name_ja: holidayNameJa,
          holiday_name_en: holidayNameJa !== null ? holidayNameEn(holidayNameJa) : null,
          is_business_day: business.isBusinessDay,
          non_business_reason: business.isBusinessDay ? null : business.reason,
          fiscal_year: fiscalYear(date),
          is_leap_year: isLeapYear(date.year),
          // 未来日付は現行元号の継続を仮定して計算（将来の改元で変わりうる。移植元 from-western の note）
          note: wareki.futureNote,
        },
        context,
      ),
    ],
  };
}

/** wareki_to_western: 移植元 /v1/wareki/to-western と同形（date / yearの2形） */
export function warekiItem(input: string, context: TransformContext): ItemResult {
  const operation: Operation = 'wareki_to_western';
  const result = parseWareki(input);
  if (!result.ok) {
    switch (result.error) {
      case 'unparseable':
        return errorRecord(
          operation,
          { input },
          `Could not parse "${input}" as a Japanese era date. Accepted examples: 令和8年7月11日 / 令和8年 / R8.7.11 / reiwa 8 / 平成元年5月1日.`,
          context,
        );
      case 'invalid_date':
      case 'era_date_mismatch':
        return errorRecord(operation, { input }, result.message, context);
      case 'before_gregorian_adoption':
        return errorRecord(
          operation,
          { input },
          `Dates before ${SUPPORTED_FROM} are not supported: Japan used a lunisolar calendar before adopting the Gregorian calendar, so simple conversion would be historically inaccurate.`,
          context,
        );
    }
  }
  if (result.kind === 'date') {
    return {
      ok: true,
      records: [
        meta(
          { operation, input, date: formatIso(result.date), wareki: warekiJson(result.wareki) },
          context,
        ),
      ],
    };
  }
  // 年のみの入力: 該当する西暦年と、その元号年が西暦上で占める日付範囲
  return {
    ok: true,
    records: [
      meta(
        {
          operation,
          input,
          western_year: result.westernYear,
          wareki: {
            era: result.wareki.era,
            era_ja: result.wareki.eraJa,
            year: result.wareki.year,
            is_first_year: result.wareki.isFirstYear,
          },
          era_year_starts_on: formatIso(result.gregorianStart),
          era_year_ends_on: formatIso(result.gregorianEnd),
        },
        context,
      ),
    ],
  };
}

/** holidays: 移植元 /v1/holidays/{year} を1祝日=1レコードへ展開（FR7-1） */
export function holidaysItem(yearRaw: unknown, context: TransformContext): ItemResult {
  const operation: Operation = 'holidays';
  if (
    typeof yearRaw !== 'number' ||
    !Number.isInteger(yearRaw) ||
    !/^\d{4}$/.test(String(yearRaw))
  ) {
    return errorRecord(
      operation,
      { input: String(yearRaw) },
      `"${String(yearRaw)}" is not a valid year. Use a 4-digit year (e.g. 2026).`,
      context,
    );
  }
  const year = yearRaw;
  if (!isYearCovered(year)) {
    return errorRecord(
      operation,
      { input: String(year) },
      `Year ${year} is outside the holiday data coverage. Covered years: ${COVERED_FROM.slice(0, 4)}-${COVERED_TO.slice(0, 4)}.${coveredRangeSuffix()}`,
      context,
    );
  }
  return {
    ok: true,
    records: holidaysOfYear(year).map((holiday) =>
      meta({ operation, year, ...holidayJson(holiday) }, context),
    ),
  };
}

/** holidays_next: 移植元 /v1/holidays/next と同形（from当日を含む） */
export function holidaysNextItem(
  fromRaw: string | undefined,
  today: YmdDate,
  context: TransformContext,
): ItemResult {
  const operation: Operation = 'holidays_next';
  let from: YmdDate;
  if (fromRaw === undefined || fromRaw.trim() === '') {
    from = today; // from_date省略時はJSTの当日（入力スキーマに明記）
  } else {
    const parsed = parseIsoDate(fromRaw.trim());
    if (parsed === null) {
      return errorRecord(operation, { input: fromRaw }, invalidDateMessage(fromRaw), context);
    }
    from = parsed;
  }
  const fromIso = formatIso(from);
  if (!isWithinCoveredRange(from)) {
    return errorRecord(
      operation,
      { input: fromIso },
      `"from" (${fromIso}) is outside the holiday data coverage, so the next holiday cannot be determined from recorded data.${coveredRangeSuffix()}`,
      context,
    );
  }
  const next = nextHolidayOnOrAfter(from);
  if (next === null) {
    return errorRecord(
      operation,
      { input: fromIso },
      `No national holiday is recorded on or after ${fromIso} within the covered range. The data is updated when the official source publishes new years.${coveredRangeSuffix()}`,
      context,
    );
  }
  const nextDate = parseIsoDate(next.date);
  return {
    ok: true,
    records: [
      meta(
        {
          operation,
          from: fromIso,
          // from当日が祝日の場合はその日を返す（on or after）
          next_holiday: holidayJson(next),
          days_until: nextDate === null ? null : toEpochDays(nextDate) - toEpochDays(from),
        },
        context,
      ),
    ],
  };
}

/** business_days_add の1項目（入力スキーマの items 要素） */
export interface AddItemInput {
  date?: unknown;
  days?: unknown;
}

/** business_days_add: 移植元 /v1/business-days/add と同形 */
export function businessDaysAddItem(
  item: AddItemInput,
  options: BusinessDayOptions,
  context: TransformContext,
): ItemResult {
  const operation: Operation = 'business_days_add';
  const dateRaw = typeof item.date === 'string' ? item.date : '';
  const echo = { input: JSON.stringify({ date: item.date ?? null, days: item.days ?? null }) };
  const date = parseIsoDate(dateRaw.trim());
  if (date === null) {
    return errorRecord(operation, echo, invalidDateMessage(dateRaw), context);
  }
  if (typeof item.days !== 'number' || !Number.isInteger(item.days)) {
    return errorRecord(
      operation,
      echo,
      `"days" must be an integer (got "${String(item.days)}").`,
      context,
    );
  }
  const days = item.days;
  if (Math.abs(days) > MAX_ADD_DAYS) {
    return errorRecord(
      operation,
      echo,
      `|days| must be at most ${MAX_ADD_DAYS} (got ${days}).`,
      context,
    );
  }
  const iso = formatIso(date);
  if (!isWithinCoveredRange(date)) {
    return errorRecord(
      operation,
      echo,
      `${iso} is outside the holiday data coverage, so business days cannot be calculated from recorded data.${coveredRangeSuffix()}`,
      context,
    );
  }
  const result = addBusinessDays(date, days, options);
  if (!result.ok) {
    return errorRecord(
      operation,
      echo,
      `Adding ${days} business days to ${iso} goes beyond the holiday data coverage, so the result cannot be determined from recorded data.${coveredRangeSuffix()}`,
      context,
    );
  }
  return {
    ok: true,
    records: [
      meta(
        {
          operation,
          start_date: iso,
          business_days_added: days,
          result_date: formatIso(result.date),
        },
        context,
      ),
    ],
  };
}

/** business_days_count の1項目（入力スキーマの ranges 要素） */
export interface RangeItemInput {
  from?: unknown;
  to?: unknown;
}

/** business_days_count: 移植元 /v1/business-days/count と同形（両端を含む） */
export function businessDaysCountItem(
  range: RangeItemInput,
  options: BusinessDayOptions,
  context: TransformContext,
): ItemResult {
  const operation: Operation = 'business_days_count';
  const echo = { input: JSON.stringify({ from: range.from ?? null, to: range.to ?? null }) };
  const fromRaw = typeof range.from === 'string' ? range.from : '';
  const from = parseIsoDate(fromRaw.trim());
  if (from === null) {
    return errorRecord(operation, echo, invalidDateMessage(fromRaw), context);
  }
  const toRaw = typeof range.to === 'string' ? range.to : '';
  const to = parseIsoDate(toRaw.trim());
  if (to === null) {
    return errorRecord(operation, echo, invalidDateMessage(toRaw), context);
  }
  const fromIso = formatIso(from);
  const toIso = formatIso(to);
  if (compareYmd(from, to) > 0) {
    return errorRecord(
      operation,
      echo,
      `"from" (${fromIso}) must be on or before "to" (${toIso}).`,
      context,
    );
  }
  const periodDays = toEpochDays(to) - toEpochDays(from) + 1;
  if (periodDays > MAX_COUNT_PERIOD_DAYS) {
    return errorRecord(
      operation,
      echo,
      `The period from "from" to "to" must be at most 100 years (got ${periodDays} days).`,
      context,
    );
  }
  if (!isWithinCoveredRange(from) || !isWithinCoveredRange(to)) {
    return errorRecord(
      operation,
      echo,
      `The period ${fromIso}..${toIso} is not fully inside the holiday data coverage, so business days cannot be counted from recorded data.${coveredRangeSuffix()}`,
      context,
    );
  }
  const count = countBusinessDays(from, to, options);
  return {
    ok: true,
    records: [
      meta(
        {
          operation,
          from: fromIso,
          to: toIso,
          // 両端を含む（包含仕様をフィールド名で自明にする。移植元 count と同形）
          includes_from: true,
          includes_to: true,
          business_day_count: count,
        },
        context,
      ),
    ],
  };
}
