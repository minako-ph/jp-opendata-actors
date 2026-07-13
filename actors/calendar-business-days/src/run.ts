import type { Billing } from '@jp-opendata/billing';
import { MAX_EXTRA_HOLIDAYS, type BusinessDayOptions } from './core/business-days';
import {
  compareYmd,
  fromEpochDays,
  parseIsoDate,
  toEpochDays,
  todayInJst,
  WEEKDAYS_EN,
  type YmdDate,
} from './core/date-utils';
import { COVERED_TO, COVERED_TO_DATE } from './core/holidays';
import {
  businessDaysAddItem,
  businessDaysCountItem,
  dateInfoItem,
  holidaysItem,
  holidaysNextItem,
  warekiItem,
  type AddItemInput,
  type ItemResult,
  type Operation,
  type RangeItemInput,
} from './transform.js';

/**
 * Actor#7 実行コア（Apify SDK非依存・テスト可能。#3と同型のRunDeps注入）。
 * - 外部API・LLM呼び出しなし。祝日データはビルド時同梱snapshotのみ（N7-1）
 * - FR-C7: 入力項目は全operation合計1,000件/run。超過はエラーでなく打ち切り＋警告＋summary.items_truncated
 * - FR-C8: 項目単位の失敗は_errorレコードで継続・非課金。実行失敗は入力全項目が不正な場合のみ
 * - 課金は有効レコードのみ record-basic。上限到達はgraceful終了（R2-6同型）
 * - N7-2: today > COVERED_TO − 90日 でサマリ警告＋アラート通知（1回/実行）
 */

export interface CalendarInput {
  operation: Operation;
  dates?: string[];
  wareki_strings?: string[];
  years?: number[];
  from_date?: string;
  items?: AddItemInput[];
  ranges?: RangeItemInput[];
  weekend_days?: string[];
  include_national_holidays?: boolean;
  extra_holidays?: string[];
}

/** Actor.getInputは未検証JSONのため、operationは実行時に検証する（型アサーション不使用の受け口） */
export type UnvalidatedCalendarInput = Omit<CalendarInput, 'operation'> & { operation: string };

export interface RunLogger {
  info(message: string): void;
  warning(message: string): void;
  error(message: string): void;
}

export interface RunSummary {
  operation: Operation;
  items_planned: number;
  items_used: number;
  items_truncated: boolean;
  records_pushed: number;
  record_errors: number;
  record_failure_rate: number;
  records_charged: number;
  free_used: number;
  charge_limit_reached: boolean;
  freshness_warning: boolean;
  covered_to: string;
}

export interface RunDeps {
  billing: Billing;
  pushData: (item: Record<string, unknown>) => Promise<void>;
  log: RunLogger;
  retrievedAt: string;
  alert?: (summary: RunSummary) => Promise<void>;
  /** 決定化用（テスト・golden）。省略時は todayInJst() */
  today?: YmdDate;
  /** テスト用の上限上書き */
  maxItems?: number;
}

/** FR-C7: 入力項目の全operation合計上限 */
export const MAX_ITEMS_PER_RUN = 1000;

/** N7-2: snapshot鮮度ガードの猶予日数 */
export const FRESHNESS_GUARD_DAYS = 90;

export class RunFailedError extends Error {}

const OPERATIONS: ReadonlyArray<Operation> = [
  'date_info',
  'wareki_to_western',
  'holidays',
  'holidays_next',
  'business_days_add',
  'business_days_count',
];

function isOperation(value: string): value is Operation {
  return OPERATIONS.some((operation) => operation === value);
}

const WEEKDAY_INDEX: ReadonlyMap<string, number> = new Map(WEEKDAYS_EN.map((name, i) => [name, i]));

/**
 * 共通オプション（FR7-1: weekend_days 既定土日／include_national_holidays 既定true／
 * extra_holidays 上限100）。項目単位でなく実行全体の設定のため、不正は実行失敗（RunFailedError）。
 * メッセージは移植元 shared.ts validateBusinessDayOptions と同文。
 */
