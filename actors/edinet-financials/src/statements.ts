import type { EdinetCsvRow } from '@jp-opendata/gov-clients';
import { parseJpNumber } from '@jp-opendata/normalize-jp';

/**
 * EDINET CSV(type=5)の財務諸表本表行から BS/PL/CF の主要科目を抽出する（FR6-4/5/6/7/8）。
 *
 * 実データ検証（2026-07-11, fixture4系統: JGAAP個別/JGAAP連結/IFRS標準/IFRS保険。
 * docs/research/edinet-financial-statements.md）で確定した仕様:
 * - 当期・前期ともcontextIdの**完全一致**で採用（持分変動内訳・セグメント等のMember付き
 *   contextを除外する。#1 financials.tsのCONTEXT_BASIS方式の拡張形）
 * - 科目マッピングは決定的な候補リスト方式のみ。候補IDは**fixtureで実在確認できた要素のみ**
 *   登録する（FR6-7-2: 推測登録禁止）。マッピング外・未知様式はnull（安全側）
 * - 基礎の混在禁止: 当期に連結値が1つでもあれば連結のみ、無ければ個別のみ。前期も同じ基礎
 * - 会計基準は採用行のタクソノミ系から導出（jpigp→ifrs / jppfs→jgaap）。値ゼロ件は
 *   呼び出し側でDEIの会計基準表記から補完する（FR6-6）
 * - 検算可能性（FR6-8）: 非nullの各値について採用要素IDを element_map に併記する
 */

export type Basis = 'consolidated' | 'non_consolidated';
export type AccountingStandard = 'jgaap' | 'ifrs';
type Period = 'current' | 'prior';

export interface BalanceSheet extends Record<string, number | null> {
  cash_and_deposits: number | null;
  current_assets: number | null;
  property_plant_and_equipment: number | null;
  intangible_assets: number | null;
  investments_and_other_assets: number | null;
  non_current_assets: number | null;
  total_assets: number | null;
  current_liabilities: number | null;
  non_current_liabilities: number | null;
  total_liabilities: number | null;
  share_capital: number | null;
  retained_earnings: number | null;
  equity_attributable_to_owners_of_parent: number | null;
  net_assets: number | null;
}

export interface IncomeStatement extends Record<string, number | null> {
  net_sales: number | null;
  cost_of_sales: number | null;
  gross_profit: number | null;
  selling_general_and_administrative_expenses: number | null;
  operating_income: number | null;
  ordinary_income: number | null;
  income_before_income_taxes: number | null;
  income_taxes: number | null;
  net_income: number | null;
  net_income_attributable_to_owners_of_parent: number | null;
}

export interface CashFlow extends Record<string, number | null> {
  net_cash_provided_by_operating_activities: number | null;
  net_cash_provided_by_investing_activities: number | null;
  net_cash_provided_by_financing_activities: number | null;
  cash_and_cash_equivalents_end: number | null;
}

export interface FinancialStatements {
  balance_sheet: BalanceSheet;
  income_statement: IncomeStatement;
  cash_flow: CashFlow;
}

export interface StatementsExtract {
  basis: Basis | null;
  /** 採用行のタクソノミ系由来。値ゼロ件はnull（呼び出し側でDEI補完） */
  accounting_standard: AccountingStandard | null;
  current: FinancialStatements;
  prior_year: FinancialStatements;
  /** 非null値の採用要素ID（例: "balance_sheet.total_assets" → "jppfs_cor:Assets"） */
  element_map: Record<string, string>;
  /** 当期基準のマッピング成立状況（FR6-8） */
  coverage: { mapped_fields: number; target_fields: number };
}

/** 当期・前期のcontextId完全一致表（Member付きセグメント・持分変動内訳contextを除外） */
const CONTEXT_TABLE: Record<string, { basis: Basis; period: Period }> = {
  CurrentYearInstant: { basis: 'consolidated', period: 'current' },
  CurrentYearDuration: { basis: 'consolidated', period: 'current' },
  CurrentYearInstant_NonConsolidatedMember: { basis: 'non_consolidated', period: 'current' },
  CurrentYearDuration_NonConsolidatedMember: { basis: 'non_consolidated', period: 'current' },
  Prior1YearInstant: { basis: 'consolidated', period: 'prior' },
  Prior1YearDuration: { basis: 'consolidated', period: 'prior' },
  Prior1YearInstant_NonConsolidatedMember: { basis: 'non_consolidated', period: 'prior' },
  Prior1YearDuration_NonConsolidatedMember: { basis: 'non_consolidated', period: 'prior' },
};

export type StatementKey = 'balance_sheet' | 'income_statement' | 'cash_flow';

