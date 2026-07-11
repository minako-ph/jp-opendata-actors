import type { Billing } from '@jp-opendata/billing';
import {
  EdinetApiError,
  RateLimitAbortError,
  parseEdinetCsvZip,
  type EdinetListResult,
  type HttpStats,
} from '@jp-opendata/gov-clients';
import { extractStatements } from './statements.js';
import {
  ANNUAL_REPORT_DOCUMENT_TYPE,
  extractDei,
  toFinancialsItem,
  type DeiMeta,
} from './transform.js';

/**
 * Actor#6 実行コア（Apify SDK非依存・テスト可能。#1と同型）。
 * - 入力（FR6-1）: doc_ids（主経路。#1のdoc_idをそのまま渡す）または date_from/date_to
 *   （＋任意のedinet_codes/sec_codes）。両方指定時はdoc_ids優先
 * - FR6-2: doc_ids経路は一覧APIを呼ばない（1書類=1リクエスト）。日付範囲経路の一覧は
 *   書類発見にのみ使用（対象は120固定＋include_amendmentsで130）
 * - FR-C7: doc_ids 500件/run。日付範囲は一覧走査31日＋マッチ500書類（#1と同一）
 * - FR-C8: 1書類の失敗は_error行（非課金）で継続。認証エラー/失敗率50%超のみ実行失敗
 * - 非有報の安全弁: DocumentTypeDEIが「第三号様式」以外なら_error（非課金）でスキップ
 *   （判定手段は実データで確認済み。docs/research/edinet-financial-statements.md）
 */

export interface EdinetFinancialsInput {
  doc_ids?: string[];
  date_from?: string;
  date_to?: string;
  edinet_codes?: string[];
  sec_codes?: string[];
  include_amendments?: boolean;
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
  documents_planned: number;
  documents_truncated: boolean;
  records_pushed: number;
  record_errors: number;
  record_failure_rate: number;
  /** 非有報（DocumentTypeDEI≠第三号様式）でスキップした書類数（非課金・_error行） */
  skipped_non_annual: number;
  records_charged: number;
  free_used: number;
  drift_detected: boolean;
  rate_limit_hits: number;
  aborted_by_rate_limit: boolean;
  charge_limit_reached: boolean;
}

export interface RunDeps {
  client: EdinetClientLike;
  billing: Billing;
  pushData: (item: Record<string, unknown>) => Promise<void>;
  log: RunLogger;
  retrievedAt: string;
  alert?: (summary: RunSummary) => Promise<void>;
  /** テスト用の上限上書き */
  maxListDays?: number;
  maxDocuments?: number;
}

export const MAX_LIST_DAYS = 31;
export const MAX_DOCUMENTS = 500;
const ANNUAL_DOC_TYPE = '120';
const AMENDMENT_DOC_TYPE = '130';
const EDINET_BASE_URL = 'https://api.edinet-fsa.go.jp/api/v2';

export class RunFailedError extends Error {}

/** 書類取得の公開URL（キーなし・経路非依存。FR6-3のsource_url） */
export function documentSourceUrl(docId: string): string {
  return `${EDINET_BASE_URL}/documents/${docId}?type=5`;
}

function isAuthError(error: unknown): boolean {
  return error instanceof EdinetApiError && (error.statusCode === 401 || error.statusCode === 403);
}

function enumerateDates(from: string, to: string): string[] {
  const dates: string[] = [];
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  for (let t = start; t <= end; t += 86_400_000) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }
  return dates;
}

interface ValidatedInput {
  mode: 'doc_ids' | 'date_range';
  docIds: string[];
  dates: string[];
}

function validateInput(input: EdinetFinancialsInput, log: RunLogger): ValidatedInput {
  const docIds = (input.doc_ids ?? []).map((id) => id.trim()).filter((id) => id !== '');
  const hasDates = Boolean(input.date_from) || Boolean(input.date_to);
  if (docIds.length > 0) {
    if (hasDates) {
      log.warning('Both doc_ids and a date range were given; doc_ids takes precedence.');
    }
    const seen = new Set<string>();
    for (const id of docIds) {
      if (!/^[A-Z0-9]{8}$/.test(id)) {
        throw new RunFailedError(`doc_ids must be 8-character EDINET document IDs: "${id}"`);
      }
      seen.add(id);
    }
    return { mode: 'doc_ids', docIds: [...seen], dates: [] };
  }
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!input.date_from || !input.date_to) {
    throw new RunFailedError('Specify doc_ids, or both date_from and date_to.');
  }
  if (!datePattern.test(input.date_from) || !datePattern.test(input.date_to)) {
    throw new RunFailedError('date_from and date_to must be YYYY-MM-DD.');
  }
  if (input.date_from > input.date_to) {
    throw new RunFailedError('date_from must be on or before date_to.');
  }
  return { mode: 'date_range', docIds: [], dates: enumerateDates(input.date_from, input.date_to) };
}

