import type { Billing } from '@jp-opendata/billing';
import {
  HttpStatusError,
  RateLimitAbortError,
  resolveCompanyName,
  type GbizBasicInfo,
  type GbizinfoResult,
  type GbizPatentHojin,
  type GbizProcurementHojin,
  type GbizSubsidyHojin,
  type HoujinNameSearcher,
  type HoujinResult,
  type HttpStats,
} from '@jp-opendata/gov-clients';
import {
  industryToEnglish,
  toCompanyItem,
  toRegistryFallbackItem,
  type ActivityCounts,
  type NameResolutionMeta,
} from './transform.js';

/**
 * Actor#4 実行コア（Apify SDK非依存・テスト可能。#1/#2/#3と同型）。
 * - 入力: corporate_numbers / company_names（houjin名称解決＝#2と共通の確度モデル）・
 *   fields（行政実績ブロック選択）・enrich
 * - basic: gBizINFO法人基本情報＋行政実績カウント。name_enはapi_nativeのみ（R2-10）
 * - enriched: LLMで①事業概要EN一行（数値禁止＋数字列照合フラグ）②name_en翻字
 *   （api_native無し時のみ・照合スキップ）。LLM失敗はbasicへフォールバック（FR-C8・課金なし）
 * - FR-C7: 1,000社/run。FR-C8: 1社の失敗は_error行で継続、認証エラー/失敗率50%超のみ実行失敗
 * - gBizINFO未収載は houjin /4/num フォールバック（基本3情報のみ・source=houjin・record-basic課金）。
 *   レジストリにも無い/houjin未設定の場合は非課金の_error行で明示
 */

export const ACTIVITY_FIELDS = ['subsidies', 'procurement', 'patents'] as const;
export type ActivityField = (typeof ACTIVITY_FIELDS)[number];

export interface CompanyEnrichmentInput {
  corporate_numbers?: string[];
  company_names?: string[];
  /** 取得する行政実績ブロック（既定: すべて）。patentsは大企業で応答が重い */
  fields?: string[];
  enrich?: boolean;
}

export interface GbizinfoClientLike {
  getBasicInfo(corporateNumber: string): Promise<GbizinfoResult<GbizBasicInfo>>;
  getSubsidies(corporateNumber: string): Promise<GbizinfoResult<GbizSubsidyHojin>>;
  getProcurements(corporateNumber: string): Promise<GbizinfoResult<GbizProcurementHojin>>;
  getPatents(corporateNumber: string): Promise<GbizinfoResult<GbizPatentHojin>>;
  getHttpStats(): Readonly<HttpStats>;
}

/** enricher注入点（実装はpackages/enrichのcreateCompanyEnricherをmain.tsで注入する） */
export type CompanyEnricherLike = (input: {
  nameJa: string;
  kana: string | null;
  nativeNameEn: string | null;
  businessSummaryJa: string | null;
  industryEn: string[];
}) => Promise<{
  fields: Record<string, unknown>;
  usage: { costUsd: number };
}>;

export interface RunLogger {
  info(message: string): void;
  warning(message: string): void;
  error(message: string): void;
}

/** company_names解決（/4/name）と未収載フォールバック（/4/num）の両方を担う法人番号Web-API面 */
export interface HoujinLookup extends HoujinNameSearcher {
  findByNumbers(numbers: readonly string[]): Promise<HoujinResult>;
}

export interface RunSummary {
  companies_planned: number;
  companies_used: number;
  companies_truncated: boolean;
  names_resolved: number;
  names_unresolved: number;
  companies_not_found: number;
  /** gBizINFO未収載→法人番号レジストリの基本3情報で出力した件数 */
  houjin_fallbacks: number;
  records_pushed: number;
  record_errors: number;
  record_failure_rate: number;
  records_charged: number;
  free_used: number;
  block_errors: number;
  enrich_records: number;
  enrich_failures: number;
  enrich_skipped_no_text: number;
  enrich_cost_usd_total: number;
  enrich_cost_usd_avg: number;
  drift_detected: boolean;
  rate_limit_hits: number;
  aborted_by_rate_limit: boolean;
  charge_limit_reached: boolean;
}

