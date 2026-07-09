import type { Billing } from '@jp-opendata/billing';
import {
  HttpStatusError,
  RateLimitAbortError,
  type HttpStats,
  type ReinfolibLanguage,
  type ReinfolibMunicipalitiesResult,
  type ReinfolibPriceClassification,
  type ReinfolibTransaction,
  type ReinfolibTransactionQuery,
  type ReinfolibTransactionsResult,
} from '@jp-opendata/gov-clients';
import { buildAggregates } from './aggregate.js';
import { resolvePrefectureCode } from './prefectures.js';
import { toTransactionItem, type TransactionItem } from './transform.js';

/**
 * Actor#3 実行コア（Apify SDK非依存・テスト可能。#1と同型）。
 * - FR-C7: 都道府県×年の組合せ12まで。超過はエラーでなく打ち切り＋警告＋summary.combinations_truncated
 * - FR-C8: 1レコード失敗は_error付きで継続。実行失敗は認証エラーまたは失敗率50%超のみ
 * - 日英は同一クエリのja/en二重取得をindexで結合（TradePrice/MunicipalityCode一致でサニティ確認）
 * - 課金はtransaction行のみ（record-basic）。集計行は非課金。上限到達はgraceful終了（R2-6同型）
 */

export interface RealEstateInput {
  year: number;
  quarter?: number;
  prefectures?: string[];
  cities?: string[];
  station?: string;
  price_category?: 'transaction' | 'closed' | 'both';
  property_types?: string[];
  include_aggregates?: boolean;
}

export interface ReinfolibClientLike {
  listTransactions(query: ReinfolibTransactionQuery): Promise<ReinfolibTransactionsResult>;
  listMunicipalities(
    area: string,
    language: ReinfolibLanguage,
  ): Promise<ReinfolibMunicipalitiesResult>;
  getHttpStats(): Readonly<HttpStats>;
}

export interface RunLogger {
  info(message: string): void;
  warning(message: string): void;
  error(message: string): void;
}

export interface RunSummary {
  year: number;
  combinations_planned: number;
  combinations_used: number;
  combinations_truncated: boolean;
  target_errors: number;
  records_pushed: number;
  record_errors: number;
  record_failure_rate: number;
  records_charged: number;
  free_used: number;
  aggregates_pushed: number;
  join_mismatches: number;
  drift_detected: boolean;
  rate_limit_hits: number;
  aborted_by_rate_limit: boolean;
  charge_limit_reached: boolean;
}

export interface RunDeps {
  client: ReinfolibClientLike;
  billing: Billing;
  pushData: (item: Record<string, unknown>) => Promise<void>;
  log: RunLogger;
  retrievedAt: string;
  alert?: (summary: RunSummary) => Promise<void>;
  /** テスト用の上限上書き */
  maxCombinations?: number;
}

/** FR-C7: 都道府県×年の組合せ上限 */
export const MAX_COMBINATIONS = 12;

export class RunFailedError extends Error {}

interface QueryTarget {
  area?: string;
  city?: string;
  station?: string;
  label: string;
}

function isAuthError(error: unknown): boolean {
  return error instanceof HttpStatusError && (error.status === 401 || error.status === 403);
}

function toPriceClassification(
  category: RealEstateInput['price_category'],
): ReinfolibPriceClassification | undefined {
  if (category === 'transaction') return '01';
  if (category === 'closed') return '02';
  return undefined; // both（既定）
}

function validateInput(input: RealEstateInput): void {
  if (!Number.isInteger(input.year) || input.year < 2005 || input.year > 2100) {
    throw new RunFailedError(
      'year must be an integer of 2005 or later (transaction prices start in 2005).',
    );
  }
  if (
    input.quarter !== undefined &&
    (!Number.isInteger(input.quarter) || input.quarter < 1 || input.quarter > 4)
  ) {
    throw new RunFailedError('quarter must be 1-4.');
  }
  if (input.station !== undefined && input.station !== '' && !/^\d{6}$/.test(input.station)) {
    throw new RunFailedError(
      'station accepts a 6-digit station group code in v1 (station names are not resolved).',
    );
  }
}

