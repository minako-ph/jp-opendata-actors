import { describe, expect, it } from 'vitest';
import {
  COVERED_FROM,
  COVERED_TO,
  HOLIDAY_NAME_EN,
  holidayNameEn,
  holidayNameJaOf,
  holidaysOfYear,
  isGeneralPublicHoliday,
  isWithinCoveredRange,
  isYearCovered,
  nextHolidayOnOrAfter,
} from '../src/core/holidays';
import { HOLIDAY_NAMES_JA } from '../src/generated/holidays-data';
import { parseIsoDate, type YmdDate } from '../src/core/date-utils';

function ymd(iso: string): YmdDate {
  const date = parseIsoDate(iso);
  if (date === null) throw new Error(`bad test date: ${iso}`);
  return date;
}

describe('英語名マッピング（§7.1: 未知名称の検知）', () => {
  it('CSVの全ユニーク名称に明示的な参考訳がある（年次更新で未知名称が入るとここで検知される）', () => {
    for (const nameJa of HOLIDAY_NAMES_JA) {
      expect(HOLIDAY_NAME_EN[nameJa], `missing English mapping for ${nameJa}`).toBeDefined();
    }
  });
  it('表にない名称は Public Holiday にフォールバック', () => {
    expect(holidayNameEn('未知の祝日')).toBe('Public Holiday');
  });
});

describe('祝日判定', () => {
  it('2019-05-01 は「休日（祝日扱い）」（CSV原文の名称）', () => {
    expect(holidayNameJaOf(ymd('2019-05-01'))).toBe('休日（祝日扱い）');
    expect(isGeneralPublicHoliday('休日（祝日扱い）')).toBe(true);
  });
  it('2026-07-11 は祝日でない', () => {
    expect(holidayNameJaOf(ymd('2026-07-11'))).toBeNull();
  });
  it('振替休日（2026-05-06 休日）', () => {
    expect(holidayNameJaOf(ymd('2026-05-06'))).toBe('休日');
    expect(isGeneralPublicHoliday('休日')).toBe(true);
    expect(isGeneralPublicHoliday('元日')).toBe(false);
  });
});

describe('収録範囲（FR-10: 実CSVから機械決定）', () => {
  it('covered_from/to は年単位', () => {
    expect(COVERED_FROM).toBe('1955-01-01');
    expect(COVERED_TO).toBe('2027-12-31');
  });
  it('範囲判定', () => {
    expect(isWithinCoveredRange(ymd('1955-01-01'))).toBe(true);
    expect(isWithinCoveredRange(ymd('2027-12-31'))).toBe(true);
    expect(isWithinCoveredRange(ymd('1954-12-31'))).toBe(false);
    expect(isWithinCoveredRange(ymd('2028-01-01'))).toBe(false);
    expect(isYearCovered(1955)).toBe(true);
    expect(isYearCovered(2027)).toBe(true);
    expect(isYearCovered(1954)).toBe(false);
    expect(isYearCovered(2028)).toBe(false);
  });
});

describe('年間一覧（FR-4）', () => {
  it('2026年は18件で日付昇順', () => {
    const list = holidaysOfYear(2026);
    expect(list.length).toBe(18);
    expect(list[0]).toMatchObject({ date: '2026-01-01', nameJa: '元日', nameEn: "New Year's Day" });
    const dates = list.map((h) => h.date);
    expect([...dates].sort()).toEqual(dates);
  });
});

describe('次の祝日（FR-5: from当日を含む）', () => {
  it('祝日当日は当日を返す', () => {
    expect(nextHolidayOnOrAfter(ymd('2026-07-20'))?.date).toBe('2026-07-20');
  });
  it('翌日以降の直近を返す', () => {
    expect(nextHolidayOnOrAfter(ymd('2026-07-11'))?.date).toBe('2026-07-20');
  });
  it('収録範囲の末尾以降は null', () => {
    expect(nextHolidayOnOrAfter(ymd('2027-11-24'))).toBeNull();
  });
});