export interface RunDeps {
  client: GbizinfoClientLike;
  /** 法人番号Web-API（company_names解決＋未収載フォールバック用）。HOUJIN_APP_ID未設定時はnull */
  houjin: HoujinLookup | null;
  billing: Billing;
  pushData: (item: Record<string, unknown>) => Promise<void>;
  log: RunLogger;
  retrievedAt: string;
  /** enrich=true時に使うLLM enrichment（未設定でenrich要求は実行失敗＝設定不備） */
  enricher?: CompanyEnricherLike;
  /** enrichedアイテムに記録するモデル名（main.tsのENRICH_MODELと一致させる） */
  enrichModel?: string;
  alert?: (summary: RunSummary) => Promise<void>;
  /** テスト用の上限上書き */
  maxCompanies?: number;
}

/** FR-C7: 対象法人の上限 */
export const MAX_COMPANIES = 1_000;

export class RunFailedError extends Error {}

function isAuthError(error: unknown): boolean {
  return error instanceof HttpStatusError && (error.status === 401 || error.status === 403);
}

function isNotFound(error: unknown): boolean {
  return error instanceof HttpStatusError && error.status === 404;
}

function validateInput(input: CompanyEnrichmentInput): Set<ActivityField> {
  const hasCompanies =
    (input.corporate_numbers?.length ?? 0) > 0 || (input.company_names?.length ?? 0) > 0;
  if (!hasCompanies) {
    throw new RunFailedError('Specify corporate_numbers or company_names.');
  }
  for (const num of input.corporate_numbers ?? []) {
    if (!/^\d{13}$/.test(num.trim())) {
      throw new RunFailedError(`corporate_numbers must be 13-digit numbers: "${num}"`);
    }
  }
  const requested = input.fields ?? [...ACTIVITY_FIELDS];
  const blocks = new Set<ActivityField>();
  for (const raw of requested) {
    const field = raw.trim().toLowerCase();
    if (field === '') continue;
    const hit = ACTIVITY_FIELDS.find((f) => f === field);
    if (hit === undefined) {
      throw new RunFailedError(`Unknown field "${raw}" (valid: ${ACTIVITY_FIELDS.join(', ')}).`);
    }
    blocks.add(hit);
  }
  return blocks;
}

interface CompanyTarget {
  corporateNumber: string;
  nameResolution: NameResolutionMeta | null;
}

