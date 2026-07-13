import { describe, expect, it } from 'vitest';
import { parseWareki, toWareki, FUTURE_ERA_NOTE } from '../src/core/era';
import { parseIsoDate, type YmdDate } from '../src/core/date-utils';

const TODAY: YmdDate = { year: 2026, month: 7, day: 11 };

function ymd(iso: string): YmdDate {
  const date = parseIsoDate(iso);
  if (date === null) throw new Error(`bad test date: ${iso}`);
  return date;
}

describe('toWareki（FR-3: 施行日境界）', () => {
  const cases: Array<[string, string, number, string]> = [
    ['1912-07-29', 'meiji', 45, '明治45年7月29日'],
    ['1912-07-30', 'taisho', 1, '大正元年7月30日'],
    ['1926-12-24', 'taisho', 15, '大正15年12月24日'],
    ['1926-12-25', 'showa', 1, '昭和元年12月25日'],
    ['1989-01-07', 'showa', 64, '昭和64年1月7日'],
    ['1989-01-08', 'heisei', 1, '平成元年1月8日'],
    ['2019-04-30', 'heisei', 31, '平成31年4月30日'],
    ['2019-05-01', 'reiwa', 1, '令和元年5月1日'],
    ['2026-07-11', 'reiwa', 8, '令和8年7月11日'],
    ['1873-01-01', 'meiji', 6, '明治6年1月1日'],
  ];
  for (const [iso, era, year, formatted] of cases) {
    it(`${iso} → ${formatted}`, () => {
      const result = toWareki(ymd(iso), TODAY);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.wareki.era).toBe(era);
      expect(result.wareki.year).toBe(year);
      expect(result.wareki.isFirstYear).toBe(year === 1);
      expect(result.wareki.formattedJa).toBe(formatted);
      expect(result.futureNote).toBeNull();
    });
  }

  it('1873-01-01より前は範囲外エラー（旧暦期間）', () => {
    expect(toWareki(ymd('1872-12-31'), TODAY)).toEqual({
      ok: false,
      error: 'before_gregorian_adoption',
    });
    // N-3: 明治改元日当日もエラーになることを固定
    expect(toWareki(ymd('1868-10-23'), TODAY)).toEqual({
      ok: false,
      error: 'before_gregorian_adoption',
    });
  });

  it('未来日付は現行元号で算術計算し注記を付ける', () => {
    const result = toWareki(ymd('2100-01-01'), TODAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.wareki.era).toBe('reiwa');
    expect(result.wareki.year).toBe(82);
    expect(result.futureNote).toBe(FUTURE_ERA_NOTE);
  });
});

describe('parseWareki（FR-2: 表記ゆれ）', () => {
  const fullDates: Array<[string, string]> = [
    ['令和8年7月11日', '2026-07-11'],
    ['令和8年7月11日', '2026-07-11'],
    ['R8.7.11', '2026-07-11'],
    ['r8/7/11', '2026-07-11'],
    ['R8-7-11', '2026-07-11'],
    ['reiwa 8.7.11', '2026-07-11'],
    ['平成元年5月1日', '1989-05-01'],
    ['令和元年5月1日', '2019-05-01'],
    ['Ｒ８．７．１１', '2026-07-11'], // 全角
    ['H31.4.30', '2019-04-30'],
    ['S64.1.7', '1989-01-07'],
    ['明治6年1月1日', '1873-01-01'],
  ];
  for (const [input, iso] of fullDates) {
    it(`${JSON.stringify(input)} → ${iso}`, () => {
      const result = parseWareki(input);
      expect(result.ok).toBe(true);
      if (!result.ok || result.kind !== 'date') return;
      expect(result.date).toEqual(ymd(iso));
    });
  }

  it('年のみ（令和8年）は西暦年と範囲を返す', () => {
    const result = parseWareki('令和8年');
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== 'year') return;
    expect(result.westernYear).toBe(2026);
    expect(result.gregorianStart).toEqual(ymd('2026-01-01'));
    expect(result.gregorianEnd).toEqual(ymd('2026-12-31'));
  });

  it('年のみ（reiwa 8 / R8）も同様', () => {
    for (const input of ['reiwa 8', 'R8', '令和8']) {
      const result = parseWareki(input);
      expect(result.ok, input).toBe(true);
      if (!result.ok || result.kind !== 'year') continue;
      expect(result.westernYear).toBe(2026);
    }
  });

  it('元年の年のみは施行日から年末までの範囲', () => {
    const result = parseWareki('令和元年');
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== 'year') return;
    expect(result.westernYear).toBe(2019);
    expect(result.gregorianStart).toEqual(ymd('2019-05-01'));
    expect(result.gregorianEnd).toEqual(ymd('2019-12-31'));
  });

  it('末年の年のみは年初から施行日前日までの範囲（平成31年）', () => {
    const result = parseWareki('平成31年');
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== 'year') return;
    expect(result.westernYear).toBe(2019);
    expect(result.gregorianStart).toEqual(ymd('2019-01-01'));
    expect(result.gregorianEnd).toEqual(ymd('2019-04-30'));
  });

  it('元号と日付の組が施行日境界の外なら era_date_mismatch', () => {
    const after = parseWareki('平成31年5月1日');
    expect(after).toMatchObject({ ok: false, error: 'era_date_mismatch' });
    const before = parseWareki('令和1年4月30日');
    expect(before).toMatchObject({ ok: false, error: 'era_date_mismatch' });
    const endedEraYear = parseWareki('明治46年');
    expect(endedEraYear).toMatchObject({ ok: false, error: 'era_date_mismatch' });
  });

  it('実在しない日付は invalid_date', () => {
    expect(parseWareki('令和8年2月30日')).toMatchObject({ ok: false, error: 'invalid_date' });
  });

  it('1873年より前になる入力は before_gregorian_adoption', () => {
    expect(parseWareki('明治元年10月23日')).toMatchObject({
      ok: false,
      error: 'before_gregorian_adoption',
    });
    expect(parseWareki('明治5年')).toMatchObject({ ok: false, error: 'before_gregorian_adoption' });
  });

  it('解釈不能な入力は unparseable', () => {
    for (const input of ['そもそも日付でない', '2026-07-11', '令和', 'X8.7.11', '令和8年7月', '']) {
      expect(parseWareki(input), JSON.stringify(input)).toMatchObject({
        ok: false,
        error: 'unparseable',
      });
    }
  });
});