/** 市区町村名の照合用正規化（EN: Ward/City/Town/Village接尾辞を除去、JA: 区市町村を除去） */
function normalizeMunicipalityName(name: string): string {
  const lower = name.trim().toLowerCase();
  const enStripped = lower.replace(/\s+(ward|city|town|village)$/, '');
  return enStripped.replace(/[区市町村]$/, '');
}

async function resolveTargets(
  input: RealEstateInput,
  deps: RunDeps,
): Promise<{ targets: QueryTarget[]; driftDetected: boolean }> {
  if (input.station) {
    return {
      targets: [{ station: input.station, label: `station ${input.station}` }],
      driftDetected: false,
    };
  }

  const prefectureCodes: string[] = [];
  for (const raw of input.prefectures ?? []) {
    const code = resolvePrefectureCode(raw);
    if (code === null) {
      throw new RunFailedError(
        `Unknown prefecture: "${raw}" (use an English name like "Tokyo", a Japanese name, or a 2-digit code).`,
      );
    }
    if (!prefectureCodes.includes(code)) prefectureCodes.push(code);
  }

  const cities = (input.cities ?? []).map((c) => c.trim()).filter((c) => c !== '');
  let driftDetected = false;

  if (cities.length > 0) {
    const targets: QueryTarget[] = [];
    // 名称解決用の市区町村一覧キャッシュ（都道府県ごとにja/en各1リクエスト）
    const listsByArea = new Map<
      string,
      { ja: ReinfolibMunicipalitiesResult; en: ReinfolibMunicipalitiesResult }
    >();
    for (const city of cities) {
      if (/^\d{5}$/.test(city)) {
        targets.push({ area: city.slice(0, 2), city, label: `city ${city}` });
        continue;
      }
      if (prefectureCodes.length === 0) {
        throw new RunFailedError(
          `City "${city}" is a name — specify prefectures too so it can be resolved (or use a 5-digit city code).`,
        );
      }
      let resolved: string | null = null;
      for (const area of prefectureCodes) {
        let lists = listsByArea.get(area);
        if (lists === undefined) {
          lists = {
            ja: await deps.client.listMunicipalities(area, 'ja'),
            en: await deps.client.listMunicipalities(area, 'en'),
          };
          listsByArea.set(area, lists);
          driftDetected = driftDetected || lists.ja.drift.hasDrift || lists.en.drift.hasDrift;
        }
        const wanted = normalizeMunicipalityName(city);
        const hit =
          lists.ja.municipalities.find((m) => normalizeMunicipalityName(m.name) === wanted) ??
          lists.en.municipalities.find((m) => normalizeMunicipalityName(m.name) === wanted);
        if (hit) {
          resolved = hit.id;
          break;
        }
      }
      if (resolved === null) {
        throw new RunFailedError(
          `Unknown city: "${city}" (not found in the specified prefectures; use a 5-digit city code).`,
        );
      }
      targets.push({ area: resolved.slice(0, 2), city: resolved, label: `city ${resolved}` });
    }
    return { targets, driftDetected };
  }

  if (prefectureCodes.length === 0) {
    throw new RunFailedError('Specify prefectures, cities (5-digit codes), or a station code.');
  }
  return {
    targets: prefectureCodes.map((area) => ({ area, label: `prefecture ${area}` })),
    driftDetected,
  };
}

