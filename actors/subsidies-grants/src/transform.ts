import { withCommonMeta, type CommonMeta } from '@jp-opendata/attribution';
import { ministryToEnglish, parseJpNumber } from '@jp-opendata/normalize-jp';
import type { GbizSubsidy, NameResolutionConfidence } from '@jp-opendata/gov-clients';

/**
 * gBizINFO補助金レコード → subsidyアイテム変換（FR-2 / FR-C1 / FR-C2）。
 * - snake_caseの英語フィールドを正とし、日本語原文を *_ja で併記
 * - 補助金名の英語はv1では提供しない（LLM不使用の要件どおり。title_jaのみ・README正直明記）
 * - 府省名ENは辞書＋ルール（normalize-jp）。辞書に無い機関はnull（推測禁止）
 * - amountは実応答が文字列のため数値化（解釈不能はnull）
 * - data_originはv2で識別不能のため出力しない（docs/research/gbizinfo-subsidy.md）
 */

export const SUBSIDIES_SCHEMA_VERSION = '0.1.0';

/** 会社名入力の解決結果（#4と共通の確度モデル）。corporate_numbers入力時はnull */
export interface NameResolutionMeta {
  input_name: string;
  confidence: NameResolutionConfidence;
}

export interface RecipientInfo {
  corporateNumber: string;
  /** gBizINFO登録英名（法人検索応答のname_en。api_native。無ければnull） */
  nameEn: string | null;
  nameJa: string | null;
  locationJa: string | null;
  nameResolution: NameResolutionMeta | null;
}

export interface SubsidyItem extends Record<string, unknown> {
  record_type: 'subsidy';
  title_ja: string | null;
  ministry: string | null;
  ministry_ja: string | null;
  amount_jpy: number | null;
  date_of_approval: string | null;
  target_ja: string | null;
  recipient_corporate_number: string;
  recipient_name: string | null;
  recipient_name_ja: string | null;
  recipient_location_ja: string | null;
  name_resolution: NameResolutionMeta | null;
}

/** "2025-12-18" / ISO datetime → YYYY-MM-DD。それ以外はnull */
export function toIsoDate(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const m = raw.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m?.[1] ?? null;
}

/** amountは補助金APIで文字列・調達APIで数値（実応答）。両対応で数値化 */
export function toAmountJpy(raw: string | number | undefined): number | null {
  if (raw === undefined) return null;
  if (typeof raw === 'number') return raw;
  return parseJpNumber(raw);
}

export interface TransformContext {
  sourceUrl: string;
  retrievedAt: string;
}

export function toSubsidyItem(
  subsidy: GbizSubsidy,
  recipient: RecipientInfo,
  context: TransformContext,
): SubsidyItem & CommonMeta {
  const ministryJa = subsidy.government_departments ?? null;
  const item: SubsidyItem = {
    record_type: 'subsidy',
    title_ja: subsidy.title ?? null,
    ministry: ministryJa === null ? null : ministryToEnglish(ministryJa),
    ministry_ja: ministryJa,
    amount_jpy: toAmountJpy(subsidy.amount),
    date_of_approval: toIsoDate(subsidy.date_of_approval),
    target_ja: subsidy.target ?? null,
    recipient_corporate_number: recipient.corporateNumber,
    recipient_name: recipient.nameEn,
    recipient_name_ja: recipient.nameJa,
    recipient_location_ja: recipient.locationJa,
    name_resolution: recipient.nameResolution,
  };
  return withCommonMeta(item, {
    source: 'gbizinfo',
    sourceUrl: context.sourceUrl,
    schemaVersion: SUBSIDIES_SCHEMA_VERSION,
    retrievedAt: context.retrievedAt,
  });
}
