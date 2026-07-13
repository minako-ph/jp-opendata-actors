/**
 * 和暦⇔西暦変換（FR-2 / FR-3）。
 *
 * - 和暦→西暦の日付変換エンジンは normalize-jp の warekiToIso を流用し、
 *   表記ゆれ（R8.7.11 / reiwa 8 / 年のみ等）の前処理と、施行日境界・実在日・
 *   1873下限の検証を本ファイルで行う。
 * - 元号の基準年は normalize-jp の ERA_BASE_YEARS と一致させる（明治1867/大正1911/
 *   昭和1925/平成1988/令和2018）。施行日境界は normalize-jp にデータがないため
 *   本ファイルで定義し、golden fixture で固定する（decisions.md 2026-07-11）。
 */
import { warekiToIso, toHalfWidth } from '@jp-opendata/normalize-jp';
import {
  compareYmd,
  formatIso,
  fromEpochDays,
  isValidYmd,
  parseIsoDate,
  toEpochDays,
  type YmdDate,
} from './date-utils';

function addDays(date: YmdDate, days: number): YmdDate {
  return fromEpochDays(toEpochDays(date) + days);
}

export type EraKey = 'meiji' | 'taisho' | 'showa' | 'heisei' | 'reiwa';

interface EraDef {
  key: EraKey;
  ja: string;
  /** 施行日（この日から当該元号）。改元境界は施行日基準（FR-3） */
  start: YmdDate;
  /** 西暦年 = baseYear + 元号年（normalize-jp ERA_BASE_YEARS と同値） */
  baseYear: number;
}

/** 古い順。最後の要素が現行元号 */
export const ERAS: ReadonlyArray<EraDef> = [
  { key: 'meiji', ja: '明治', start: { year: 1868, month: 10, day: 23 }, baseYear: 1867 },
  { key: 'taisho', ja: '大正', start: { year: 1912, month: 7, day: 30 }, baseYear: 1911 },
  { key: 'showa', ja: '昭和', start: { year: 1926, month: 12, day: 25 }, baseYear: 1925 },
  { key: 'heisei', ja: '平成', start: { year: 1989, month: 1, day: 8 }, baseYear: 1988 },
  { key: 'reiwa', ja: '令和', start: { year: 2019, month: 5, day: 1 }, baseYear: 2018 },
];

/** グレゴリオ暦採用日。これより前は旧暦期間のため変換非対応（FR-3） */
export const GREGORIAN_ADOPTION: YmdDate = { year: 1873, month: 1, day: 1 };

export const FUTURE_ERA_NOTE =
  'This is a future date. The result assumes the current era (Reiwa) continues; a future era change may alter it.';

export interface WarekiInfo {
  era: EraKey;
  eraJa: string;
  year: number;
  isFirstYear: boolean;
  formattedJa: string;
}

function buildWarekiInfo(era: EraDef, date: YmdDate): WarekiInfo {
  const year = date.year - era.baseYear;
  const isFirstYear = year === 1;
  return {
    era: era.key,
    eraJa: era.ja,
    year,
    isFirstYear,
    formattedJa: `${era.ja}${isFirstYear ? '元' : year}年${date.month}月${date.day}日`,
  };
}

function eraOf(date: YmdDate): EraDef {
  let matched: EraDef | undefined;
  for (const era of ERAS) {
    if (compareYmd(date, era.start) >= 0) matched = era;
  }
  if (matched === undefined) {
    // 呼び出し側で GREGORIAN_ADOPTION 未満を先に弾いているため到達しない
    throw new Error(`unreachable: no era for ${formatIso(date)}`);
  }
  return matched;
}

export type ToWarekiResult =
  | { ok: true; wareki: WarekiInfo; futureNote: string | null }
  | { ok: false; error: 'before_gregorian_adoption' };

/** 西暦→和暦（FR-3）。today は未来判定（注記付与）に使用 */
export function toWareki(date: YmdDate, today: YmdDate): ToWarekiResult {
  if (compareYmd(date, GREGORIAN_ADOPTION) < 0) {
    return { ok: false, error: 'before_gregorian_adoption' };
  }
  const era = eraOf(date);
  return {
    ok: true,
    wareki: buildWarekiInfo(era, date),
    futureNote: compareYmd(date, today) > 0 ? FUTURE_ERA_NOTE : null,
  };
}

const ERA_BY_KEY = new Map(ERAS.map((e) => [e.key, e]));
const NEXT_ERA = new Map(ERAS.map((e, i) => [e.key, ERAS[i + 1] ?? null]));

function eraByToken(token: string): EraDef | null {
  const t = token.toLowerCase();
  for (const era of ERAS) {
    if (t === era.ja || t === era.key || t === era.key[0]) return era;
  }
  return null;
}

