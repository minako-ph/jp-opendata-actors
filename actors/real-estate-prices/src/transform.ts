import { withCommonMeta, type CommonMeta } from '@jp-opendata/attribution';
import { parseJpNumber } from '@jp-opendata/normalize-jp';
import type { ReinfolibTransaction } from '@jp-opendata/gov-clients';

/**
 * XIT001レコード → transactionアイテム変換（FR-3 / FR-C1 / FR-C2）。
 * - snake_caseの英語フィールドを正とし、language=ja応答の値を *_ja で併記
 * - 数値は解釈できる場合のみnumber化。丸め値・「2,000㎡以上」等の区分値からの推測は禁止（null）
 * - 派生指標はmethod:"rule"（N-9③準用）。両辺が数値のときのみ算出
 */

export const REAL_ESTATE_SCHEMA_VERSION = '0.1.0';

/** 派生指標（rule生成）のメタ付き値 */
export interface RuleField {
  value: number | null;
  confidence: number;
  method: 'rule';
}

function rule(value: number | null): RuleField {
  return { value, confidence: 1, method: 'rule' };
}

/** 空文字はnull。数値として解釈できない文字列（区分値等）もnull（推測禁止） */
export function toNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  return parseJpNumber(trimmed);
}

/** BuildingYear: 実データは西暦「YYYY年」(ja)/「YYYY」(en)。それ以外（空・「戦前」等）はnull */
export function parseBuildingYear(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const m = raw.trim().match(/^(\d{4})年?$/);
  return m?.[1] !== undefined ? Number(m[1]) : null;
}

/** Period: en「1st quarter 2024」/ ja「2024年第1四半期」→ {year, quarter} */
export function parsePeriod(
  en: string,
  ja: string | null,
): { year: number | null; quarter: number | null } {
  const enMatch = en.match(/(\d)(?:st|nd|rd|th) quarter (\d{4})/i);
  if (enMatch?.[1] !== undefined && enMatch[2] !== undefined) {
    return { year: Number(enMatch[2]), quarter: Number(enMatch[1]) };
  }
  const jaMatch = (ja ?? en).match(/(\d{4})年第(\d)四半期/);
  if (jaMatch?.[1] !== undefined && jaMatch[2] !== undefined) {
    return { year: Number(jaMatch[1]), quarter: Number(jaMatch[2]) };
  }
  return { year: null, quarter: null };
}

export interface TransactionItem extends Record<string, unknown> {
  record_type: 'transaction';
  price_category: string;
  price_category_ja: string | null;
  property_type: string;
  property_type_ja: string | null;
  region: string | null;
  region_ja: string | null;
  prefecture: string;
  prefecture_ja: string | null;
  prefecture_code: string;
  municipality: string;
  municipality_ja: string | null;
  municipality_code: string;
  district_name: string | null;
  district_name_ja: string | null;
  district_code: string | null;
  trade_price: number | null;
  price_per_tsubo: number | null;
  reported_unit_price_per_sqm: number | null;
  floor_plan: string | null;
  floor_plan_ja: string | null;
  area_sqm: number | null;
  area_ja: string | null;
  land_shape: string | null;
  land_shape_ja: string | null;
  frontage_m: number | null;
  total_floor_area_sqm: number | null;
  building_year: number | null;
  building_year_ja: string | null;
  structure: string | null;
  structure_ja: string | null;
  use: string | null;
  use_ja: string | null;
  purpose: string | null;
  purpose_ja: string | null;
  front_road_direction: string | null;
  front_road_direction_ja: string | null;
  front_road_classification: string | null;
  front_road_classification_ja: string | null;
  front_road_breadth_m: number | null;
  city_planning: string | null;
  city_planning_ja: string | null;
  coverage_ratio_percent: number | null;
  floor_area_ratio_percent: number | null;
  period: string;
  period_ja: string | null;
  transaction_year: number | null;
  transaction_quarter: number | null;
  renovation: string | null;
  renovation_ja: string | null;
  remarks: string | null;
  remarks_ja: string | null;
  /** 派生（rule）: trade_price ÷ area_sqm。両辺が数値のときのみ。円/㎡・四捨五入 */
  unit_price_per_sqm: RuleField;
  /** 派生（rule）: transaction_year − building_year。両辺が数値かつ非負のときのみ */
  building_age_at_transaction: RuleField;
}

