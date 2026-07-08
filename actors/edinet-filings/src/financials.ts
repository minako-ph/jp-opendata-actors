import type { EdinetCsvRow } from '@jp-opendata/gov-clients';
import { parseJpNumber } from '@jp-opendata/normalize-jp';

/**
 * EDINET CSV(type=5)の「主要な経営指標等」から主要財務値を抽出する（FR-1 basic）。
 * v1スコープ: XBRLフルパースは行わず、CSV出力から取れる範囲に限定（要件書FR-1）。
 * 原文に無い項目はnull（推測禁止 N-9②）。
 *
 * 実データ検証（2026-07-08, S100YIZC個別/S100YNCJ連結IFRS）で確定した仕様:
 * - 連結/個別は「連結・個別」列では判定できない（サマリ行は「その他」）。
 *   contextIdの完全一致で判定する: CurrentYearDuration/Instant=連結、
 *   同_NonConsolidatedMember=個別。セグメント等のMember付きcontextは完全一致で除外される。
 * - 時点項目（総資産・純資産・従業員数）の相対年度は「当期末」（当期ではない）。
 * - 要素IDは会計基準・業種で揺れる（IFRSは*IFRS*、保険は売上高系なし等）→候補リスト方式。
 * - 基礎の混在を避けるため、連結値が1つでもあれば連結のみ、無ければ個別のみを採用する。
 */

export interface FilingFinancials extends Record<string, unknown> {
  net_sales: number | null;
  operating_income: number | null;
  ordinary_income: number | null;
  net_income: number | null;
  total_assets: number | null;
  net_assets: number | null;
  number_of_employees: number | null;
  /** 採用した値の基礎: consolidated(連結) / non_consolidated(個別)。どの値も取れなければnull */
  financials_basis: 'consolidated' | 'non_consolidated' | null;
}

type Basis = 'consolidated' | 'non_consolidated';
type NumericField = Exclude<keyof FilingFinancials, 'financials_basis'>;

/** 当期のcontextId（完全一致のみ採用。Member付きセグメント文脈を除外するため） */
const CONTEXT_BASIS: Record<string, Basis> = {
  CurrentYearDuration: 'consolidated',
  CurrentYearInstant: 'consolidated',
  CurrentYearDuration_NonConsolidatedMember: 'non_consolidated',
  CurrentYearInstant_NonConsolidatedMember: 'non_consolidated',
};

interface FieldSpec {
  /** 優先順の要素ID候補。最初に値が取れた候補を採用 */
  candidates: string[];
  kind: 'monetary' | 'count';
}

// TODO: 候補は実CSV 2件（JGAAP個別・IFRS連結保険）での検証に基づく。業種別様式
// （銀行・証券等の営業収益系）はカバレッジ拡大時に追加する。未知の様式はnullに落ちる（安全側）。
const FIELD_SPECS: Record<NumericField, FieldSpec> = {
  net_sales: {
    candidates: [
      'jpcrp_cor:NetSalesSummaryOfBusinessResults',
      'jpcrp_cor:RevenueIFRSSummaryOfBusinessResults',
      'jpcrp_cor:OperatingRevenue1SummaryOfBusinessResults',
    ],
    kind: 'monetary',
  },
  operating_income: {
    candidates: [
      'jpcrp_cor:OperatingIncomeLossSummaryOfBusinessResults',
      'jpcrp_cor:OperatingProfitLossIFRSSummaryOfBusinessResults',
      'jppfs_cor:OperatingIncome',
    ],
    kind: 'monetary',
  },
  ordinary_income: {
    candidates: ['jpcrp_cor:OrdinaryIncomeLossSummaryOfBusinessResults'],
    kind: 'monetary',
  },
  net_income: {
    candidates: [
      'jpcrp_cor:ProfitLossAttributableToOwnersOfParentSummaryOfBusinessResults',
      'jpcrp_cor:ProfitLossAttributableToOwnersOfParentIFRSSummaryOfBusinessResults',
      'jpcrp_cor:NetIncomeLossSummaryOfBusinessResults',
    ],
    kind: 'monetary',
  },
  total_assets: {
    candidates: [
      'jpcrp_cor:TotalAssetsSummaryOfBusinessResults',
      'jpcrp_cor:TotalAssetsIFRSSummaryOfBusinessResults',
    ],
    kind: 'monetary',
  },
  net_assets: {
    candidates: [
      'jpcrp_cor:NetAssetsSummaryOfBusinessResults',
      'jpcrp_cor:TotalEquityIFRSSummaryOfBusinessResults',
      'jpcrp_cor:EquityAttributableToOwnersOfParentIFRSSummaryOfBusinessResults',
    ],
    kind: 'monetary',
  },
  number_of_employees: {
    candidates: ['jpcrp_cor:NumberOfEmployees'],
    kind: 'count',
  },
};

