import type { Billing } from '@jp-opendata/billing';
import type { EdinetEnrichOutcome } from '@jp-opendata/enrich';
import {
  EdinetApiError,
  RateLimitAbortError,
  parseEdinetCsvZip,
  type EdinetCsvRow,
  type EdinetListResult,
} from '@jp-opendata/gov-clients';
import type { HttpStats } from '@jp-opendata/gov-clients';
import { extractFinancials, emptyFinancials } from './financials.js';
import { toBasicItem } from './transform.js';

/**
 * Actor実行コア（Apify SDK非依存・テスト可能）。
 * - FR-C7: 一覧走査は31日分まで・書類取得500件まで。超過はエラーでなく打ち切り＋警告ログ
 * - FR-C8: 1レコードの失敗で実行全体を落とさない。失敗レコードは_error付きで出力し継続。
 *   実行自体の失敗条件は「認証エラー」または「失敗率50%超」
 * - N-4: 実行終端で集計し、失敗率>20%・429/403発生・ドリフト検知のいずれかでアラート
 */

export interface EdinetFilingsInput {
  date_from: string;
  date_to: string;
  doc_types?: string[];
  include_amendments?: boolean;
  edinet_codes?: string[];
  sec_codes?: string[];
  enrich?: boolean;
}

export interface EdinetClientLike {
  listDocuments(date: string): Promise<EdinetListResult>;
  fetchDocument(docId: string, type: 1 | 2 | 5): Promise<Uint8Array>;
  getHttpStats(): Readonly<HttpStats>;
}

export interface RunLogger {
  info(message: string): void;
  warning(message: string): void;
  error(message: string): void;
}

export interface RunSummary {
  days_scanned: number;
  days_truncated: boolean;
  day_errors: number;
  documents_matched: number;
  documents_truncated: boolean;
  records_pushed: number;
  record_errors: number;
  record_failure_rate: number;
  drift_detected: boolean;
  rate_limit_hits: number;
  aborted_by_rate_limit: boolean;
  /** ユーザー設定の課金上限に到達し、部分結果でgraceful終了した（R2-6。エラーではない） */
  charge_limit_reached: boolean;
  /** enrichに成功しenriched課金したレコード数 */
  records_enriched: number;
  /** LLM失敗によりbasicへフォールバックした数（FR-C8。enriched課金なし） */
  enrich_failures: number;
  enrich_input_tokens: number;
  enrich_output_tokens: number;
  /** tokens×ENRICH_PRICE_*の概算原価合計（USD）。R2-2の単価確定の入力 */
  enrich_cost_usd: number;
  /** enrich成功1件あたりの平均原価（USD）。実行終端で算出 */
  enrich_avg_cost_usd: number;
}

/** enrich注入点: 既取得CSVの行からLLMサマリを生成する（実体はmain.tsで合成） */
export type Enricher = (rows: EdinetCsvRow[]) => Promise<EdinetEnrichOutcome>;

export interface RunDeps {
  client: EdinetClientLike;
  billing: Billing;
  pushData: (item: Record<string, unknown>) => Promise<void>;
  log: RunLogger;
  /** 全アイテム共通のretrieved_at（ISO8601） */
  retrievedAt: string;
  /** N-4アラート送信（未設定ならログのみの運用） */
  alert?: (summary: RunSummary) => Promise<void>;
  /** enrich=true時に使うLLMサマリ生成（未設定でenrich要求されたら実行失敗＝設定不備） */
  enrich?: Enricher;
  /** テスト用の上限上書き */
  maxListDays?: number;
  maxDocuments?: number;
}

export const MAX_LIST_DAYS = 31;
export const MAX_DOCUMENTS = 500;
const DEFAULT_DOC_TYPES = ['120', '160'];
const AMENDMENT_DOC_TYPE = '130';

/** 実行全体を失敗させるべきエラー（認証・失敗率超過・レート中断） */
export class RunFailedError extends Error {}

function enumerateDates(from: string, to: string): string[] {
  const dates: string[] = [];
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  for (let t = start; t <= end; t += 86_400_000) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }
  return dates;
}

