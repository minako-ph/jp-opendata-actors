import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadJsonFixture } from '@jp-opendata/testing';
import { xit001ResponseSchema, type ReinfolibTransaction } from '@jp-opendata/gov-clients';
import { parseBuildingYear, parsePeriod, toNumber, toTransactionItem } from '../src/transform.js';

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'packages',
  'gov-clients',
  'fixtures',
  'reinfolib',
);

function fixtureRecords(name: string): ReinfolibTransaction[] {
  return xit001ResponseSchema.parse(loadJsonFixture(fixturesDir, name)).data ?? [];
}

const CTX = {
  sourceUrl:
    'https://www.reinfolib.mlit.go.jp/ex-api/external/XIT001?year=2024&area=13&city=13101&language=en',
  retrievedAt: '2026-07-09T00:00:00+09:00',
};

describe('toNumber / parseBuildingYear / parsePeriod', () => {
  it('空文字・区分値はnull（丸め値からの推測禁止）', () => {
    expect(toNumber('')).toBeNull();
    expect(toNumber('2,000㎡以上')).toBeNull();
    expect(toNumber('50.0m以上')).toBeNull();
    expect(toNumber('580')).toBe(580);
    expect(toNumber('21.5')).toBe(21.5);
  });
  it('BuildingYearは西暦YYYY(年)のみ数値化。「戦前」等はnull', () => {
    expect(parseBuildingYear('1991年')).toBe(1991);
    expect(parseBuildingYear('1991')).toBe(1991);
    expect(parseBuildingYear('戦前')).toBeNull();
    expect(parseBuildingYear('')).toBeNull();
  });
  it('Periodからyear/quarterを解析（en優先・jaフォールバック）', () => {
    expect(parsePeriod('1st quarter 2024', null)).toEqual({ year: 2024, quarter: 1 });
    expect(parsePeriod('不明', '2024年第3四半期')).toEqual({ year: 2024, quarter: 3 });
    expect(parsePeriod('unknown', null)).toEqual({ year: null, quarter: null });
  });
});

describe('toTransactionItem（実採取fixture）', () => {
  const en = fixtureRecords('XIT001.13101-2024.en.json');
  const ja = fixtureRecords('XIT001.13101-2024.ja.json');

  it('en正・ja併記・派生指標（rule）・共通メタを持つ', () => {
    const first = en[0];
    const firstJa = ja[0];
    if (first === undefined || firstJa === undefined) throw new Error('fixture missing');
    const item = toTransactionItem(first, firstJa, CTX);
    expect(item).toMatchObject({
      record_type: 'transaction',
      price_category: 'Contract Price Information',
      price_category_ja: '成約価格情報',
      prefecture: 'Tokyo',
      prefecture_ja: '東京都',
      prefecture_code: '13',
      municipality_code: '13101',
      trade_price: 140_000_000,
      area_sqm: 90,
      building_year: 1991,
      building_year_ja: '1991年',
      transaction_year: 2024,
      transaction_quarter: 1,
      source: 'reinfolib',
      attribution:
        'このサービスは、国土交通省不動産情報ライブラリのAPI機能を使用していますが、提供情報の最新性、正確性、完全性等が保証されたものではありません。',
    });
    // 派生: 140,000,000 / 90 = 1,555,555.55… → 1,555,556（rule・confidence1）
    expect(item.unit_price_per_sqm).toEqual({ value: 1_555_556, confidence: 1, method: 'rule' });
    expect(item.building_age_at_transaction).toEqual({ value: 33, confidence: 1, method: 'rule' });
  });

  it('土地レコード: 建築年なし→building_age null・報告㎡単価と派生㎡単価は別フィールド', () => {
    const land = en[3];
    const landJa = ja[3];
    if (land === undefined || landJa === undefined) throw new Error('fixture missing');
    const item = toTransactionItem(land, landJa, CTX);
    expect(item.building_year).toBeNull();
    expect(item.building_age_at_transaction.value).toBeNull();
    expect(item.reported_unit_price_per_sqm).toBe(6_500_000);
    // 派生は生値から: 3,800,000,000 / 580 = 6,551,724.1… → 6,551,724
    expect(item.unit_price_per_sqm.value).toBe(6_551_724);
    expect(item.structure).toBeNull(); // 空文字→null
  });

  it('ja=null（結合不一致）なら*_jaはすべてnull', () => {
    const first = en[0];
    if (first === undefined) throw new Error('fixture missing');
    const item = toTransactionItem(first, null, CTX);
    expect(item.prefecture_ja).toBeNull();
    expect(item.price_category_ja).toBeNull();
    expect(item.prefecture).toBe('Tokyo');
  });
});