export async function runRealEstatePrices(
  input: RealEstateInput,
  deps: RunDeps,
): Promise<RunSummary> {
  validateInput(input);
  const maxCombinations = deps.maxCombinations ?? MAX_COMBINATIONS;
  const priceClassification = toPriceClassification(input.price_category);
  const propertyTypeFilters = (input.property_types ?? [])
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t !== '');

  const summary: RunSummary = {
    year: input.year,
    combinations_planned: 0,
    combinations_used: 0,
    combinations_truncated: false,
    target_errors: 0,
    records_pushed: 0,
    record_errors: 0,
    record_failure_rate: 0,
    records_charged: 0,
    free_used: 0,
    aggregates_pushed: 0,
    join_mismatches: 0,
    drift_detected: false,
    rate_limit_hits: 0,
    aborted_by_rate_limit: false,
    charge_limit_reached: false,
  };

  try {
    const { targets: allTargets, driftDetected } = await resolveTargets(input, deps);
    summary.drift_detected = driftDetected;
    summary.combinations_planned = allTargets.length;

    let targets = allTargets;
    if (targets.length > maxCombinations) {
      summary.combinations_truncated = true;
      deps.log.warning(
        `${targets.length} prefecture/city combinations requested; capped at ${maxCombinations} per run (per-run limit).`,
      );
      targets = targets.slice(0, maxCombinations);
    }
    summary.combinations_used = targets.length;

    const collected: TransactionItem[] = [];
    let aggregateSourceUrl = '';

    outer: for (const target of targets) {
      const baseQuery = {
        year: input.year,
        ...(input.quarter !== undefined ? { quarter: input.quarter } : {}),
        ...(target.area !== undefined ? { area: target.area } : {}),
        ...(target.city !== undefined ? { city: target.city } : {}),
        ...(target.station !== undefined ? { station: target.station } : {}),
        ...(priceClassification !== undefined ? { priceClassification } : {}),
      };
      let en: ReinfolibTransactionsResult;
      let ja: ReinfolibTransactionsResult;
      try {
        en = await deps.client.listTransactions({ ...baseQuery, language: 'en' });
        ja = await deps.client.listTransactions({ ...baseQuery, language: 'ja' });
      } catch (error) {
        if (isAuthError(error)) {
          throw new RunFailedError(`Reinfolib authentication failed: ${String(error)}`);
        }
        if (error instanceof RateLimitAbortError) throw error;
        summary.target_errors++;
        deps.log.warning(`Failed to fetch ${target.label}: ${String(error)}`);
        continue;
      }
      summary.drift_detected = summary.drift_detected || en.drift.hasDrift || ja.drift.hasDrift;
      if (en.drift.hasDrift || ja.drift.hasDrift) {
        deps.log.warning(
          `Schema drift detected on ${target.label}: ${JSON.stringify(en.drift.hasDrift ? en.drift : ja.drift)}`,
        );
      }
      aggregateSourceUrl = en.publicUrl;

      for (let i = 0; i < en.records.length; i++) {
        const enRecord = en.records[i];
        if (enRecord === undefined) continue;
        // ja/en結合サニティ: 非翻訳フィールドの一致で同一レコードであることを確認
        let jaRecord: ReinfolibTransaction | null = ja.records[i] ?? null;
        if (
          jaRecord !== null &&
          (jaRecord.TradePrice !== enRecord.TradePrice ||
            jaRecord.MunicipalityCode !== enRecord.MunicipalityCode)
        ) {
          jaRecord = null;
          summary.join_mismatches++;
        }
        try {
          const item = toTransactionItem(enRecord, jaRecord, {
            sourceUrl: en.publicUrl,
            retrievedAt: deps.retrievedAt,
          });
          if (
            propertyTypeFilters.length > 0 &&
            !propertyTypeFilters.some((f) => item.property_type.toLowerCase().includes(f))
          ) {
            continue;
          }
          await deps.pushData(item);
          const outcome = await deps.billing.charge('record-basic');
          summary.records_pushed++;
          collected.push(item);
          if (outcome.limitReached) {
            summary.charge_limit_reached = true;
            deps.log.warning('Max charge limit reached; stopping gracefully with partial results.');
            break outer;
          }
        } catch (error) {
          summary.record_errors++;
          deps.log.warning(`Failed to process a record in ${target.label}: ${String(error)}`);
          // FR-C8: 失敗レコードは_error付きで出力して継続（課金しない）
          await deps.pushData({
            record_type: 'transaction',
            municipality_code: enRecord.MunicipalityCode,
            period: enRecord.Period,
            _error: String(error).slice(0, 200),
          });
        }
      }
    }

    // 集計（FR-3追加出力・非課金）。課金上限で打ち切った場合は部分データの集計を出さない
    if (input.include_aggregates && !summary.charge_limit_reached && collected.length > 0) {
      const aggregates = buildAggregates(collected, {
        sourceUrl: aggregateSourceUrl,
        retrievedAt: deps.retrievedAt,
      });
      for (const aggregate of aggregates) {
        await deps.pushData(aggregate);
        summary.aggregates_pushed++;
      }
    } else if (input.include_aggregates && summary.charge_limit_reached) {
      deps.log.warning('Aggregates skipped because the run stopped at the charge limit.');
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
