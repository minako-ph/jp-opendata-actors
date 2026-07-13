import { describe, expect, it } from 'vitest';
import {
  compareYmd,
  fiscalYear,
  formatIso,
  fromEpochDays,
  isLeapYear,
  parseIsoDate,
  toEpochDays,
  todayInJst,
  weekdayEn,
  weekdayJa,
} from '../src/core/date-utils';

describe('parseIsoDate', () => {
  it('parses a valid date', () => {
    expect(parseIsoDate('2026-07-11')).toEqual({ year: 2026, month: 7, day: 11 });
  });
  it('rejects nonexistent calendar dates', () => {
    expect(parseIsoDate('2026-02-30')).toBeNull();
    expect(parseIsoDate('2025-02-29')).toBeNull(); // 平年
    expect(parseIsoDate('2026-13-01')).toBeNull();
    expect(parseIsoDate('2026-00-10')).toBeNull();
  });
  it('accepts leap day on leap years', () => {
    expect(parseIsoDate('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 });
  });
  it('rejects non-ISO formats', () => {
    expect(parseIsoDate('2026/07/11')).toBeNull();
    expect(parseIsoDate('2026-7-11')).toBeNull();
    expect(parseIsoDate('20260711')).toBeNull();
  });
});

describe('isLeapYear', () => {
  it('handles 4/100/400 rules', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });
});

describe('epoch days round trip', () => {
  it('round-trips across a wide range', () => {
    for (const iso of [
      '1868-10-23',
      '1873-01-01',
      '1955-01-01',
      '2019-05-01',
      '2027-12-31',
      '2100-01-01',
    ]) {
      const date = parseIsoDate(iso);
      expect(date).not.toBeNull();
      if (date === null) continue;
      expect(formatIso(fromEpochDays(toEpochDays(date)))).toBe(iso);
    }
  });
  it('epoch origin is 1970-01-01', () => {
    expect(toEpochDays({ year: 1970, month: 1, day: 1 })).toBe(0);
  });
});

describe('weekday', () => {
  it('2026-07-11 is Saturday (FR-1受入基準の日付)', () => {
    const date = { year: 2026, month: 7, day: 11 };
    expect(weekdayEn(date)).toBe('saturday');
    expect(weekdayJa(date)).toBe('土');
  });
  it('2019-05-01 is Wednesday', () => {
    expect(weekdayEn({ year: 2019, month: 5, day: 1 })).toBe('wednesday');
  });
});

describe('fiscalYear（4月開始・日本標準）', () => {
  it('April starts the new fiscal year', () => {
    expect(fiscalYear({ year: 2026, month: 4, day: 1 })).toBe(2026);
    expect(fiscalYear({ year: 2026, month: 3, day: 31 })).toBe(2025);
    expect(fiscalYear({ year: 2026, month: 7, day: 11 })).toBe(2026);
    expect(fiscalYear({ year: 2026, month: 1, day: 1 })).toBe(2025);
  });
});

describe('todayInJst', () => {
  it('derives JST date via Asia/Tokyo (UTC+9)', () => {
    // UTC 15:30 → JST 翌日 00:30
    expect(todayInJst(new Date('2026-07-11T15:30:00Z'))).toEqual({ year: 2026, month: 7, day: 12 });
    expect(todayInJst(new Date('2026-07-11T14:59:00Z'))).toEqual({ year: 2026, month: 7, day: 11 });
  });
});

describe('compareYmd', () => {
  it('orders dates', () => {
    expect(compareYmd({ year: 2026, month: 7, day: 11 }, { year: 2026, month: 7, day: 11 })).toBe(
      0,
    );
    expect(
      compareYmd({ year: 2026, month: 7, day: 10 }, { year: 2026, month: 7, day: 11 }),
    ).toBeLessThan(0);
  });
});