const emptyToNull = (raw: string | undefined): string | null =>
  raw === undefined || raw.trim() === '' ? null : raw;

export interface TransformContext {
  sourceUrl: string;
  retrievedAt: string;
}

/**
 * en応答のレコードを正とし、同一インデックスのja応答レコードから*_jaを補完する。
 * jaがnull（結合サニティ不一致等）の場合、*_jaはnull。
 */
export function toTransactionItem(
  en: ReinfolibTransaction,
  ja: ReinfolibTransaction | null,
  context: TransformContext,
): TransactionItem & CommonMeta {
  const tradePrice = toNumber(en.TradePrice);
  const areaSqm = toNumber(en.Area);
  const buildingYear = parseBuildingYear(en.BuildingYear);
  const { year: txYear, quarter: txQuarter } = parsePeriod(en.Period, ja?.Period ?? null);

  const unitPrice =
    tradePrice !== null && areaSqm !== null && areaSqm > 0
      ? Math.round(tradePrice / areaSqm)
      : null;
  const age =
    txYear !== null && buildingYear !== null && txYear - buildingYear >= 0
      ? txYear - buildingYear
      : null;

  const item: TransactionItem = {
    record_type: 'transaction',
    price_category: en.PriceCategory,
    price_category_ja: ja?.PriceCategory ?? null,
    property_type: en.Type,
    property_type_ja: ja?.Type ?? null,
    region: emptyToNull(en.Region),
    region_ja: emptyToNull(ja?.Region),
    prefecture: en.Prefecture,
    prefecture_ja: ja?.Prefecture ?? null,
    prefecture_code: en.MunicipalityCode.slice(0, 2),
    municipality: en.Municipality,
    municipality_ja: ja?.Municipality ?? null,
    municipality_code: en.MunicipalityCode,
    district_name: emptyToNull(en.DistrictName),
    district_name_ja: emptyToNull(ja?.DistrictName),
    district_code: emptyToNull(en.DistrictCode),
    trade_price: tradePrice,
    price_per_tsubo: toNumber(en.PricePerUnit),
    reported_unit_price_per_sqm: toNumber(en.UnitPrice),
    floor_plan: emptyToNull(en.FloorPlan),
    floor_plan_ja: emptyToNull(ja?.FloorPlan),
    area_sqm: areaSqm,
    area_ja: emptyToNull(ja?.Area),
    land_shape: emptyToNull(en.LandShape),
    land_shape_ja: emptyToNull(ja?.LandShape),
    frontage_m: toNumber(en.Frontage),
    total_floor_area_sqm: toNumber(en.TotalFloorArea),
    building_year: buildingYear,
    building_year_ja: emptyToNull(ja?.BuildingYear),
    structure: emptyToNull(en.Structure),
    structure_ja: emptyToNull(ja?.Structure),
    use: emptyToNull(en.Use),
    use_ja: emptyToNull(ja?.Use),
    purpose: emptyToNull(en.Purpose),
    purpose_ja: emptyToNull(ja?.Purpose),
    front_road_direction: emptyToNull(en.Direction),
    front_road_direction_ja: emptyToNull(ja?.Direction),
    front_road_classification: emptyToNull(en.Classification),
    front_road_classification_ja: emptyToNull(ja?.Classification),
    front_road_breadth_m: toNumber(en.Breadth),
    city_planning: emptyToNull(en.CityPlanning),
    city_planning_ja: emptyToNull(ja?.CityPlanning),
    coverage_ratio_percent: toNumber(en.CoverageRatio),
    floor_area_ratio_percent: toNumber(en.FloorAreaRatio),
    period: en.Period,
    period_ja: ja?.Period ?? null,
    transaction_year: txYear,
    transaction_quarter: txQuarter,
    renovation: emptyToNull(en.Renovation),
    renovation_ja: emptyToNull(ja?.Renovation),
    remarks: emptyToNull(en.Remarks),
    remarks_ja: emptyToNull(ja?.Remarks),
    unit_price_per_sqm: rule(unitPrice),
    building_age_at_transaction: rule(age),
  };

  return withCommonMeta(item, {
    source: 'reinfolib',
    sourceUrl: context.sourceUrl,
    schemaVersion: REAL_ESTATE_SCHEMA_VERSION,
    retrievedAt: context.retrievedAt,
  });
}
