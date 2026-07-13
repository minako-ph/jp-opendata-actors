import { describe, expect, it } from 'vitest';
import {
  addBusinessDays,
  checkBusinessDay,
  countBusinessDays,
  type BusinessDayOptions,
} from '../src/core/business-days';
import { formatIso, parseIsoDate, type YmdDate } from '../src/core/date-utils';

function ymd(iso: string): YmdDate {
  const date = parseIsoDate(iso);
  if (date === null) throw new Error(`bad test date: ${iso}`);
  return date;
}

const DEFAULT: BusinessDayOptions = {
  weekendIndices: new Set([0, 6]), // 日・土
  extraHolidays: new Set(),
  includeNationalHolidays: true,
};

describe('checkBusinessDay（FR-6）', () => {
  it('土曜は weekend', () => {
    expect(checkBusinessDay(ymd('2026-07-11'), DEFAULT)).toEqual({
      isBusinessDay: false,
      reason: 'weekend',
      holidayNameJa: null,
    });
  });
  it('祝日（月曜）は national_holiday と祝日名', () => {
    expect(checkBusinessDay(ymd('2026-07-20'), DEFAULT)).toEqual({
      isBusinessDay: false,
      reason: 'national_holiday',
      holidayNameJa: '海の日',
    });
  });
  it('平日は business_day', () => {
    expect(checkBusinessDay(ymd('2026-07-13'), DEFAULT)).toEqual({
      isBusinessDay: true,
      reason: 'business_day',
      holidayNameJa: null,
    });
  });
  it('extra_holidays 指定日は extra_holiday', () => {
    const options: BusinessDayOptions = { ...DEFAULT, extraHolidays: new Set(['2026-07-13']) };
    expect(checkBusinessDay(ymd('2026-07-13'), options).reason).toBe('extra_holiday');
  });
  it('判定順は weekend → national_holiday（祝日が土曜なら weekend）', () => {
    // 2026-05-03 憲法記念日は日曜
    expect(checkBusinessDay(ymd('2026-05-03'), DEFAULT).reason).toBe('weekend');
  });
  it('include_national_holidays=false なら祝日も営業日', () => {
    const options: BusinessDayOptions = { ...DEFAULT, includeNationalHolidays: false };
    expect(checkBusinessDay(ymd('2026-07-20'), options).isBusinessDay).toBe(true);
  });
  it('weekends カスタム（日曜のみ休み）なら土曜は営業日', () => {
    const options: BusinessDayOptions = { ...DEFAULT, weekendIndices: new Set([0]) };
    expect(checkBusinessDay(ymd('2026-07-11'), options).isBusinessDay).toBe(true);
  });
});

describe('addBusinessDays（FR-7）', () => {
  it('金曜+1営業日は月曜（土日スキップ）', () => {
    const result = addBusinessDays(ymd('2026-07-10'), 1, DEFAULT);
    expect(result.ok).toBe(true);
    if (result.ok) expect(formatIso(result.date)).toBe('2026-07-13');
  });
  it('海の日の連休を跨ぐ（7/17金 +1 → 7/21火）', () => {
    const result = addBusinessDays(ymd('2026-07-17'), 1, DEFAULT);
    expect(result.ok).toBe(true);
    if (result.ok) expect(formatIso(result.date)).toBe('2026-07-21');
  });
  it('負値は遡る（7/21火 -1 → 7/17金）', () => {
    const result = addBusinessDays(ymd('2026-07-21'), -1, DEFAULT);
    expect(result.ok).toBe(true);
    if (result.ok) expect(formatIso(result.date)).toBe('2026-07-17');
  });
  it('days=0 は入力日をそのまま返す', () => {
    const result = addBusinessDays(ymd('2026-07-11'), 0, DEFAULT);
    expect(result.ok).toBe(true);
    if (result.ok) expect(formatIso(result.date)).toBe('2026-07-11');
  });
  it('収録範囲を跨ぐ計算はエラー（FR-10）', () => {
    const result = addBusinessDays(ymd('2027-12-28'), 10, DEFAULT);
    expect(result).toMatchObject({ ok: false, error: 'out_of_covered_range' });
  });
});

describe('countBusinessDays（FR-8: 両端を含む）', () => {
  it('1週間（月〜日）は5営業日', () => {
    expect(countBusinessDays(ymd('2026-07-06'), ymd('2026-07-12'), DEFAULT)).toBe(5);
  });
  it('祝日を除く（2026-07-20 海の日を含む週は4営業日）', () => {
    expect(countBusinessDays(ymd('2026-07-20'), ymd('2026-07-26'), DEFAULT)).toBe(4);
  });
  it('同日で営業日なら1（両端包含が自明）', () => {
    expect(countBusinessDays(ymd('2026-07-13'), ymd('2026-07-13'), DEFAULT)).toBe(1);
  });
  it('extra_holidays 併用', () => {
    const options: BusinessDayOptions = {
      ...DEFAULT,
      extraHolidays: new Set(['2026-07-13', '2026-07-14']),
    };
    expect(countBusinessDays(ymd('2026-07-06'), ymd('2026-07-19'), options)).toBe(8);
  });
});