export async function runCompanyEnrichment(
  input: CompanyEnrichmentInput,
  deps: RunDeps,
): Promise<RunSummary> {
  const blocks = validateInput(input);
  const maxCompanies = deps.maxCompanies ?? MAX_COMPANIES;
  if (input.enrich && deps.enricher === undefined) {
    // 設定不備（キー未設定）は静かにbasicへ落とさず実行失敗にする（#1と同型）
    throw new RunFailedError('ANTHROPIC_API_KEY is not set (required when enrich=true).');
  }

  const summary: RunSummary = {
    companies_planned: 0,
    companies_used: 0,
    companies_truncated: false,
    names_resolved: 0,
    names_unresolved: 0,
    companies_not_found: 0,
    houjin_fallbacks: 0,
    records_pushed: 0,
    record_errors: 0,
    record_failure_rate: 0,
    records_charged: 0,
    free_used: 0,
    block_errors: 0,
    enrich_records: 0,
    enrich_failures: 0,
    enrich_skipped_no_text: 0,
    enrich_cost_usd_total: 0,
    enrich_cost_usd_avg: 0,
    drift_detected: false,
    rate_limit_hits: 0,
    aborted_by_rate_limit: false,
    charge_limit_reached: false,
  };

  try {
    let targets = await resolveTargets(input, deps, summary);
    summary.companies_planned = targets.length + summary.names_unresolved;
    if (targets.length > maxCompanies) {
      summary.companies_truncated = true;
      deps.log.warning(
        `${targets.length} companies requested; capped at ${maxCompanies} per run (per-run limit).`,
      );
      targets = targets.slice(0, maxCompanies);
    }
    summary.companies_used = targets.length;

    for (const target of targets) {
      let basicResult: GbizinfoResult<GbizBasicInfo>;
      try {
        basicResult = await deps.client.getBasicInfo(target.corporateNumber);
      } catch (error) {
        if (isAuthError(error)) {
          throw new RunFailedError(`gBizINFO authentication failed: ${String(error)}`);
        }
        if (error instanceof RateLimitAbortError) throw error;
        if (isNotFound(error)) {
          const fallback = await pushRegistryFallback(target, deps, summary);
          if (fallback.limitReached) {
            summary.charge_limit_reached = true;
            deps.log.warning('Max charge limit reached; stopping gracefully with partial results.');
            break;
          }
          continue;
        }
        summary.record_errors++;
        deps.log.warning(`Failed to fetch ${target.corporateNumber}: ${String(error)}`);
        await deps.pushData({
          record_type: 'company',
          corporate_number: target.corporateNumber,
          _error: String(error).slice(0, 200),
        });
        continue;
      }
      summary.drift_detected = summary.drift_detected || basicResult.drift.hasDrift;
      if (basicResult.drift.hasDrift) {
        deps.log.warning(
          `Schema drift detected on ${target.corporateNumber}: ${JSON.stringify(basicResult.drift)}`,
        );
      }
      const basic = basicResult.hojinInfos[0];
      if (basic === undefined) {
        // 200だがプロフィール空＝未収載と同義なので同じフォールバックに乗せる
        const fallback = await pushRegistryFallback(target, deps, summary);
        if (fallback.limitReached) {
          summary.charge_limit_reached = true;
          deps.log.warning('Max charge limit reached; stopping gracefully with partial results.');
          break;
        }
        continue;
      }

      const counts = await fetchActivityCounts(target.corporateNumber, blocks, deps, summary);

      let item;
      try {
        item = toCompanyItem(basic, counts, target.nameResolution, {
          sourceUrl: basicResult.publicUrl,
          retrievedAt: deps.retrievedAt,
        });
      } catch (error) {
        summary.record_errors++;
        deps.log.warning(`Failed to transform ${target.corporateNumber}: ${String(error)}`);
        await deps.pushData({
          record_type: 'company',
          corporate_number: target.corporateNumber,
          _error: String(error).slice(0, 200),
        });
        continue;
      }

      // enrich（#1と同型）: enrich結果を待ってから1回だけpushする（二重出力にしない）。
      // LLM失敗はbasicのみ（enriched:null）で出力して継続（FR-C8。enriched課金なし）
      let enriched: Record<string, unknown> | null = null;
      if (input.enrich && deps.enricher) {
        const nativeNameEn = basic.name_en ?? null;
        const businessSummaryJa = basic.business_summary ?? null;
        const industryEn = industryToEnglish(basic.industry ?? []);
        if (nativeNameEn !== null && businessSummaryJa === null && industryEn.length === 0) {
          // 生成対象なし（英名はapi_nativeが正・要約原文なし）→ 課金なしでスキップ
          summary.enrich_skipped_no_text++;
        } else {
          try {
            const result = await deps.enricher({
              nameJa: basic.name,
              kana: basic.kana ?? null,
              nativeNameEn,
              businessSummaryJa,
              industryEn,
            });
            enriched = {
              ...result.fields,
              model: deps.enrichModel ?? null,
              prompt_version: 'company-enrich-v1',
            };
            summary.enrich_cost_usd_total += result.usage.costUsd;
          } catch (error) {
            summary.enrich_failures++;
            deps.log.warning(
              `Enrich failed for ${target.corporateNumber} (falling back to basic): ${String(error)}`,
            );
          }
        }
      }

      await deps.pushData(input.enrich ? { ...item, enriched } : item);
      summary.records_pushed++;
      const outcome = await deps.billing.charge('record-basic');
      let limitReached = outcome.limitReached;
      if (enriched !== null) {
        summary.enrich_records++;
        const enrichedOutcome = await deps.billing.charge('record-enriched');
        limitReached = limitReached || enrichedOutcome.limitReached;
      }
      if (limitReached) {
        summary.charge_limit_reached = true;
        deps.log.warning('Max charge limit reached; stopping gracefully with partial results.');
        break;
      }
    }
  } catch (error) {
    if (error instanceof RateLimitAbortError) {
      summary.aborted_by_rate_limit = true;
      await finalizeSummary(summary, deps, true);
      throw new RunFailedError(String(error));
    }
    throw error;
  }

  const failed = await finalizeSummary(summary, deps, false);
  if (failed) {
    throw new RunFailedError(
      `Record failure rate ${(summary.record_failure_rate * 100).toFixed(0)}% exceeded 50%.`,
    );
  }
  return summary;
}