export async function runEdinetFinancials(
  input: EdinetFinancialsInput,
  deps: RunDeps,
): Promise<RunSummary> {
  const validated = validateInput(input, deps.log);
  const maxDays = deps.maxListDays ?? MAX_LIST_DAYS;
  const maxDocuments = deps.maxDocuments ?? MAX_DOCUMENTS;

  const summary: RunSummary = {
    days_scanned: 0,
    days_truncated: false,
    day_errors: 0,
    documents_planned: 0,
    documents_truncated: false,
    records_pushed: 0,
    record_errors: 0,
    record_failure_rate: 0,
    skipped_non_annual: 0,
    records_charged: 0,
    free_used: 0,
    drift_detected: false,
    rate_limit_hits: 0,
    aborted_by_rate_limit: false,
    charge_limit_reached: false,
  };

  try {
    let docIds: string[];
    if (validated.mode === 'doc_ids') {
      docIds = validated.docIds;
      if (docIds.length > maxDocuments) {
        summary.documents_truncated = true;
        deps.log.warning(
          `${docIds.length} doc_ids given; processing is capped at ${maxDocuments} (per-run limit).`,
        );
        docIds = docIds.slice(0, maxDocuments);
      }
    } else {
      docIds = await discoverDocuments(
        input,
        validated.dates,
        maxDays,
        maxDocuments,
        deps,
        summary,
      );
    }
    summary.documents_planned = docIds.length;

    for (const docId of docIds) {
      const stop = await processDocument(docId, deps, summary);
      if (stop) break;
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

/** 日付範囲経路: 一覧APIを書類発見にのみ使用（FR6-2）。対象は120（＋任意で130） */
async function discoverDocuments(
  input: EdinetFinancialsInput,
  dates: string[],
  maxDays: number,
  maxDocuments: number,
  deps: RunDeps,
  summary: RunSummary,
): Promise<string[]> {
  let scanDates = dates;
  if (scanDates.length > maxDays) {
    summary.days_truncated = true;
    deps.log.warning(
      `Date range covers ${scanDates.length} days; only the first ${maxDays} days are scanned (per-run limit).`,
    );
    scanDates = scanDates.slice(0, maxDays);
  }
  const docTypes = new Set([ANNUAL_DOC_TYPE]);
  if (input.include_amendments) docTypes.add(AMENDMENT_DOC_TYPE);
  const edinetCodes = input.edinet_codes?.length ? new Set(input.edinet_codes) : null;
  const secCodes = input.sec_codes?.length ? new Set(input.sec_codes) : null;

  const docIds: string[] = [];
  for (const date of scanDates) {
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
      // ファンド開示（特定有価証券）は対象外（FR6-9③。会社の財務三表を持たない）
      if (doc.fundCode !== null) continue;
      if (edinetCodes && (doc.edinetCode === null || !edinetCodes.has(doc.edinetCode))) continue;
      if (secCodes && (doc.secCode === null || !secCodes.has(doc.secCode))) continue;
      if (docIds.length >= maxDocuments) {
        summary.documents_truncated = true;
        continue;
      }
      docIds.push(doc.docID);
    }
    if (summary.documents_truncated) {
      deps.log.warning(
        `More than ${maxDocuments} matching documents; processing is capped at ${maxDocuments} (per-run limit).`,
      );
      break;
    }
  }
  return docIds;
}

/** 1書類の処理。戻り値: 課金上限到達で実行をgracefulに打ち切るべきか（R2-6） */
async function processDocument(
  docId: string,
  deps: RunDeps,
  summary: RunSummary,
): Promise<boolean> {
  const sourceUrl = documentSourceUrl(docId);
  let dei: DeiMeta;
  let rows;
  try {
    rows = parseEdinetCsvZip(await deps.client.fetchDocument(docId, 5));
    if (rows.length === 0) {
      // CSVなし（csvFlag=0の書類・非XBRL等）はデータ条件として明示行で返す（非課金）
      summary.record_errors++;
      await deps.pushData({
        doc_id: docId,
        _error: 'No CSV financial data is available for this document (type=5 returned no rows).',
      });
      return false;
    }
    dei = extractDei(rows);
  } catch (error) {
    if (isAuthError(error)) {
      throw new RunFailedError(`EDINET authentication failed: ${String(error)}`);
    }
    if (error instanceof RateLimitAbortError) throw error;
    summary.record_errors++;
    deps.log.warning(`Failed to process document ${docId}: ${String(error)}`);
    await deps.pushData({ doc_id: docId, _error: String(error).slice(0, 200) });
    return false;
  }

  // 非有報docIDの安全弁: 様式が確認でき、かつ有報様式でない場合はスキップ（非課金）
  if (dei.documentType !== null && dei.documentType !== ANNUAL_REPORT_DOCUMENT_TYPE) {
    summary.skipped_non_annual++;
    deps.log.warning(
      `Document ${docId} is not an annual securities report (${dei.documentType}); skipped.`,
    );
    await deps.pushData({
      doc_id: docId,
      _error: `Not an annual securities report (form: ${dei.documentType}). Pass doc_ids of annual securities reports (docTypeCode 120/130).`,
    });
    return false;
  }

  const extract = extractStatements(rows);
  const item = toFinancialsItem(dei, extract, {
    docId,
    sourceUrl,
    retrievedAt: deps.retrievedAt,
  });
  await deps.pushData(item);
  summary.records_pushed++;
  const outcome = await deps.billing.charge('record-basic');
  if (outcome.limitReached) {
    summary.charge_limit_reached = true;
    deps.log.warning('Max charge limit reached; stopping gracefully with partial results.');
    return true;
  }
  return false;
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