/**
 * FR6-4の28フィールド × 優先順の候補要素ID。全IDはfixture 4系統での実在確認済み
 * （docs/research/edinet-financial-statements.md のマッピング表と1対1。推測登録禁止）。
 * - investments_and_other_assets / ordinary_income はJGAAP概念のためjppfsのみ（IFRSはnull）
 * - equity_attributable_to_owners_of_parent はIFRSのみ（JGAAPの株主資本はその他の包括利益
 *   累計額を含まず意味が異なるため登録しない）
 * - jpigp_cor:NonCurrentLabilitiesIFRS はタクソノミ側の綴り（実在確認済み）
 */
export const FIELD_CANDIDATES: Record<StatementKey, Record<string, string[]>> = {
  balance_sheet: {
    cash_and_deposits: ['jppfs_cor:CashAndDeposits', 'jpigp_cor:CashAndCashEquivalentsIFRS'],
    current_assets: ['jppfs_cor:CurrentAssets', 'jpigp_cor:CurrentAssetsIFRS'],
    property_plant_and_equipment: [
      'jppfs_cor:PropertyPlantAndEquipment',
      'jpigp_cor:PropertyPlantAndEquipmentIFRS',
    ],
    intangible_assets: ['jppfs_cor:IntangibleAssets', 'jpigp_cor:IntangibleAssetsIFRS'],
    investments_and_other_assets: ['jppfs_cor:InvestmentsAndOtherAssets'],
    non_current_assets: ['jppfs_cor:NoncurrentAssets', 'jpigp_cor:NonCurrentAssetsIFRS'],
    total_assets: ['jppfs_cor:Assets', 'jpigp_cor:AssetsIFRS'],
    current_liabilities: ['jppfs_cor:CurrentLiabilities', 'jpigp_cor:TotalCurrentLiabilitiesIFRS'],
    non_current_liabilities: [
      'jppfs_cor:NoncurrentLiabilities',
      'jpigp_cor:NonCurrentLabilitiesIFRS',
    ],
    total_liabilities: ['jppfs_cor:Liabilities', 'jpigp_cor:LiabilitiesIFRS'],
    share_capital: ['jppfs_cor:CapitalStock', 'jpigp_cor:ShareCapitalIFRS'],
    retained_earnings: ['jppfs_cor:RetainedEarnings', 'jpigp_cor:RetainedEarningsIFRS'],
    equity_attributable_to_owners_of_parent: ['jpigp_cor:EquityAttributableToOwnersOfParentIFRS'],
    net_assets: ['jppfs_cor:NetAssets', 'jpigp_cor:EquityIFRS'],
  },
  income_statement: {
    net_sales: ['jppfs_cor:NetSales', 'jppfs_cor:OperatingRevenue1', 'jpigp_cor:RevenueIFRS'],
    cost_of_sales: ['jppfs_cor:CostOfSales', 'jpigp_cor:CostOfSalesIFRS'],
    gross_profit: ['jppfs_cor:GrossProfit', 'jpigp_cor:GrossProfitIFRS'],
    selling_general_and_administrative_expenses: [
      'jppfs_cor:SellingGeneralAndAdministrativeExpenses',
      'jpigp_cor:SellingGeneralAndAdministrativeExpensesIFRS',
    ],
    operating_income: ['jppfs_cor:OperatingIncome', 'jpigp_cor:OperatingProfitLossIFRS'],
    ordinary_income: ['jppfs_cor:OrdinaryIncome'],
    income_before_income_taxes: [
      'jppfs_cor:IncomeBeforeIncomeTaxes',
      'jpigp_cor:ProfitLossBeforeTaxIFRS',
    ],
    income_taxes: ['jppfs_cor:IncomeTaxes', 'jpigp_cor:IncomeTaxExpenseIFRS'],
    net_income: ['jppfs_cor:ProfitLoss', 'jpigp_cor:ProfitLossIFRS'],
    net_income_attributable_to_owners_of_parent: [
      'jppfs_cor:ProfitLossAttributableToOwnersOfParent',
      'jpigp_cor:ProfitLossAttributableToOwnersOfParentIFRS',
    ],
  },
  cash_flow: {
    net_cash_provided_by_operating_activities: [
      'jppfs_cor:NetCashProvidedByUsedInOperatingActivities',
      'jpigp_cor:NetCashProvidedByUsedInOperatingActivitiesIFRS',
    ],
    net_cash_provided_by_investing_activities: [
      'jppfs_cor:NetCashProvidedByUsedInInvestmentActivities',
      'jpigp_cor:NetCashProvidedByUsedInInvestingActivitiesIFRS',
    ],
    net_cash_provided_by_financing_activities: [
      'jppfs_cor:NetCashProvidedByUsedInFinancingActivities',
      'jpigp_cor:NetCashProvidedByUsedInFinancingActivitiesIFRS',
    ],
    cash_and_cash_equivalents_end: [
      'jppfs_cor:CashAndCashEquivalents',
      'jpigp_cor:CashAndCashEquivalentsIFRS',
    ],
  },
};

/** 3表のキー（Object.keysの型が失われるため定数で列挙。テストのループにも使う） */
export const STATEMENT_KEYS: readonly StatementKey[] = [
  'balance_sheet',
  'income_statement',
  'cash_flow',
];