/**
 * gBizINFO未収載法人のフォールバック。法人番号Web-API /4/num の基本3情報
 * （商号・所在地・法人番号）のみをsource=houjinの行として出力しrecord-basic課金する。
 * レジストリにも無い・houjin未設定・houjin失敗の場合は従来どおり非課金の_error行。
 */
async function pushRegistryFallback(
  target: CompanyTarget,
  deps: RunDeps,
  summary: RunSummary,
): Promise<{ limitReached: boolean }> {
  const notCovered = 'Not covered by gBizINFO (approx. 4M corporations).';
  if (deps.houjin !== null) {
    let result: HoujinResult | null = null;
    try {
      result = await deps.houjin.findByNumbers([target.corporateNumber]);
    } catch (error) {
      if (error instanceof RateLimitAbortError) throw error;
      deps.log.warning(
        `Registry fallback failed for ${target.corporateNumber}: ${String(error)}`,
      );
    }
    if (result !== null) {
      summary.drift_detected = summary.drift_detected || result.drift.hasDrift;
      const corp = result.corporations[0];
      if (corp !== undefined) {
        const item = toRegistryFallbackItem(corp, target.nameResolution, {
          sourceUrl: result.publicUrl,
          retrievedAt: deps.retrievedAt,
        });
        await deps.pushData(item);
        summary.records_pushed++;
        summary.houjin_fallbacks++;
        deps.log.info(
          `${target.corporateNumber} is not covered by gBizINFO; returned NTA registry basic profile instead.`,
        );
        const outcome = await deps.billing.charge('record-basic');
        return { limitReached: outcome.limitReached };
      }
      summary.companies_not_found++;
      await deps.pushData({
        record_type: 'company',
        corporate_number: target.corporateNumber,
        name_resolution: target.nameResolution,
        _error: `${notCovered} Not found in the NTA corporate number registry either.`,
      });
      return { limitReached: false };
    }
  }
  summary.companies_not_found++;
  await deps.pushData({
    record_type: 'company',
    corporate_number: target.corporateNumber,
    name_resolution: target.nameResolution,
    _error: notCovered,
  });
  return { limitReached: false };
}

/** 行政実績ブロックの件数取得。ブロック単位の失敗はnull＋警告で継続（行は出力する） */
async function fetchActivityCounts(
  corporateNumber: string,
  blocks: Set<ActivityField>,
  deps: RunDeps,
  summary: RunSummary,
): Promise<ActivityCounts> {
  const counts: ActivityCounts = {
    subsidyCount: null,
    procurementCount: null,
    patentCount: null,
  };
  const fetchers: Array<{
    field: ActivityField;
    fetch: () => Promise<number>;
    assign: (count: number) => void;
  }> = [
    {
      field: 'subsidies',
      fetch: async () =>
        (await deps.client.getSubsidies(corporateNumber)).hojinInfos[0]?.subsidy?.length ?? 0,
      assign: (count) => {
        counts.subsidyCount = count;
      },
    },
    {
      field: 'procurement',
      fetch: async () =>
        (await deps.client.getProcurements(corporateNumber)).hojinInfos[0]?.procurement?.length ??
        0,
      assign: (count) => {
        counts.procurementCount = count;
      },
    },
    {
      field: 'patents',
      fetch: async () =>
        (await deps.client.getPatents(corporateNumber)).hojinInfos[0]?.patent?.length ?? 0,
      assign: (count) => {
        counts.patentCount = count;
      },
    },
  ];
  for (const { field, fetch, assign } of fetchers) {
    if (!blocks.has(field)) continue;
    try {
      assign(await fetch());
    } catch (error) {
      if (isAuthError(error)) {
        throw new RunFailedError(`gBizINFO authentication failed: ${String(error)}`);
      }
      if (error instanceof RateLimitAbortError) throw error;
      if (isNotFound(error)) {
        // 子APIの404は当該実績なし＝0件
        assign(0);
        continue;
      }
      summary.block_errors++;
      deps.log.warning(`Failed to fetch ${field} of ${corporateNumber}: ${String(error)}`);
    }
  }
  return counts;
}

