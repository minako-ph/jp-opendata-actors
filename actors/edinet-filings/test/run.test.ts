import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { expectGolden, loadBinaryFixture, loadJsonFixture } from '@jp-opendata/testing';
import { createBilling } from '@jp-opendata/billing';
import {
  EdinetApiError,
  edinetDocumentListSchema,
  type EdinetListResult,
  type HttpStats,
} from '@jp-opendata/gov-clients';
import {
  RunFailedError,
  runEdinetFilings,
  type EdinetClientLike,
  type RunLogger,
} from '../src/run.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, '..', '..', '..', 'packages', 'gov-clients', 'fixtures', 'edinet');
const goldenDir = join(here, 'golden');

const NO_DRIFT = { unknownFields: [], missingFields: [], hasDrift: false };
const ZERO_STATS: HttpStats = { requests: 0, failures: 0, rateLimitHits: 0, retries: 0 };

function fixtureListResult(date: string): EdinetListResult {
  const parsed = edinetDocumentListSchema.parse(
    loadJsonFixture(fixturesDir, 'documents.2026-06-30.json'),
  );
  return {
    documents: parsed.results ?? [],
    drift: NO_DRIFT,
    publicUrl: `https://api.edinet-fsa.go.jp/api/v2/documents.json?date=${date}&type=2`,
  };
}

function emptyListResult(date: string): EdinetListResult {
  return {
    documents: [],
    drift: NO_DRIFT,
    publicUrl: `https://api.edinet-fsa.go.jp/api/v2/documents.json?date=${date}&type=2`,
  };
}

const yizcZip = loadBinaryFixture(fixturesDir, 'document.S100YIZC.csv.trimmed.zip');
const zipByDocId: Record<string, Uint8Array> = {
  S100YNCJ: loadBinaryFixture(fixturesDir, 'document.S100YNCJ.csv.trimmed.zip'),
  S100YIZC: yizcZip,
};
// ファンド等のCSVは未採取のため、スタブでは個別提出者のzipで代用する
const csvZip = yizcZip;
const fetchZip = async (docId: string) => zipByDocId[docId] ?? csvZip;

function makeDeps(client: EdinetClientLike) {
  const pushed: Record<string, unknown>[] = [];
  const warnings: string[] = [];
  const charge = vi.fn().mockResolvedValue(undefined);
  const alert = vi.fn().mockResolvedValue(undefined);
  const log: RunLogger = {
    info: () => undefined,
    warning: (m) => {
      warnings.push(m);
    },
    error: () => undefined,
  };
  const deps = {
    client,
    billing: createBilling({ charge }),
    pushData: async (item: Record<string, unknown>) => {
      pushed.push(item);
    },
    log,
    retrievedAt: '2026-07-07T00:00:00+09:00',
    alert,
  };
  return { deps, pushed, warnings, charge, alert };
}

function fixtureClient(): EdinetClientLike {
  return {
    listDocuments: async (date) => fixtureListResult(date),
    fetchDocument: async (docId) => fetchZip(docId),
    getHttpStats: () => ZERO_STATS,
  };
}