/** 円系単位はJPY生値へ正規化。人数系は単位列が空のことがある（実データ確認済み） */
const MONETARY_MULTIPLIER: Record<string, number> = {
  円: 1,
  千円: 1_000,
  百万円: 1_000_000,
};
const COUNT_UNITS = new Set(['', '人', '名', '－', 'pure']);

function toNumber(row: EdinetCsvRow, kind: FieldSpec['kind']): number | null {
  if (kind === 'monetary') {
    const multiplier = MONETARY_MULTIPLIER[row.unit];
    if (multiplier === undefined) return null;
    const value = parseJpNumber(row.value);
    return value === null ? null : value * multiplier;
  }
  if (!COUNT_UNITS.has(row.unit)) return null;
  return parseJpNumber(row.value);
}

export function emptyFinancials(): FilingFinancials {
  return {
    net_sales: null,
    operating_income: null,
    ordinary_income: null,
    net_income: null,
    total_assets: null,
    net_assets: null,
    number_of_employees: null,
    financials_basis: null,
  };
}

export function extractFinancials(rows: EdinetCsvRow[]): FilingFinancials {
  const result = emptyFinancials();

  // 当期・完全一致contextの行だけを field候補ID → basis → 値 で索引する
  const values = new Map<string, Partial<Record<Basis, number>>>();
  const candidateKind = new Map<string, FieldSpec['kind']>();
  for (const spec of Object.values(FIELD_SPECS)) {
    for (const id of spec.candidates) candidateKind.set(id, spec.kind);
  }

  let hasConsolidated = false;
  let hasNonConsolidated = false;
  for (const row of rows) {
    const basis = CONTEXT_BASIS[row.contextId];
    if (basis === undefined) continue;
    const kind = candidateKind.get(row.elementId);
    if (kind === undefined) continue;
    const value = toNumber(row, kind);
    if (value === null) continue;

    const byBasis = values.get(row.elementId) ?? {};
    byBasis[basis] = value;
    values.set(row.elementId, byBasis);
    if (basis === 'consolidated') hasConsolidated = true;
    else hasNonConsolidated = true;
  }

  // 基礎の混在を避ける: 連結値がひとつでもあれば連結で統一、無ければ個別
  const basis: Basis | null = hasConsolidated
    ? 'consolidated'
    : hasNonConsolidated
      ? 'non_consolidated'
      : null;
  if (basis === null) return result;

  const fields: NumericField[] = [
    'net_sales',
    'operating_income',
    'ordinary_income',
    'net_income',
    'total_assets',
    'net_assets',
    'number_of_employees',
  ];
  for (const field of fields) {
    const spec = FIELD_SPECS[field];
    if (spec === undefined) continue;
    for (const id of spec.candidates) {
      const value = values.get(id)?.[basis];
      if (value !== undefined) {
        result[field] = value;
        break;
      }
    }
  }
  result.financials_basis = basis;
  return result;
}
