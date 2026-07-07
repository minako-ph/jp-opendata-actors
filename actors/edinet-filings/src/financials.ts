import type { EdinetCsvRow } from '@jp-opendata/gov-clients';
import { parseJpNumber } from '@jp-opendata/normalize-jp';

/**
 * EDINET CSV(type=5)の「主要な経営指標等」から主要財務値を抽出する（FR-1 basic）。
 * v1スコープ: XBRLフルパースは行わず、CSV出力から取れる範囲に限定（要件書FR-1）。
 * 原文に無い項目はnull（推測禁止 N-9②）。当期・連結を優先し、連結が無ければ個別を使う。
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

type NumericField = Exclude<keyof FilingFinancials, 'financials_basis'>;

// TODO: 要素IDは実CSV採取後に網羅を検証する（特に営業利益は業種別様式で揺れる。未取得ならnullになる）
const ELEMENT_TO_FIELD: Record<string, NumericField> = {
  'jpcrp_cor:NetSalesSummaryOfBusinessResults': 'net_sales',
  'jpcrp_cor:OperatingIncomeLossSummaryOfBusinessResults': 'operating_income',
  'jpcrp_cor:OrdinaryIncomeLossSummaryOfBusinessResults': 'ordinary_income',
  'jpcrp_cor:ProfitLossAttributableToOwnersOfParentSummaryOfBusinessResults': 'net_income',
  'jpcrp_cor:TotalAssetsSummaryOfBusinessResults': 'total_assets',
  'jpcrp_cor:NetAssetsSummaryOfBusinessResults': 'net_assets',
  'jpcrp_cor:NumberOfEmployees': 'number_of_employees',
};

/** 単位正規化: 円系はJPYの生値へ、人・pureはそのまま。未知の単位は採用しない（推測禁止） */
const UNIT_MULTIPLIER: Record<string, number> = {
  円: 1,
  千円: 1_000,
  百万円: 1_000_000,
  人: 1,
  '－': 1,
  pure: 1,
};

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
  const pickedBasis: Partial<Record<NumericField, 'consolidated' | 'non_consolidated'>> = {};

  for (const row of rows) {
    const field = ELEMENT_TO_FIELD[row.elementId];
    if (field === undefined) continue;
    if (row.relativeFiscalYear !== '当期') continue;

    const basis =
      row.consolidatedOrNot === '連結'
        ? 'consolidated'
        : row.consolidatedOrNot === '個別'
          ? 'non_consolidated'
          : null;
    if (basis === null) continue;

    // 連結を優先。既に連結値を採用済みのフィールドは個別で上書きしない
    if (pickedBasis[field] === 'consolidated') continue;
    if (pickedBasis[field] === 'non_consolidated' && basis === 'non_consolidated') continue;

    const multiplier = UNIT_MULTIPLIER[row.unit];
    if (multiplier === undefined) continue;
    const numeric = parseJpNumber(row.value);
    if (numeric === null) continue;

    result[field] = numeric * multiplier;
    pickedBasis[field] = basis;
  }

  const bases = Object.values(pickedBasis);
  result.financials_basis = bases.includes('consolidated')
    ? 'consolidated'
    : bases.includes('non_consolidated')
      ? 'non_consolidated'
      : null;
  return result;
}
