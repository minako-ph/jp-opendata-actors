import { withCommonMeta, type CommonMeta } from '@jp-opendata/attribution';
import { JSIC_DIVISION_EN, splitPrefecture } from '@jp-opendata/normalize-jp';
import type { GbizBasicInfo, NameResolutionConfidence } from '@jp-opendata/gov-clients';

/**
 * gBizINFO法人基本情報＋行政実績カウント → companyアイテム変換（FR-4 / FR-C1 / FR-C2）。
 * - name_enはgBizINFO登録英名のみ（method:"api_native"）or null（R2-10。basic経路にLLMを入れない。
 *   LLM翻字はenrichedブロック側）
 * - 都道府県ENはルール（47都道府県表）。市区町村以下のローマ字化はv1では行わない（推測禁止）
 * - industryはJSIC大分類コード→英語名のルール変換（辞書に無いコードは原文コードのみ保全）
 * - business_itemsの実値は営業品目コードのため business_item_codes として保全（README注記）
 */

export const COMPANY_SCHEMA_VERSION = '0.1.0';

export interface NameResolutionMeta {
  input_name: string;
  confidence: NameResolutionConfidence;
}

/** fields入力で選択されなかったブロックはnull（未取得の明示） */
export interface ActivityCounts {
  subsidyCount: number | null;
  procurementCount: number | null;
  patentCount: number | null;
}

export interface CompanyItem extends Record<string, unknown> {
  record_type: 'company';
  corporate_number: string;
  name_en: string | null;
  name_en_method: 'api_native' | null;
  name_ja: string | null;
  name_kana: string | null;
  address_ja: string | null;
  postal_code: string | null;
  prefecture: string | null;
  prefecture_ja: string | null;
  corporate_status_ja: string | null;
  representative_name_ja: string | null;
  capital_stock_jpy: number | null;
  employee_number: number | null;
  company_size_male: number | null;
  company_size_female: number | null;
  date_of_establishment: string | null;
  founding_year: number | null;
  business_summary_ja: string | null;
  industry: string[];
  industry_codes: string[];
  business_item_codes: string[];
  company_url: string | null;
  qualification_grade_ja: string | null;
  has_subsidy: boolean | null;
  subsidy_count: number | null;
  has_procurement: boolean | null;
  procurement_count: number | null;
  patent_count: number | null;
  name_resolution: NameResolutionMeta | null;
}

export interface TransformContext {
  sourceUrl: string;
  retrievedAt: string;
}

/** JSIC大分類コード配列→英語名（辞書に無いコードは英語名リストに含めない＝推測禁止） */
export function industryToEnglish(codes: string[]): string[] {
  return codes
    .map((code) => JSIC_DIVISION_EN[code])
    .filter((name): name is string => name !== undefined);
}

export function toCompanyItem(
  basic: GbizBasicInfo,
  counts: ActivityCounts,
  nameResolution: NameResolutionMeta | null,
  context: TransformContext,
): CompanyItem & CommonMeta {
  const industryCodes = basic.industry ?? [];
  const prefecture = basic.location === undefined ? null : splitPrefecture(basic.location);
  const item: CompanyItem = {
    record_type: 'company',
    corporate_number: basic.corporate_number,
    name_en: basic.name_en ?? null,
    name_en_method: basic.name_en === undefined ? null : 'api_native',
    name_ja: basic.name,
    name_kana: basic.kana ?? null,
    address_ja: basic.location ?? null,
    postal_code: basic.postal_code ?? null,
    prefecture: prefecture?.prefectureEn ?? null,
    prefecture_ja: prefecture?.prefectureJa ?? null,
    corporate_status_ja: basic.status ?? null,
    representative_name_ja: basic.representative_name ?? null,
    capital_stock_jpy: basic.capital_stock ?? null,
    employee_number: basic.employee_number ?? null,
    company_size_male: basic.company_size_male ?? null,
    company_size_female: basic.company_size_female ?? null,
    date_of_establishment: basic.date_of_establishment ?? null,
    founding_year: basic.founding_year ?? null,
    business_summary_ja: basic.business_summary ?? null,
    industry: industryToEnglish(industryCodes),
    industry_codes: industryCodes,
    business_item_codes: basic.business_items ?? [],
    company_url: basic.company_url ?? null,
    qualification_grade_ja: basic.qualification_grade ?? null,
    has_subsidy: counts.subsidyCount === null ? null : counts.subsidyCount > 0,
    subsidy_count: counts.subsidyCount,
    has_procurement: counts.procurementCount === null ? null : counts.procurementCount > 0,
    procurement_count: counts.procurementCount,
    patent_count: counts.patentCount,
    name_resolution: nameResolution,
  };
  return withCommonMeta(item, {
    source: 'gbizinfo',
    sourceUrl: context.sourceUrl,
    schemaVersion: COMPANY_SCHEMA_VERSION,
    retrievedAt: context.retrievedAt,
  });
}