/** corporate_numbers / company_names を法人番号ターゲットに解決する（#2と同じ確度モデル） */
async function resolveTargets(
  input: CompanyEnrichmentInput,
  deps: RunDeps,
  summary: RunSummary,
): Promise<CompanyTarget[]> {
  const targets: CompanyTarget[] = [];
  const seen = new Set<string>();
  for (const raw of input.corporate_numbers ?? []) {
    const num = raw.trim();
    if (seen.has(num)) continue;
    seen.add(num);
    targets.push({ corporateNumber: num, nameResolution: null });
  }

  const names = (input.company_names ?? []).map((n) => n.trim()).filter((n) => n !== '');
  if (names.length > 0 && deps.houjin === null) {
    throw new RunFailedError(
      'company_names requires the National Tax Agency corporate number API. ' +
        'Set the HOUJIN_APP_ID secret, or use corporate_numbers instead.',
    );
  }
  for (const name of names) {
    if (deps.houjin === null) break;
    let resolution;
    try {
      resolution = await resolveCompanyName(deps.houjin, name);
    } catch (error) {
      if (error instanceof RateLimitAbortError) throw error;
      summary.names_unresolved++;
      summary.record_errors++;
      deps.log.warning(`Name resolution failed for "${name}": ${String(error)}`);
      await deps.pushData({
        record_type: 'company',
        name_resolution: { input_name: name, confidence: 'not_found' },
        _error: String(error).slice(0, 200),
      });
      continue;
    }
    if (
      (resolution.confidence === 'exact' || resolution.confidence === 'selected') &&
      resolution.corporateNumber !== null
    ) {
      summary.names_resolved++;
      if (seen.has(resolution.corporateNumber)) continue;
      seen.add(resolution.corporateNumber);
      targets.push({
        corporateNumber: resolution.corporateNumber,
        nameResolution: { input_name: name, confidence: resolution.confidence },
      });
    } else {
      summary.names_unresolved++;
      deps.log.warning(
        `Could not resolve company name "${name}" (${resolution.confidence}, ${resolution.candidateCount} candidates).`,
      );
      await deps.pushData({
        record_type: 'company',
        name_resolution: { input_name: name, confidence: resolution.confidence },
        _error:
          resolution.confidence === 'not_found'
            ? 'No corporation matched this name.'
            : `Ambiguous name: ${resolution.candidateCount} candidates. Use corporate_numbers to disambiguate.`,
      });
    }
  }
  return targets;
}

async function finalizeSummary(
  summary: RunSummary,
  deps: RunDeps,
  forceAlert: boolean,
): Promise<boolean> {
  const processed = summary.records_pushed + summary.record_errors;
  summary.record_failure_rate = processed === 0 ? 0 : summary.record_errors / processed;
  summary.rate_limit_hits = deps.client.getHttpStats().rateLimitHits;
  summary.records_charged = deps.billing.totals()['record-basic'];
  summary.free_used = deps.billing.freeUsed()['record-basic'];
  summary.enrich_cost_usd_avg =
    summary.enrich_records === 0
      ? 0
      : Number((summary.enrich_cost_usd_total / summary.enrich_records).toFixed(6));

  const shouldAlert =
    forceAlert ||
    summary.record_failure_rate > 0.2 ||
    summary.rate_limit_hits > 0 ||
    summary.drift_detected;
  if (shouldAlert) {
    deps.log.warning(`Monitoring alert condition met: ${JSON.stringify(summary)}`);
    if (deps.alert) {
      try {
        await deps.alert(summary);
      } catch (error) {
        deps.log.error(`Failed to send alert: ${String(error)}`);
      }
    }
  }
  deps.log.info(`Run summary: ${JSON.stringify(summary)}`);
  return summary.record_failure_rate > 0.5;
}
