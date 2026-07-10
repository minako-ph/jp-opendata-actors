import type { Billing } from '@jp-opendata/billing';
import {
  HttpStatusError,
  RateLimitAbortError,
  resolveCompanyName,
  resolveMinistry,
  GBIZINFO_SEARCH_MAX_PAGE,
  type GbizinfoResult,
  type GbizinfoSearchQuery,
  type GbizHojinProfile,
  type GbizSubsidyHojin,
  type HoujinNameSearcher,
  type HttpStats,
  type ResolvedMinistry,
} from '@jp-opendata/gov-clients';
import {
  toSubsidyItem,
  type NameResolutionMeta,
  type RecipientInfo,
  type SubsidyItem,
} from './transform.js';

/**
 * Actor#2 実行コア（Apify SDK非依存・テスト可能。#1/#3と同型）。
 * - 入力は corporate_numbers / company_names / ministry（横断）のいずれか必須
 * - 横断は法人検索（source=4×ministry内部コード）→法人ごとに/subsidyの2段取得
 *   （日付範囲はAPI側で指定不可のためdate_of_approvalでクライアント側フィルタ。
 *   docs/research/gbizinfo-subsidy.md）
 * - FR-C7（新規定義）: 対象法人500社 or 横断500件。超過はエラーでなく打ち切り＋警告
 * - FR-C8: 1レコード失敗は_error行で継続。実行失敗は認証エラーまたは失敗率50%超のみ
 * - 課金はsubsidy行のみ（record-basic）。_error行・解決失敗行は非課金
 */

export interface SubsidiesInput {
  corporate_numbers?: string[];
  company_names?: string[];
  /** 横断検索の府省（内部コード・日本語名・英語公式名のいずれか） */
  ministry?: string;
  /** date_of_approval のフィルタ（YYYY-MM-DD・両端含む） */
  date_from?: string;
  date_to?: string;
}

export interface GbizinfoClientLike {
  searchHojin(query: GbizinfoSearchQuery): Promise<GbizinfoResult<GbizHojinProfile>>;
  getSubsidies(corporateNumber: string): Promise<GbizinfoResult<GbizSubsidyHojin>>;
  getHttpStats(): Readonly<HttpStats>;
}

export interface RunLogger {
  info(message: string): void;
  warning(message: string): void;
  error(message: string): void;
}

export interface RunSummary {
  companies_planned: number;
  companies_used: number;
  companies_truncated: boolean;
  names_resolved: number;
  names_unresolved: number;
  companies_not_found: number;
  cross_companies_scanned: number;
  cross_records_truncated: boolean;
  records_pushed: number;
  record_errors: number;
  record_failure_rate: number;
  records_charged: number;
  free_used: number;
  drift_detected: boolean;
  rate_limit_hits: number;
  aborted_by_rate_limit: boolean;
  charge_limit_reached: boolean;
}

export interface RunDeps {
  client: GbizinfoClientLike;
  /** 法人番号Web-API（company_names解決用）。HOUJIN_APP_ID未設定時はnull */
  houjin: HoujinNameSearcher | null;
  billing: Billing;
  pushData: (item: Record<string, unknown>) => Promise<void>;
  log: RunLogger;
  retrievedAt: string;
  alert?: (summary: RunSummary) => Promise<void>;
  /** テスト用の上限上書き */
  maxCompanies?: number;
  maxCrossRecords?: number;
}

/** FR-C7（新規定義・decisions記録）: 対象法人の上限 */
export const MAX_COMPANIES = 500;
/** FR-C7（新規定義・decisions記録）: 横断検索で出力する補助金レコードの上限 */
export const MAX_CROSS_RECORDS = 500;

export class RunFailedError extends Error {}

function isAuthError(error: unknown): boolean {
  return error instanceof HttpStatusError && (error.status === 401 || error.status === 403);
}

