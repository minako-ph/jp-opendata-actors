import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadBinaryFixture } from '@jp-opendata/testing';
import { parseEdinetCsvZip, type EdinetCsvRow } from '@jp-opendata/gov-clients';
import { TARGET_FIELDS, extractStatements } from '../src/statements.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, '..', '..', '..', 'packages', 'gov-clients', 'fixtures', 'edinet');

function fixtureRows(docId: string): EdinetCsvRow[] {
  return parseEdinetCsvZip(loadBinaryFixture(fixturesDir, `document.${docId}.csv.statements.zip`));
}

function row(overrides: Partial<EdinetCsvRow>): EdinetCsvRow {
  return {
    elementId: 'jppfs_cor:Assets',
    itemName: '資産',
    contextId: 'CurrentYearInstant',
    relativeFiscalYear: '当期末',
    consolidatedOrNot: '連結',
    periodOrInstant: '時点',
    unitId: 'JPY',
    unit: '円',
    value: '1000',
    ...overrides,
  };
}

describe('extractStatements（fixture 4系統・実応答）', () => {
  it('JGAAP個別（山口放送）: 個別基礎・当期＋前期・element_map', () => {
    const result = extractStatements(fixtureRows('S100YIZC'));
    expect(result.basis).toBe('non_consolidated');
    expect(result.accounting_standard).toBe('jgaap');
    expect(result.current.balance_sheet.total_assets).toBe(13_533_976_000);
    expect(result.current.income_statement.net_sales).toBe(4_928_920_000);
    expect(result.current.income_statement.ordinary_income).toBe(126_441_000);
    expect(result.current.cash_flow.cash_and_cash_equivalents_end).toBe(3_036_506_000);
    // 個別のみの提出者は親会社株主帰属・親会社所有者持分ともnull
    expect(result.current.income_statement.net_income_attributable_to_owners_of_parent).toBeNull();
    expect(result.current.balance_sheet.equity_attributable_to_owners_of_parent).toBeNull();
    // 前期値（FR6-5）は当期と同じ基礎のPrior1Year文脈から
    expect(result.prior_year.balance_sheet.total_assets).toBeGreaterThan(0);
    expect(result.prior_year.income_statement.net_sales).toBeGreaterThan(0);
    expect(result.element_map['balance_sheet.total_assets']).toBe('jppfs_cor:Assets');
    expect(result.element_map['prior_year.balance_sheet.total_assets']).toBe('jppfs_cor:Assets');
    expect(result.coverage).toEqual({ mapped_fields: 26, target_fields: TARGET_FIELDS });
  });

  it('JGAAP連結（ネポン）: 連結値を採用し個別値を混在させない', () => {
    const result = extractStatements(fixtureRows('S100YN9E'));
    expect(result.basis).toBe('consolidated');
    expect(result.accounting_standard).toBe('jgaap');
    // 連結PL（個別は7,347,435,000円＝採用しないことの回帰）
    expect(result.current.income_statement.net_sales).toBe(7_417_643_000);
    expect(result.current.income_statement.net_income_attributable_to_owners_of_parent).toBe(
      37_737_000,
    );
    expect(result.current.balance_sheet.total_assets).toBe(5_887_660_000);
    expect(result.coverage.mapped_fields).toBe(27);
  });

  it('IFRS標準（コンヴァノ）: jpigp系候補で28中26フィールド成立', () => {
    const result = extractStatements(fixtureRows('S100YN95'));
    expect(result.basis).toBe('consolidated');
    expect(result.accounting_standard).toBe('ifrs');
    expect(result.current.income_statement.net_sales).toBe(15_517_066_000);
    expect(result.current.income_statement.operating_income).toBe(1_600_773_000);
    // タクソノミ側の綴りがLabilitiesの実在要素（研究文書参照）
    expect(result.current.balance_sheet.non_current_liabilities).toBe(522_697_000);
    expect(result.element_map['balance_sheet.non_current_liabilities']).toBe(
      'jpigp_cor:NonCurrentLabilitiesIFRS',
    );
    // JGAAP概念はIFRSでnull（仕様どおり）
    expect(result.current.income_statement.ordinary_income).toBeNull();
    expect(result.current.balance_sheet.investments_and_other_assets).toBeNull();
    expect(result.coverage.mapped_fields).toBe(26);
  });

  it('IFRS保険（MS&AD）: 特殊様式の未対応項目はnullに落ちる（安全側）', () => {
    const result = extractStatements(fixtureRows('S100YNCJ'));
    expect(result.basis).toBe('consolidated');
    expect(result.accounting_standard).toBe('ifrs');
    // 無区分BS・保険収益様式のPL上段はnull
    expect(result.current.balance_sheet.current_assets).toBeNull();
    expect(result.current.income_statement.net_sales).toBeNull();
    expect(result.current.income_statement.gross_profit).toBeNull();
    // 取れる項目は取る
    expect(result.current.income_statement.income_before_income_taxes).toBe(703_521_000_000);
    expect(result.current.balance_sheet.total_assets).toBe(29_592_153_000_000);
    expect(result.current.cash_flow.net_cash_provided_by_operating_activities).toBe(
      954_001_000_000,
    );
    expect(result.coverage.mapped_fields).toBe(17);
  });
});

describe('extractStatements（合成行・境界）', () => {
  it('単位正規化: 千円/百万円はJPY生値へ・未知単位はnull（安全側）', () => {
    const result = extractStatements([
      row({ elementId: 'jppfs_cor:Assets', unit: '千円', value: '1,234' }),
      row({
        elementId: 'jppfs_cor:NetSales',
        contextId: 'CurrentYearDuration',
        unit: '百万円',
        value: '5',
      }),
      row({
        elementId: 'jppfs_cor:CapitalStock',
        unit: '米ドル',
        value: '999',
      }),
    ]);
    expect(result.current.balance_sheet.total_assets).toBe(1_234_000);
    expect(result.current.income_statement.net_sales).toBe(5_000_000);
    expect(result.current.balance_sheet.share_capital).toBeNull();
  });

  it('基礎の混在禁止: 連結値がひとつでもあれば個別値は採用しない', () => {
    const result = extractStatements([
      row({ elementId: 'jppfs_cor:Assets', contextId: 'CurrentYearInstant', value: '100' }),
      row({
        elementId: 'jppfs_cor:NetSales',
        contextId: 'CurrentYearDuration_NonConsolidatedMember',
        value: '200',
      }),
    ]);
    expect(result.basis).toBe('consolidated');
    expect(result.current.balance_sheet.total_assets).toBe(100);
    expect(result.current.income_statement.net_sales).toBeNull();
  });

  it('Member付きセグメント文脈・対象外contextは完全一致で除外する', () => {
    const result = extractStatements([
      row({ contextId: 'CurrentYearInstant_ReportableSegmentsMember', value: '100' }),
      row({ contextId: 'Prior2YearInstant', value: '200' }),
    ]);
    expect(result.basis).toBeNull();
    expect(result.current.balance_sheet.total_assets).toBeNull();
    expect(result.coverage.mapped_fields).toBe(0);
  });

  it('前期のみの行では基礎を決めない（当期値ゼロ件は空の抽出結果）', () => {
    const result = extractStatements([row({ contextId: 'Prior1YearInstant', value: '100' })]);
    expect(result.basis).toBeNull();
    expect(result.prior_year.balance_sheet.total_assets).toBeNull();
  });

  it('値なし「－」・空CSVはnull／空の抽出結果', () => {
    expect(extractStatements([]).basis).toBeNull();
    const result = extractStatements([row({ value: '－' })]);
    expect(result.basis).toBeNull();
  });
});
