import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadBinaryFixture, loadJsonFixture } from '@jp-opendata/testing';
import { parseEdinetCsvZip, type EdinetCsvRow } from '@jp-opendata/gov-clients';
import { parseJpNumber } from '@jp-opendata/normalize-jp';
import { FIELD_CANDIDATES, STATEMENT_KEYS, type StatementKey } from '../src/statements.js';

/**
 * N6-2 整合テスト: golden内の**全非null財務値**について、element_mapの要素IDが
 * fixture CSV内に実在し、単位正規化後の値が一致することを機械検証する（FR6-8の検算可能性を
 * CIで担保する。golden・element_map・fixtureの三点が常に整合していることの回帰）。
 */

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, '..', '..', '..', 'packages', 'gov-clients', 'fixtures', 'edinet');
const goldenDir = join(here, 'golden');

const MULTIPLIER: Record<string, number> = { 円: 1, 千円: 1_000, 百万円: 1_000_000 };

interface GoldenItem {
  doc_id: string;
  basis: 'consolidated' | 'non_consolidated' | null;
  element_map: Record<string, string>;
  balance_sheet: Record<string, number | null>;
  income_statement: Record<string, number | null>;
  cash_flow: Record<string, number | null>;
  prior_year: Record<StatementKey, Record<string, number | null>>;
  coverage: { mapped_fields: number; target_fields: number };
}

function contextIdFor(
  item: GoldenItem,
  statement: StatementKey,
  field: string,
  prior: boolean,
): string {
  const timing =
    statement === 'balance_sheet' || field === 'cash_and_cash_equivalents_end'
      ? 'Instant'
      : 'Duration';
  const year = prior ? 'Prior1Year' : 'CurrentYear';
  const suffix = item.basis === 'non_consolidated' ? '_NonConsolidatedMember' : '';
  return `${year}${timing}${suffix}`;
}

function goldenValue(
  item: GoldenItem,
  statement: StatementKey,
  field: string,
  prior: boolean,
): number | null {
  return prior ? (item.prior_year[statement][field] ?? null) : (item[statement][field] ?? null);
}

describe('N6-2: element_mapとfixture CSVの値整合', () => {
  const items = loadJsonFixture<GoldenItem[]>(goldenDir, 'run.doc-ids.json');

  it('goldenの全アイテム・全非null値が、採用要素IDのfixture実値と一致する', () => {
    expect(items.length).toBeGreaterThanOrEqual(2); // N6-1: 2系統以上
    let verified = 0;
    for (const item of items) {
      const rows: EdinetCsvRow[] = parseEdinetCsvZip(
        loadBinaryFixture(fixturesDir, `document.${item.doc_id}.csv.statements.zip`),
      );
      for (const statement of STATEMENT_KEYS) {
        for (const field of Object.keys(FIELD_CANDIDATES[statement])) {
          for (const prior of [false, true]) {
            const value = goldenValue(item, statement, field, prior);
            const mapKey = `${prior ? 'prior_year.' : ''}${statement}.${field}`;
            const elementId = item.element_map[mapKey];
            if (value === null) {
              // 非nullの値には必ずelement_mapがあり、null値には無い（対応の完全性）
              expect(elementId, mapKey).toBeUndefined();
              continue;
            }
            expect(elementId, `element_map missing for ${item.doc_id} ${mapKey}`).toBeDefined();
            const contextId = contextIdFor(item, statement, field, prior);
            const row = rows.find((r) => r.elementId === elementId && r.contextId === contextId);
            expect(row, `${item.doc_id}: ${elementId} @ ${contextId} not in fixture`).toBeDefined();
            if (row === undefined) continue;
            const multiplier = MULTIPLIER[row.unit];
            expect(multiplier, `${item.doc_id}: unexpected unit ${row.unit}`).toBeDefined();
            const parsed = parseJpNumber(row.value);
            expect(parsed, `${item.doc_id}: non-numeric value for ${elementId}`).not.toBeNull();
            if (parsed === null || multiplier === undefined) continue;
            expect(parsed * multiplier, `${item.doc_id} ${mapKey}`).toBe(value);
            verified++;
          }
        }
      }
      // coverageの当期基準カウントが実際の非null当期フィールド数と一致する
      const mapped = STATEMENT_KEYS.reduce(
        (n, s) => n + Object.keys(FIELD_CANDIDATES[s]).filter((f) => item[s][f] !== null).length,
        0,
      );
      expect(item.coverage.mapped_fields).toBe(mapped);
    }
    // 4系統合計の検証点数（当期26+27+26+17＋前期分）が十分あることの下限チェック
    expect(verified).toBeGreaterThan(150);
  });
});