describe('runEdinetFilings', () => {
  it('一覧→財務値抽出→basicアイテム出力がgoldenと一致し、record-basicを件数分発火する', async () => {
    const { deps, pushed, charge } = makeDeps(fixtureClient());
    const summary = await runEdinetFilings(
      { date_from: '2026-06-30', date_to: '2026-06-30' },
      deps,
    );
    expect(summary.records_pushed).toBe(4);
    expect(summary.record_errors).toBe(0);
    expect(charge).toHaveBeenCalledTimes(4);
    expect(charge).toHaveBeenCalledWith({ eventName: 'record-basic', count: 1 });
    expectGolden(goldenDir, 'run.documents.2026-06-30.json', pushed);
  });

  it('sec_codes・doc_typesでフィルタする', async () => {
    const { deps, pushed } = makeDeps(fixtureClient());
    const summary = await runEdinetFilings(
      { date_from: '2026-06-30', date_to: '2026-06-30', sec_codes: ['87250'] },
      deps,
    );
    expect(summary.records_pushed).toBe(1);
    expect(pushed[0]).toMatchObject({ doc_id: 'S100YNCJ', sec_code: '87250' });
  });

  it('FR-C7: 日数上限で走査を打ち切り警告する（エラーにしない）', async () => {
    const scanned: string[] = [];
    const client: EdinetClientLike = {
      listDocuments: async (date) => {
        scanned.push(date);
        return emptyListResult(date);
      },
      fetchDocument: async () => csvZip,
      getHttpStats: () => ZERO_STATS,
    };
    const { deps, warnings } = makeDeps(client);
    const summary = await runEdinetFilings(
      { date_from: '2026-06-01', date_to: '2026-08-31' },
      { ...deps, maxListDays: 5 },
    );
    expect(scanned).toHaveLength(5);
    expect(summary.days_truncated).toBe(true);
    expect(warnings.some((w) => w.includes('per-run limit'))).toBe(true);
  });

  it('FR-C7: 書類件数上限で処理を打ち切り警告する', async () => {
    const { deps } = makeDeps(fixtureClient());
    const summary = await runEdinetFilings(
      { date_from: '2026-06-30', date_to: '2026-06-30' },
      { ...deps, maxDocuments: 2 },
    );
    expect(summary.documents_truncated).toBe(true);
    expect(summary.records_pushed).toBe(2);
  });

  it('FR-C8: レコード失敗は_error付きで出力して継続し、課金しない。失敗率50%超で実行失敗', async () => {
    const client: EdinetClientLike = {
      listDocuments: async (date) => fixtureListResult(date),
      fetchDocument: async () => {
        throw new Error('boom');
      },
      getHttpStats: () => ZERO_STATS,
    };
    const { deps, pushed, charge, alert } = makeDeps(client);
    await expect(
      runEdinetFilings({ date_from: '2026-06-30', date_to: '2026-06-30' }, deps),
    ).rejects.toThrow(RunFailedError);
    expect(pushed).toHaveLength(4);
    expect(pushed.every((item) => typeof item._error === 'string')).toBe(true);
    expect(charge).not.toHaveBeenCalled();
    // 失敗率>20%でN-4アラート
    expect(alert).toHaveBeenCalledOnce();
  });

  it('認証エラーは実行全体を失敗させる（FR-C8）', async () => {
    const client: EdinetClientLike = {
      listDocuments: async () => {
        throw new EdinetApiError(401, 'invalid subscription key');
      },
      fetchDocument: async () => csvZip,
      getHttpStats: () => ZERO_STATS,
    };
    const { deps } = makeDeps(client);
    await expect(
      runEdinetFilings({ date_from: '2026-06-30', date_to: '2026-06-30' }, deps),
    ).rejects.toThrow(/authentication failed/);
  });

  it('N-4: ドリフト検知でアラートを送る（実行は続行）', async () => {
    const client: EdinetClientLike = {
      listDocuments: async (date) => ({
        ...fixtureListResult(date),
        drift: { unknownFields: ['results[].newField'], missingFields: [], hasDrift: true },
      }),
      fetchDocument: async () => csvZip,
      getHttpStats: () => ZERO_STATS,
    };
    const { deps, alert } = makeDeps(client);
    const summary = await runEdinetFilings(
      { date_from: '2026-06-30', date_to: '2026-06-30' },
      deps,
    );
    expect(summary.drift_detected).toBe(true);
    expect(summary.records_pushed).toBe(4);
    expect(alert).toHaveBeenCalledOnce();
  });

  it('入力の日付が不正なら実行失敗', async () => {
    const { deps } = makeDeps(fixtureClient());
    await expect(
      runEdinetFilings({ date_from: '2026/06/30', date_to: '2026-06-30' }, deps),
    ).rejects.toThrow(/YYYY-MM-DD/);
    await expect(
      runEdinetFilings({ date_from: '2026-07-02', date_to: '2026-07-01' }, deps),
    ).rejects.toThrow(/on or before/);
  });

  it('enrich=trueは警告のみで basic を返す（TODO: enrich実装後に接続）', async () => {
    const { deps, warnings } = makeDeps(fixtureClient());
    const summary = await runEdinetFilings(
      { date_from: '2026-06-30', date_to: '2026-06-30', enrich: true },
      deps,
    );
    expect(summary.records_pushed).toBe(4);
    expect(warnings.some((w) => w.includes('not available yet'))).toBe(true);
  });
});