export function parseBusinessDayOptions(
  input: CalendarInput | UnvalidatedCalendarInput,
): BusinessDayOptions {
  const weekendIndices = new Set<number>([0, 6]);
  if (input.weekend_days !== undefined) {
    weekendIndices.clear();
    for (const token of input.weekend_days) {
      const index = WEEKDAY_INDEX.get(token.trim().toLowerCase());
      if (index === undefined) {
        throw new RunFailedError(
          `"${token}" is not a valid weekday name. Use comma-separated values among: ${WEEKDAYS_EN.join(', ')}.`,
        );
      }
      weekendIndices.add(index);
    }
  }

  const extraHolidays = new Set<string>();
  const extraRaw = input.extra_holidays ?? [];
  if (extraRaw.length > MAX_EXTRA_HOLIDAYS) {
    throw new RunFailedError(
      `extra_holidays accepts at most ${MAX_EXTRA_HOLIDAYS} dates (got ${extraRaw.length}).`,
    );
  }
  for (const token of extraRaw) {
    const trimmed = token.trim();
    if (trimmed === '') continue;
    const date = parseIsoDate(trimmed);
    if (date === null) {
      throw new RunFailedError(
        `extra_holidays contains "${token}", which is not a valid YYYY-MM-DD date.`,
      );
    }
    extraHolidays.add(trimmed);
  }

  return {
    weekendIndices,
    extraHolidays,
    includeNationalHolidays: input.include_national_holidays ?? true,
  };
}

/** operation別の入力項目リストを取り出す（空なら実行失敗: 処理対象ゼロはFR-C8の「全項目不正」以前の入力不備） */
function collectItems(
  operation: Operation,
  input: CalendarInput | UnvalidatedCalendarInput,
): unknown[] {
  switch (operation) {
    case 'date_info': {
      const dates = input.dates ?? [];
      if (dates.length === 0) {
        throw new RunFailedError('operation "date_info" requires "dates" (ISO dates YYYY-MM-DD).');
      }
      return dates;
    }
    case 'wareki_to_western': {
      const strings = input.wareki_strings ?? [];
      if (strings.length === 0) {
        throw new RunFailedError(
          'operation "wareki_to_western" requires "wareki_strings" (e.g. 令和8年7月11日, R8.7.11, reiwa 8).',
        );
      }
      return strings;
    }
    case 'holidays': {
      const years = input.years ?? [];
      if (years.length === 0) {
        throw new RunFailedError('operation "holidays" requires "years" (4-digit years).');
      }
      return years;
    }
    case 'holidays_next':
      // from_date省略時はtoday JST（入力スキーマ・READMEに明記）。常に1項目
      return [input.from_date];
    case 'business_days_add': {
      const items = input.items ?? [];
      if (items.length === 0) {
        throw new RunFailedError(
          'operation "business_days_add" requires "items" ([{"date": "YYYY-MM-DD", "days": N}]).',
        );
      }
      return items;
    }
    case 'business_days_count': {
      const ranges = input.ranges ?? [];
      if (ranges.length === 0) {
        throw new RunFailedError(
          'operation "business_days_count" requires "ranges" ([{"from": "YYYY-MM-DD", "to": "YYYY-MM-DD"}]).',
        );
      }
      return ranges;
    }
  }
}

function transformItem(
  operation: Operation,
  item: unknown,
  options: BusinessDayOptions,
  today: YmdDate,
  retrievedAt: string,
): ItemResult {
  const context = { retrievedAt };
  switch (operation) {
    case 'date_info':
      return dateInfoItem(String(item), options, today, context);
    case 'wareki_to_western':
      return warekiItem(String(item), context);
    case 'holidays':
      return holidaysItem(item, context);
    case 'holidays_next':
      return holidaysNextItem(item === undefined ? undefined : String(item), today, context);
    case 'business_days_add':
      return businessDaysAddItem(asObject(item), options, context);
    case 'business_days_count':
      return businessDaysCountItem(asObject(item), options, context);
  }
}