/** gBizINFO未収載の法人番号は404で返る（0件扱い。docs/research/gbizinfo-subsidy.md） */
function isNotFound(error: unknown): boolean {
  return error instanceof HttpStatusError && error.status === 404;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validateInput(input: SubsidiesInput): void {
  const hasCompanies =
    (input.corporate_numbers?.length ?? 0) > 0 || (input.company_names?.length ?? 0) > 0;
  const hasMinistry = (input.ministry ?? '').trim() !== '';
  if (!hasCompanies && !hasMinistry) {
    throw new RunFailedError(
      'Specify corporate_numbers, company_names, or a ministry for a cross-company search.',
    );
  }
  for (const key of ['date_from', 'date_to'] as const) {
    const value = input[key];
    if (value !== undefined && value !== '' && !ISO_DATE.test(value)) {
      throw new RunFailedError(`${key} must be YYYY-MM-DD.`);
    }
  }
  for (const num of input.corporate_numbers ?? []) {
    if (!/^\d{13}$/.test(num.trim())) {
      throw new RunFailedError(`corporate_numbers must be 13-digit numbers: "${num}"`);
    }
  }
}

interface CompanyTarget {
  corporateNumber: string;
  nameResolution: NameResolutionMeta | null;
  /** 横断検索で取得済みのプロフィール（追加の検索リクエストを省く） */
  profile: GbizHojinProfile | null;
}

function inDateRange(
  date: string | null,
  from: string | undefined,
  to: string | undefined,
): boolean {
  if (from !== undefined && from !== '' && (date === null || date < from)) return false;
  if (to !== undefined && to !== '' && (date === null || date > to)) return false;
  return true;
}

export async function runSubsidiesGrants(
  input: SubsidiesInput,
  deps: RunDeps,
): Promise<RunSummary> {
  validateInput(input);
  const maxCompanies = deps.maxCompanies ?? MAX_COMPANIES;
  const maxCrossRecords = deps.maxCrossRecords ?? MAX_CROSS_RECORDS;

  const summary: RunSummary = {
    companies_planned: 0,
    companies_used: 0,
    companies_truncated: false,
    names_resolved: 0,
    names_unresolved: 0,
    companies_not_found: 0,
    cross_companies_scanned: 0,
    cross_records_truncated: false,
    records_pushed: 0,
    record_errors: 0,
    record_failure_rate: 0,
    records_charged: 0,
    free_used: 0,
    drift_detected: false,
    rate_limit_hits: 0,
    aborted_by_rate_limit: false,
    charge_limit_reached: false,
  };

  const hasCompanyInput =
    (input.corporate_numbers?.length ?? 0) > 0 || (input.company_names?.length ?? 0) > 0;
  // 横断でも指定時はレコードをministryで絞る（法人検索のministryは「法人が当該府省の
  // 実績を持つ」条件であり、他府省の補助金レコードが混ざるため）
  const ministry: ResolvedMinistry | null = (() => {
    const raw = (input.ministry ?? '').trim();
    if (raw === '') return null;
    const resolved = resolveMinistry(raw);
    if (resolved === null) {
      throw new RunFailedError(
        `Unknown ministry: "${raw}" (use a Japanese name like 経済産業省, an official English name, or a gBizINFO internal code 1-49).`,
      );
    }
    return resolved;
  })();

  try {
    let targets: CompanyTarget[];
    if (hasCompanyInput) {
      targets = await resolveCompanyTargets(input, deps, summary);
      summary.companies_planned = targets.length + summary.names_unresolved;
      if (targets.length > maxCompanies) {
        summary.companies_truncated = true;
        deps.log.warning(
          `${targets.length} companies requested; capped at ${maxCompanies} per run (per-run limit).`,
        );
        targets = targets.slice(0, maxCompanies);
      }
    } else {
      if (ministry === null) {
        throw new RunFailedError('Cross-company search requires a ministry in v1.');
      }
      targets = await collectCrossTargets(ministry, deps, summary, maxCompanies);
      summary.companies_planned = targets.length;
    }
    summary.companies_used = targets.length;

    let crossRecords = 0;
    outer: for (const target of targets) {
      let profile = target.profile;
      let subsidies: GbizinfoResult<GbizSubsidyHojin>;
      try {
        if (profile === null) {
          const search = await deps.client.searchHojin({
            corporateNumber: target.corporateNumber,
          });
          summary.drift_detected = summary.drift_detected || search.drift.hasDrift;
          profile = search.hojinInfos[0] ?? null;
        }
        subsidies = await deps.client.getSubsidies(target.corporateNumber);
      } catch (error) {
        if (isAuthError(error)) {
          throw new RunFailedError(`gBizINFO authentication failed: ${String(error)}`);
        }
        if (error instanceof RateLimitAbortError) throw error;
        if (isNotFound(error)) {
          summary.companies_not_found++;
          deps.log.info(`Company ${target.corporateNumber} is not covered by gBizINFO (404).`);
          continue;
        }
        summary.record_errors++;
        deps.log.warning(`Failed to fetch ${target.corporateNumber}: ${String(error)}`);
        await deps.pushData({
          record_type: 'subsidy',
          recipient_corporate_number: target.corporateNumber,
          _error: String(error).slice(0, 200),
        });
        continue;
      }
      summary.drift_detected = summary.drift_detected || subsidies.drift.hasDrift;
      if (subsidies.drift.hasDrift) {
        deps.log.warning(
          `Schema drift detected on ${target.corporateNumber}: ${JSON.stringify(subsidies.drift)}`,
        );
      }

      const hojin = subsidies.hojinInfos[0];
      const recipient: RecipientInfo = {
        corporateNumber: target.corporateNumber,
        nameEn: profile?.name_en ?? null,
        nameJa: hojin?.name ?? profile?.name ?? null,
        locationJa: hojin?.location ?? profile?.location ?? null,
        nameResolution: target.nameResolution,
      };

      for (const subsidy of hojin?.subsidy ?? []) {
        let item: SubsidyItem;
        try {
          item = toSubsidyItem(subsidy, recipient, {
            sourceUrl: subsidies.publicUrl,
            retrievedAt: deps.retrievedAt,
          });
        } catch (error) {
          summary.record_errors++;
          deps.log.warning(
            `Failed to transform a record of ${target.corporateNumber}: ${String(error)}`,
          );
          await deps.pushData({
            record_type: 'subsidy',
            recipient_corporate_number: target.corporateNumber,
            _error: String(error).slice(0, 200),
          });
          continue;
        }
        if (!inDateRange(item.date_of_approval, input.date_from, input.date_to)) continue;
        if (ministry !== null && item.ministry_ja !== ministry.ja) continue;
        if (!hasCompanyInput && crossRecords >= maxCrossRecords) {
          summary.cross_records_truncated = true;
          deps.log.warning(
            `Cross-company search reached ${maxCrossRecords} records; stopping (per-run limit).`,
          );
          break outer;
        }
        await deps.pushData(item);
        summary.records_pushed++;
        if (!hasCompanyInput) crossRecords++;
        const outcome = await deps.billing.charge('record-basic');
        if (outcome.limitReached) {
          summary.charge_limit_reached = true;
          deps.log.warning('Max charge limit reached; stopping gracefully with partial results.');
          break outer;
        }
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

/** corporate_numbers / company_names を法人番号ターゲットに解決する */
async function resolveCompanyTargets(
  input: SubsidiesInput,
  deps: RunDeps,
  summary: RunSummary,
): Promise<CompanyTarget[]> {
  const targets: CompanyTarget[] = [];
  const seen = new Set<string>();
  for (const raw of input.corporate_numbers ?? []) {
    const num = raw.trim();
    if (seen.has(num)) continue;
    seen.add(num);
    targets.push({ corporateNumber: num, nameResolution: null, profile: null });
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
        record_type: 'subsidy',
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
        profile: null,
      });
    } else {
      // 解決不能はエラーでなく情報行（非課金）で報告して継続（FR-C8同思想）
      summary.names_unresolved++;
      deps.log.warning(
        `Could not resolve company name "${name}" (${resolution.confidence}, ${resolution.candidateCount} candidates).`,
      );
      await deps.pushData({
        record_type: 'subsidy',
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

/** 横断検索: 法人検索（source=4×ministry）で対象法人を集める（最大maxCompanies社） */
async function collectCrossTargets(
  ministry: ResolvedMinistry,
  deps: RunDeps,
  summary: RunSummary,
  maxCompanies: number,
): Promise<CompanyTarget[]> {
  const targets: CompanyTarget[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= GBIZINFO_SEARCH_MAX_PAGE; page++) {
    let result: GbizinfoResult<GbizHojinProfile>;
    try {
      result = await deps.client.searchHojin({
        source: '4',
        ministry: ministry.code,
        page,
        limit: maxCompanies,
      });
    } catch (error) {
      if (isAuthError(error)) {
        throw new RunFailedError(`gBizINFO authentication failed: ${String(error)}`);
      }
      throw error;
    }
    summary.drift_detected = summary.drift_detected || result.drift.hasDrift;
    for (const profile of result.hojinInfos) {
      if (seen.has(profile.corporate_number)) continue;
      seen.add(profile.corporate_number);
      targets.push({ corporateNumber: profile.corporate_number, nameResolution: null, profile });
      if (targets.length >= maxCompanies) {
        summary.companies_truncated = true;
        deps.log.warning(
          `Cross-company search matched more than ${maxCompanies} companies; capped (per-run limit).`,
        );
        summary.cross_companies_scanned = targets.length;
        return targets;
      }
    }
    if (result.hojinInfos.length < maxCompanies) break; // 最終ページ
  }
  summary.cross_companies_scanned = targets.length;
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
