import { withCommonMeta, type CommonMeta } from '@jp-opendata/attribution';
import { EDINET_DOC_TYPE, type EdinetDocumentResult } from '@jp-opendata/gov-clients';

/**
 * EDINET書類メタ → basicアイテム変換（FR-1 / FR-C1 / FR-C2）。
 * snake_caseの英語フィールドを正とし、日本語原文は *_ja で併記する。
 * financialsは run.ts で extractFinancials の結果を合成する。
 */

export const EDINET_SCHEMA_VERSION = '0.1.0';

const DOC_TYPE_EN: Record<string, string> = {
  [EDINET_DOC_TYPE.ANNUAL_REPORT]: 'Annual Securities Report',
  [EDINET_DOC_TYPE.AMENDED_ANNUAL_REPORT]: 'Amended Annual Securities Report',
  [EDINET_DOC_TYPE.SEMI_ANNUAL_REPORT]: 'Semi-Annual Report',
};

export interface FilingBasicItem extends Record<string, unknown> {
  doc_id: string;
  edinet_code: string | null;
  sec_code: string | null;
  corporate_number: string | null;
  filer_name_ja: string | null;
  /** TODO(Phase 1): EDINETコードリスト由来の英名を解決する。現状は常にnull（推測禁止 N-9②） */
  filer_name_en: string | null;
  doc_type_code: string | null;
  doc_type: string | null;
  is_amendment: boolean;
  is_fund: boolean;
  fund_code: string | null;
  doc_description_ja: string | null;
  period_start: string | null;
  period_end: string | null;
  submitted_at: string | null;
  has_xbrl: boolean;
  has_pdf: boolean;
  has_csv: boolean;
}

/** EDINETの "YYYY-MM-DD HH:mm" をISO 8601（JST固定）へ */
export function edinetDateTimeToIso(value: string | null): string | null {
  if (value === null) return null;
  const m = value.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/);
  if (!m) return null;
  return `${m[1]}T${m[2]}:00+09:00`;
}

export interface TransformContext {
  /** キーを含まない一覧リクエストURL（EdinetListResult.publicUrl） */
  sourceUrl: string;
  retrievedAt: string;
}

export function toBasicItem(
  doc: EdinetDocumentResult,
  context: TransformContext,
): FilingBasicItem & CommonMeta {
  const item: FilingBasicItem = {
    doc_id: doc.docID,
    edinet_code: doc.edinetCode,
    sec_code: doc.secCode,
    corporate_number: doc.JCN,
    filer_name_ja: doc.filerName,
    filer_name_en: null,
    doc_type_code: doc.docTypeCode,
    doc_type: doc.docTypeCode === null ? null : (DOC_TYPE_EN[doc.docTypeCode] ?? null),
    is_amendment: doc.docTypeCode === EDINET_DOC_TYPE.AMENDED_ANNUAL_REPORT,
    is_fund: doc.fundCode !== null,
    fund_code: doc.fundCode,
    doc_description_ja: doc.docDescription,
    period_start: doc.periodStart,
    period_end: doc.periodEnd,
    submitted_at: edinetDateTimeToIso(doc.submitDateTime),
    has_xbrl: doc.xbrlFlag === '1',
    has_pdf: doc.pdfFlag === '1',
    has_csv: doc.csvFlag === '1',
  };
  return withCommonMeta(item, {
    source: 'edinet',
    sourceUrl: context.sourceUrl,
    schemaVersion: EDINET_SCHEMA_VERSION,
    retrievedAt: context.retrievedAt,
  });
}