export const TARGET_FIELDS = Object.values(FIELD_CANDIDATES).reduce(
  (n, fields) => n + Object.keys(fields).length,
  0,
);

/** 円系単位はJPY生値へ正規化（#1と同一規約）。円以外の単位はnull（安全側） */
const MONETARY_MULTIPLIER: Record<string, number> = {
  円: 1,
  千円: 1_000,
  百万円: 1_000_000,
};

function toJpy(row: EdinetCsvRow): number | null {
  const multiplier = MONETARY_MULTIPLIER[row.unit];
  if (multiplier === undefined) return null;
  const value = parseJpNumber(row.value);
  return value === null ? null : value * multiplier;
}

function emptyStatements(): FinancialStatements {
  return {
    balance_sheet: {
      cash_and_deposits: null,
      current_assets: null,
      property_plant_and_equipment: null,
      intangible_assets: null,
      investments_and_other_assets: null,
      non_current_assets: null,
      total_assets: null,
      current_liabilities: null,
      non_current_liabilities: null,
      total_liabilities: null,
      share_capital: null,
      retained_earnings: null,
      equity_attributable_to_owners_of_parent: null,
      net_assets: null,
    },
    income_statement: {
      net_sales: null,
      cost_of_sales: null,
      gross_profit: null,
      selling_general_and_administrative_expenses: null,
      operating_income: null,
      ordinary_income: null,
      income_before_income_taxes: null,
      income_taxes: null,
      net_income: null,
      net_income_attributable_to_owners_of_parent: null,
    },
    cash_flow: {
      net_cash_provided_by_operating_activities: null,
      net_cash_provided_by_investing_activities: null,
      net_cash_provided_by_financing_activities: null,
      cash_and_cash_equivalents_end: null,
    },
  };
}

export function emptyExtract(): StatementsExtract {
  return {
    basis: null,
    accounting_standard: null,
    current: emptyStatements(),
    prior_year: emptyStatements(),
    element_map: {},
    coverage: { mapped_fields: 0, target_fields: TARGET_FIELDS },
  };
}

export function extractStatements(rows: EdinetCsvRow[]): StatementsExtract {
  const result = emptyExtract();

  // 候補ID × 基礎 × 期の値索引（完全一致contextの行のみ）。同一(ID,context)の重複行は
  // 先勝ち（本表行が先・注記の再掲が後の実データ順。値は同一であることをfixtureで確認済み）
  const candidateIds = new Set<string>();
  for (const fields of Object.values(FIELD_CANDIDATES)) {
    for (const ids of Object.values(fields)) for (const id of ids) candidateIds.add(id);
  }
  const values = new Map<string, number>();
  let hasConsolidated = false;
  let hasNonConsolidated = false;
  for (const row of rows) {
    const context = CONTEXT_TABLE[row.contextId];
    if (context === undefined) continue;
    if (!candidateIds.has(row.elementId)) continue;
    const value = toJpy(row);
    if (value === null) continue;
    const key = `${row.elementId}|${context.basis}|${context.period}`;
    if (!values.has(key)) values.set(key, value);
    if (context.period === 'current') {
      if (context.basis === 'consolidated') hasConsolidated = true;
      else hasNonConsolidated = true;
    }
  }

  // 基礎の混在禁止: 当期に連結値がひとつでもあれば連結で統一、無ければ個別（FR6-6）
  const basis: Basis | null = hasConsolidated
    ? 'consolidated'
    : hasNonConsolidated
      ? 'non_consolidated'
      : null;
  if (basis === null) return result;
  result.basis = basis;

  let usedJpigp = false;
  let usedJppfs = false;
  const periods: Array<{ period: Period; target: FinancialStatements; mapPrefix: string }> = [
    { period: 'current', target: result.current, mapPrefix: '' },
    { period: 'prior', target: result.prior_year, mapPrefix: 'prior_year.' },
  ];
  for (const { period, target, mapPrefix } of periods) {
    for (const statement of STATEMENT_KEYS) {
      for (const [field, candidates] of Object.entries(FIELD_CANDIDATES[statement])) {
        for (const id of candidates) {
          const value = values.get(`${id}|${basis}|${period}`);
          if (value === undefined) continue;
          target[statement][field] = value;
          result.element_map[`${mapPrefix}${statement}.${field}`] = id;
          if (period === 'current') {
            result.coverage.mapped_fields++;
            if (id.startsWith('jpigp_cor:')) usedJpigp = true;
            if (id.startsWith('jppfs_cor:')) usedJppfs = true;
          }
          break;
        }
      }
    }
  }

  // 会計基準: 採用行のタクソノミ系から決定的に導出（jpigpが1つでもあればifrs。FR6-6）
  result.accounting_standard = usedJpigp ? 'ifrs' : usedJppfs ? 'jgaap' : null;
  return result;
}
