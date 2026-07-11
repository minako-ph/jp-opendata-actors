import { withCommonMeta, type CommonMeta } from '@jp-opendata/attribution';
import type { EdinetCsvRow } from '@jp-opendata/gov-clients';
import type { AccountingStandard, StatementsExtract } from './statements.js';

/**
 * DEI（提出者情報）抽出とfinancialsアイテム変換（FR6-3 / FR-C1 / FR-C2）。
 * FR6-3のメタは**すべてCSV内のjpdei_cor行から取得**（経路非依存。2026-07-11実データで
 * 全項目の実在を確認済み——docs/research/edinet-financial-statements.md 未決#4解消）。
 * 原文に無い項目はnull（推測補完禁止 N-9②）。
 */

export const FINANCIALS_SCHEMA_VERSION = '0.1.0';

/** 有報の様式（DocumentTypeDEIの値。実データで確認済み）。非有報docIDの安全弁に使う */
export const ANNUAL_REPORT_DOCUMENT_TYPE = '第三号様式';

const DEI = {
  edinetCode: 'jpdei_cor:EDINETCodeDEI',
  secCode: 'jpdei_cor:SecurityCodeDEI',
  filerNameJa: 'jpdei_cor:FilerNameInJapaneseDEI',
  filerNameEn: 'jpdei_cor:FilerNameInEnglishDEI',
  periodStart: 'jpdei_cor:CurrentFiscalYearStartDateDEI',
  periodEnd: 'jpdei_cor:CurrentPeriodEndDateDEI',
  accountingStandards: 'jpdei_cor:AccountingStandardsDEI',
  documentType: 'jpdei_cor:DocumentTypeDEI',
} as const;

export interface DeiMeta {
  edinetCode: string | null;
  secCode: string | null;
  filerNameJa: string | null;
  filerNameEn: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  /** "Japan GAAP" / "IFRS" 等の原文表記 */
  accountingStandards: string | null;
  /** 様式（有報=第三号様式）。DEI行が無い書類ではnull */
  documentType: string | null;
}

/** CSV値に混入するHTML実体参照の最小デコード（実データ: MS&amp;AD。5種のみ・推測変換なし） */
function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** 値なしを表す「－」・空文字はnull */
function deiValue(rows: EdinetCsvRow[], elementId: string): string | null {
  const row = rows.find((r) => r.elementId === elementId);
  if (row === undefined) return null;
  const value = row.value.trim();
  if (value === '' || value === '－') return null;
  return decodeEntities(value);
}

export function extractDei(rows: EdinetCsvRow[]): DeiMeta {
  return {
    edinetCode: deiValue(rows, DEI.edinetCode),
    secCode: deiValue(rows, DEI.secCode),
    filerNameJa: deiValue(rows, DEI.filerNameJa),
    filerNameEn: deiValue(rows, DEI.filerNameEn),
    periodStart: deiValue(rows, DEI.periodStart),
    periodEnd: deiValue(rows, DEI.periodEnd),
    accountingStandards: deiValue(rows, DEI.accountingStandards),
    documentType: deiValue(rows, DEI.documentType),
  };
}

/** DEIの会計基準表記→スキーマ値（判定不能なUS GAAP等はnull＝READMEカバレッジ注記） */
export function accountingStandardFromDei(dei: DeiMeta): AccountingStandard | null {
  if (dei.accountingStandards === 'Japan GAAP') return 'jgaap';
  if (dei.accountingStandards === 'IFRS') return 'ifrs';
  return null;
}

export interface TransformContext {
  docId: string;
  /** 書類取得の公開URL（キーなし・経路非依存。FR6-3） */
  sourceUrl: string;
  retrievedAt: string;
}

export interface FinancialsItem extends Record<string, unknown> {
  doc_id: string;
  edinet_code: string | null;
  sec_code: string | null;
  filer_name_ja: string | null;
  filer_name_en: string | null;
  period_start: string | null;
  period_end: string | null;
  accounting_standard: AccountingStandard | null;
  basis: StatementsExtract['basis'];
}

export function toFinancialsItem(
  dei: DeiMeta,
  extract: StatementsExtract,
  context: TransformContext,
): FinancialsItem & CommonMeta {
  const item: FinancialsItem = {
    doc_id: context.docId,
    edinet_code: dei.edinetCode,
    sec_code: dei.secCode,
    filer_name_ja: dei.filerNameJa,
    // 公式登録英名のみ（api_native相当）。無ければnull（FR6-3）
    filer_name_en: dei.filerNameEn,
    period_start: dei.periodStart,
    period_end: dei.periodEnd,
    // 採用行のタクソノミ系を第一、値ゼロ件はDEI表記から補完（FR6-6）
    accounting_standard: extract.accounting_standard ?? accountingStandardFromDei(dei),
    basis: extract.basis,
    balance_sheet: extract.current.balance_sheet,
    income_statement: extract.current.income_statement,
    cash_flow: extract.current.cash_flow,
    // 当期報告書に記載された前期値（遡及修正後）。FR6-5
    prior_year: extract.prior_year,
    element_map: extract.element_map,
    coverage: extract.coverage,
  };
  return withCommonMeta(item, {
    source: 'edinet',
    sourceUrl: context.sourceUrl,
    schemaVersion: FINANCIALS_SCHEMA_VERSION,
    retrievedAt: context.retrievedAt,
  });
}