export type ParseWarekiResult =
  | { ok: true; kind: 'date'; date: YmdDate; wareki: WarekiInfo }
  | {
      ok: true;
      kind: 'year';
      wareki: { era: EraKey; eraJa: string; year: number; isFirstYear: boolean };
      westernYear: number;
      /** この元号年が西暦上で占める範囲（元年・末年は年途中で始まり/終わる） */
      gregorianStart: YmdDate;
      gregorianEnd: YmdDate;
    }
  | { ok: false; error: 'unparseable' }
  | { ok: false; error: 'invalid_date'; message: string }
  | { ok: false; error: 'before_gregorian_adoption' }
  | { ok: false; error: 'era_date_mismatch'; message: string };

const WAREKI_PATTERN =
  /^(明治|大正|昭和|平成|令和|meiji|taisho|showa|heisei|reiwa|[mtshr])[\s.]*(元|\d{1,2})(?:\s*年|\s*[./-]|\s+|$)\s*(?:(\d{1,2})(?:\s*月|\s*[./-])\s*(\d{1,2})\s*日?)?$/i;

/**
 * 和暦文字列→西暦（FR-2）。
 * 「令和8年7月11日」「令和8年」「R8.7.11」「reiwa 8」「平成元年5月1日」等に対応。
 * 年のみの入力は該当する西暦年と、その元号年が占める西暦上の日付範囲を返す。
 */
export function parseWareki(input: string): ParseWarekiResult {
  const normalized = toHalfWidth(input.trim());
  const m = normalized.match(WAREKI_PATTERN);
  if (!m) return { ok: false, error: 'unparseable' };
  const [, eraToken, yearRaw, monthRaw, dayRaw] = m;
  if (eraToken === undefined || yearRaw === undefined) return { ok: false, error: 'unparseable' };
  const era = eraByToken(eraToken);
  if (era === null) return { ok: false, error: 'unparseable' };
  const eraYear = yearRaw === '元' ? 1 : Number(yearRaw);
  if (eraYear < 1) return { ok: false, error: 'unparseable' };

  const next = NEXT_ERA.get(era.key) ?? null;
  const westernYear = era.baseYear + eraYear;
  // 元号年の上限: 次の元号の施行年までは旧元号の年が存在する（例: 平成31年=2019）
  if (next !== null && westernYear > next.start.year) {
    return {
      ok: false,
      error: 'era_date_mismatch',
      message: `${era.ja}${eraYear} (${westernYear}) is after the ${era.ja} era ended (${next.ja} began on ${formatIso(next.start)}).`,
    };
  }

  if (monthRaw === undefined || dayRaw === undefined) {
    // 年のみ
    if (westernYear < GREGORIAN_ADOPTION.year) {
      return { ok: false, error: 'before_gregorian_adoption' };
    }
    const jan1: YmdDate = { year: westernYear, month: 1, day: 1 };
    const dec31: YmdDate = { year: westernYear, month: 12, day: 31 };
    const gregorianStart = compareYmd(era.start, jan1) > 0 ? era.start : jan1;
    let gregorianEnd = dec31;
    if (next !== null && next.start.year === westernYear) {
      // 末年: 次元号の施行日前日まで
      const end = addDays(next.start, -1);
      if (compareYmd(end, dec31) < 0) gregorianEnd = end;
    }
    return {
      ok: true,
      kind: 'year',
      wareki: { era: era.key, eraJa: era.ja, year: eraYear, isFirstYear: eraYear === 1 },
      westernYear,
      gregorianStart,
      gregorianEnd,
    };
  }

  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!isValidYmd(westernYear, month, day)) {
    return {
      ok: false,
      error: 'invalid_date',
      message: `${era.ja}${eraYear}年${month}月${day}日 (${westernYear}-${month}-${day}) is not a valid calendar date.`,
    };
  }
  // 変換エンジンは normalize-jp を流用（handover §2.3）
  const iso = warekiToIso(`${era.ja}${eraYear}年${month}月${day}日`);
  if (iso === null) return { ok: false, error: 'unparseable' };
  const date = parseIsoDate(iso);
  if (date === null) return { ok: false, error: 'unparseable' };

  if (compareYmd(date, GREGORIAN_ADOPTION) < 0) {
    return { ok: false, error: 'before_gregorian_adoption' };
  }
  // 施行日境界の検証: 元号と日付の組が実在すること（例: 平成31年5月1日は不正）
  if (compareYmd(date, era.start) < 0) {
    return {
      ok: false,
      error: 'era_date_mismatch',
      message: `${era.ja} era began on ${formatIso(era.start)}; ${formatIso(date)} is before that.`,
    };
  }
  if (next !== null && compareYmd(date, next.start) >= 0) {
    return {
      ok: false,
      error: 'era_date_mismatch',
      message: `${era.ja} era ended on ${formatIso(addDays(next.start, -1))}; use ${next.ja} for ${formatIso(date)}.`,
    };
  }
  return { ok: true, kind: 'date', date, wareki: buildWarekiInfo(era, date) };
}

export function eraByKey(key: EraKey): EraDef {
  const era = ERA_BY_KEY.get(key);
  if (era === undefined) throw new Error(`unreachable: unknown era ${key}`);
  return era;
}
