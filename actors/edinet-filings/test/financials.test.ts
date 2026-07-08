import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadBinaryFixture } from '@jp-opendata/testing';
import { parseEdinetCsvZip } from '@jp-opendata/gov-clients';
import { extractFinancials } from '../src/financials.js';

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'packages',
  'gov-clients',
  'fixtures',
  'edinet',
);

describe('extractFinancials（実採取CSV）', () => {
  it('個別提出者（山口放送・JGAAP）: 個別基礎で7項目中6項目を抽出', () => {
    const rows = parseEdinetCsvZip(
      loadBinaryFixture(fixturesDir, 'document.S100YIZC.csv.trimmed.zip'),
    );
    expect(extractFinancials(rows)).toEqual({
      net_sales: 4_928_920_000,
      operating_income: 60_234_000, // サマリに営業利益なし → jppfs_cor:OperatingIncome（損益計算書）から
      ordinary_income: 126_441_000,
      net_income: 100_436_000, // 個別はNetIncomeLossSummaryOfBusinessResults
      total_assets: 13_533_976_000,
      net_assets: 11_726_214_000,
      number_of_employees: 120,
      financials_basis: 'non_consolidated',
    });
  });

  it('連結提出者（MS&AD・保険/IFRS併記）: 連結基礎で統一し、個別値やセグメント値を混ぜない', () => {
    const rows = parseEdinetCsvZip(
      loadBinaryFixture(fixturesDir, 'document.S100YNCJ.csv.trimmed.zip'),
    );
    const fin = extractFinancials(rows);
    expect(fin.financials_basis).toBe('consolidated');
    // 保険業は売上高系の要素なし → null（経常収益を売上高と偽らない）
    expect(fin.net_sales).toBeNull();
    expect(fin.ordinary_income).toBe(1_120_230_000_000);
    // JGAAP・IFRS併記の場合は候補順でJGAAP優先
    expect(fin.net_income).toBe(787_339_000_000);
    expect(fin.total_assets).toBe(28_640_815_000_000);
    expect(fin.net_assets).toBe(4_825_140_000_000);
    // 連結全体の従業員数（個別478やセグメント別の値を拾わない）
    expect(fin.number_of_employees).toBe(46_856);
  });

  it('該当行なしなら全null・basisもnull', () => {
    expect(extractFinancials([])).toEqual({
      net_sales: null,
      operating_income: null,
      ordinary_income: null,
      net_income: null,
      total_assets: null,
      net_assets: null,
      number_of_employees: null,
      financials_basis: null,
    });
  });
});