function validateInput(input: EdinetFilingsInput): void {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(input.date_from) || !datePattern.test(input.date_to)) {
    throw new RunFailedError('date_from and date_to must be YYYY-MM-DD.');
  }
  if (input.date_from > input.date_to) {
    throw new RunFailedError('date_from must be on or before date_to.');
  }
}

function isAuthError(error: unknown): boolean {
  return error instanceof EdinetApiError && (error.statusCode === 401 || error.statusCode === 403);
}

export async function runEdinetFilings(
  input: EdinetFilingsInput,
  deps: RunDeps,
): Promise<RunSummary> {
  validateInput(input);
  const maxDays = deps.maxListDays ?? MAX_LIST_DAYS;
  const maxDocuments = deps.maxDocuments ?? MAX_DOCUMENTS;

  if (input.enrich && deps.enrich === undefined) {
    throw new RunFailedError(
      'enrich=true requires LLM configuration (ANTHROPIC_API_KEY). The Actor is misconfigured — contact the developer.',
    );
  }

  const docTypes = new Set(input.doc_types?.length ? input.doc_types : DEFAULT_DOC_TYPES);
  if (input.include_amendments) docTypes.add(AMENDMENT_DOC_TYPE);
  const edinetCodes = input.edinet_codes?.length ? new Set(input.edinet_codes) : null;
  const secCodes = input.sec_codes?.length ? new Set(input.sec_codes) : null;

  let dates = enumerateDates(input.date_from, input.date_to);
  const daysTruncated = dates.length > maxDays;
  if (daysTruncated) {
    deps.log.warning(
      `Date range covers ${dates.length} days; only the first ${maxDays} days are scanned (per-run limit).`,
    );
    dates = dates.slice(0, maxDays);
  }

  const summary: RunSummary = {
    days_scanned: 0,
    days_truncated: daysTruncated,
    day_errors: 0,
    documents_matched: 0,
    documents_truncated: false,
    records_pushed: 0,
    record_errors: 0,
    record_failure_rate: 0,
    drift_detected: false,
    rate_limit_hits: 0,
    aborted_by_rate_limit: false,
    charge_limit_reached: false,
    records_enriched: 0,
    enrich_failures: 0,
    enrich_input_tokens: 0,
    enrich_output_tokens: 0,
    enrich_cost_usd: 0,
    enrich_avg_cost_usd: 0,
  };

  try {
    const matched: Array<{ doc: EdinetListResult['documents'][number]; sourceUrl: string }> = [];

    for (const date of dates) {
      let list: EdinetListResult;
      try {
        list = await deps.client.listDocuments(date);
      } catch (error) {
        if (isAuthError(error)) {
          throw new RunFailedError(`EDINET authentication failed: ${String(error)}`);
        }
        if (error instanceof RateLimitAbortError) throw error;
        summary.day_errors++;
        deps.log.warning(`Failed to list documents for ${date}: ${String(error)}`);
        continue;
      }
      summary.days_scanned++;
      if (list.drift.hasDrift) {
        summary.drift_detected = true;
        deps.log.warning(
          `Schema drift detected on ${date}: unknown=${list.drift.unknownFields.join(',')} missing=${list.drift.missingFields.join(',')}`,
        );
      }
      for (const doc of list.documents) {
        if (doc.docTypeCode === null || !docTypes.has(doc.docTypeCode)) continue;
        if (edinetCodes && (doc.edinetCode === null || !edinetCodes.has(doc.edinetCode))) continue;
        if (secCodes && (doc.secCode === null || !secCodes.has(doc.secCode))) continue;
        if (matched.length >= maxDocuments) {
          summary.documents_truncated = true;
          continue;
        }
        matched.push({ doc, sourceUrl: list.publicUrl });
      }
      if (summary.documents_truncated) {
        deps.log.warning(
          `More than ${maxDocuments} matching documents; processing is capped at ${maxDocuments} (per-run limit).`,
        );
        break;
      }
    }

    summary.documents_matched = matched.length;

    for (const { doc, sourceUrl } of matched) {
      const basic = toBasicItem(doc, { sourceUrl, retrievedAt: deps.retrievedAt });
      try {
        const rows: EdinetCsvRow[] =
          doc.csvFlag === '1'
            ? parseEdinetCsvZip(await deps.client.fetchDocument(doc.docID, 5))
            : [];
        const financials = rows.length > 0 ? extractFinancials(rows) : emptyFinancials();

        // enrich: LLM失敗は該当docをbasicのみで出力して継続（FR-C8。enriched課金なし）
        let enrichOutcome: EdinetEnrichOutcome | null = null;
        if (input.enrich && deps.enrich) {
          try {
            const candidate = await deps.enrich(rows);
            if (candidate.invoked) {
              enrichOutcome = candidate;
              summary.enrich_input_tokens += candidate.usage.inputTokens;
              summary.enrich_output_tokens += candidate.usage.outputTokens;
              summary.enrich_cost_usd += candidate.usage.costUsd;
            }
          } catch (error) {
            summary.enrich_failures++;
            deps.log.warning(
              `Enrichment failed for ${doc.docID}; falling back to basic: ${String(error)}`,
            );
          }
        }

        await deps.pushData(
          enrichOutcome === null
            ? { ...basic, financials }
            : { ...basic, financials, ...enrichOutcome.enrichment },
        );
        const outcome = await deps.billing.charge('record-basic');
        summary.records_pushed++;
        let limitReached = outcome.limitReached;
        if (enrichOutcome !== null) {
          // 成功レコードのみenriched課金（freeAllowanceは適用しない＝main.tsで設定しない）
          const enrichedCharge = await deps.billing.charge('record-enriched');
          summary.records_enriched++;
          limitReached = limitReached || enrichedCharge.limitReached;
        }
        if (limitReached) {
          // R2-6: ユーザー設定の最大課金額に到達 → 部分結果＋状態メッセージでgracefulに終了
          summary.charge_limit_reached = true;
          deps.log.warning('Max charge limit reached; stopping gracefully with partial results.');
          break;
        }
      } catch (error) {
        if (isAuthError(error)) {
          throw new RunFailedError(`EDINET authentication failed: ${String(error)}`);
        }
        if (error instanceof RateLimitAbortError) throw error;
        summary.record_errors++;
        deps.log.warning(`Failed to process document ${doc.docID}: ${String(error)}`);
        // FR-C8: 失敗レコードは_error付きで出力して継続（課金しない）
        await deps.pushData({ ...basic, financials: emptyFinancials(), _error: String(error) });
      }
    }
  } catch (error) {
    if (error instanceof RateLimitAbortError) {
      // N-1/§9: バックオフ3回で当該実行を中断しアラート
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

/** 実行終端の集計とN-4アラート判定。戻り値: 失敗率50%超で実行を失敗させるべきか */
async function finalizeSummary(
  summary: RunSummary,
  deps: RunDeps,
  forceAlert: boolean,
): Promise<boolean> {
  const processed = summary.records_pushed + summary.record_errors;
  summary.record_failure_rate = processed === 0 ? 0 : summary.record_errors / processed;
  summary.rate_limit_hits = deps.client.getHttpStats().rateLimitHits;

  // R2-2: enriched単価確定の入力として平均原価を実行終端でログ出力する
  summary.enrich_cost_usd = Number(summary.enrich_cost_usd.toFixed(6));
  summary.enrich_avg_cost_usd =
    summary.records_enriched === 0
      ? 0
      : Number((summary.enrich_cost_usd / summary.records_enriched).toFixed(6));
  if (summary.records_enriched > 0) {
    deps.log.info(
      `Enrichment cost: total $${summary.enrich_cost_usd} for ${summary.records_enriched} records (avg $${summary.enrich_avg_cost_usd}/record, in=${summary.enrich_input_tokens} out=${summary.enrich_output_tokens} tokens)`,
    );
  }

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