/** items/ranges要素の非オブジェクト入力（文字列等）は空オブジェクト扱い→項目単位の_errorに落ちる */
function asObject(item: unknown): Record<string, unknown> {
  if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
    return { ...item };
  }
  return {};
}

export async function runCalendarBusinessDays(
  input: CalendarInput | UnvalidatedCalendarInput,
  deps: RunDeps,
): Promise<RunSummary> {
  const operation = input.operation;
  if (!isOperation(operation)) {
    throw new RunFailedError(
      `Unknown operation "${operation}". Use one of: ${OPERATIONS.join(', ')}.`,
    );
  }
  const options = parseBusinessDayOptions(input);
  const today = deps.today ?? todayInJst();
  const maxItems = deps.maxItems ?? MAX_ITEMS_PER_RUN;

  const summary: RunSummary = {
    operation,
    items_planned: 0,
    items_used: 0,
    items_truncated: false,
    records_pushed: 0,
    record_errors: 0,
    record_failure_rate: 0,
    records_charged: 0,
    free_used: 0,
    charge_limit_reached: false,
    freshness_warning: false,
    covered_to: COVERED_TO,
  };

  // N7-2 鮮度ガード: 収録範囲の残りが90日を切ったら年次更新の前倒しシグナル
  const freshnessThreshold = fromEpochDays(toEpochDays(COVERED_TO_DATE) - FRESHNESS_GUARD_DAYS);
  if (compareYmd(today, freshnessThreshold) > 0) {
    summary.freshness_warning = true;
    deps.log.warning(
      `Holiday data snapshot is nearing the end of its coverage (covered_to=${COVERED_TO}). Run the manual update pipeline (fetch-holidays → build-holidays → golden review).`,
    );
  }

  const allItems = collectItems(operation, input);
  summary.items_planned = allItems.length;
  let items = allItems;
  if (items.length > maxItems) {
    summary.items_truncated = true;
    deps.log.warning(
      `${items.length} input items requested; capped at ${maxItems} per run (per-run limit).`,
    );
    items = items.slice(0, maxItems);
  }
  summary.items_used = items.length;

  outer: for (const item of items) {
    const result = transformItem(operation, item, options, today, deps.retrievedAt);
    if (!result.ok) {
      // FR-C8: 失敗項目は_error付きで出力して継続（課金しない）
      summary.record_errors++;
      await deps.pushData(result.record);
      continue;
    }
    for (const record of result.records) {
      await deps.pushData(record);
      const outcome = await deps.billing.charge('record-basic');
      summary.records_pushed++;
      if (outcome.limitReached) {
        summary.charge_limit_reached = true;
        deps.log.warning('Max charge limit reached; stopping gracefully with partial results.');
        break outer;
      }
    }
  }

  await finalizeSummary(summary, deps);
  if (summary.records_pushed === 0 && summary.record_errors > 0) {
    throw new RunFailedError(
      'All input items were invalid; no valid record was produced. See the _error records in the dataset for details.',
    );
  }
  return summary;
}

async function finalizeSummary(summary: RunSummary, deps: RunDeps): Promise<void> {
  const processed = summary.records_pushed + summary.record_errors;
  summary.record_failure_rate = processed === 0 ? 0 : summary.record_errors / processed;
  summary.records_charged = deps.billing.totals()['record-basic'];
  summary.free_used = deps.billing.freeUsed()['record-basic'];

  // N-4監視: 失敗率>20% と N7-2鮮度ガードのいずれかで通知（1回/実行）
  const shouldAlert = summary.record_failure_rate > 0.2 || summary.freshness_warning;
  if (shouldAlert) {
    deps.log.warning(`Monitoring alert condition met: ${JSON.stringify(summary)}`);
    if (deps.alert) {
      try {
        await deps.alert(summary);
      } catch (error) {
        deps.log.error(`Failed to send alert: ${String(error)}`);
      }
    }
  }
  deps.log.info(`Run summary: ${JSON.stringify(summary)}`);
}
