import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { zipSync } from 'fflate';
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
  MAX_DOCUMENTS,
  MAX_LIST_DAYS,
  RunFailedError,
  runEdinetFinancials,
  type EdinetClientLike,
  type RunLogger,
} from '../src/run.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, '..', '..', '..', 'packages', 'gov-clients', 'fixtures', 'edinet');
const goldenDir = join(here, 'golden');

const NO_DRIFT = { unknownFields: [], missingFields: [], hasDrift: false };
const ZERO_STATS: HttpStats = { requests: 0, failures: 0, rateLimitHits: 0, retries: 0 };
const FIXTURE_DOC_IDS = ['S100YIZC', 'S100YN9E', 'S100YN95', 'S100YNCJ'];

const zipByDocId = new Map<string, Uint8Array>(
  FIXTURE_DOC_IDS.map((docId) => [
    docId,
    loadBinaryFixture(fixturesDir, `document.${docId}.csv.statements.zip`),
  ]),
);

/** 合成CSV zip（UTF-16LE・タブ区切り）。非有報様式・CSVなし等の境界テスト用 */
function syntheticZip(rows: string[][], fileName = 'XBRL_TO_CSV/jpcrp999-test.csv'): Uint8Array {
  const header = [
    '要素ID',
    '項目名',
    'コンテキストID',
    '相対年度',
    '連結・個別',
    '期間・時点',
    'ユニットID',
    '単位',
    '値',
  ];
  const text = [header, ...rows].map((cells) => cells.join('\t')).join('\r\n');
  // UTF-16LE(BOM付き)。実CSVと同エンコーディング
  const content = new Uint8Array(2 + text.length * 2);
  content[0] = 0xff;
  content[1] = 0xfe;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    content[2 + i * 2] = code & 0xff;
    content[3 + i * 2] = code >> 8;
  }
  return zipSync({ [fileName]: content });
}

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

function fixtureClient(overrides?: Partial<EdinetClientLike>): EdinetClientLike {
  return {
    listDocuments: async (date) => fixtureListResult(date),
    fetchDocument: async (docId) => {
      const zip = zipByDocId.get(docId);
      if (zip === undefined) throw new EdinetApiError(404, `not found: ${docId}`);
      return zip;
    },
    getHttpStats: () => ZERO_STATS,
    ...overrides,
  };
}

function makeDeps(client: EdinetClientLike) {
  const pushed: Record<string, unknown>[] = [];
  const warnings: string[] = [];
  const charge = vi.fn().mockResolvedValue(undefined);
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
    retrievedAt: '2026-07-11T00:00:00+09:00',
  };
  return { deps, pushed, warnings, charge };
}

describe('runEdinetFinancials（doc_ids主経路）', () => {
  it('fixture4系統の出力がgoldenと一致し、record-basicを件数分発火する（一覧APIは呼ばない）', async () => {
    const listDocuments = vi.fn(async (date: string) => fixtureListResult(date));
    const { deps, pushed, charge } = makeDeps(fixtureClient({ listDocuments }));
    const summary = await runEdinetFinancials({ doc_ids: FIXTURE_DOC_IDS }, deps);
    expect(listDocuments).not.toHaveBeenCalled();
    expect(summary.records_pushed).toBe(4);
    expect(summary.record_errors).toBe(0);
    expect(charge).toHaveBeenCalledTimes(4);
    expect(charge).toHaveBeenCalledWith({ eventName: 'record-basic', count: 1 });
    expect(pushed[1]).toMatchObject({
      doc_id: 'S100YN9E',
      edinet_code: 'E02385',
      sec_code: '79850',
      filer_name_ja: 'ネポン株式会社',
      filer_name_en: 'NEPON Inc.',
      period_start: '2025-04-01',
      period_end: '2026-03-31',
      accounting_standard: 'jgaap',
      basis: 'consolidated',
      source: 'edinet',
      source_url: 'https://api.edinet-fsa.go.jp/api/v2/documents/S100YN9E?type=5',
    });
    // HTML実体参照のデコード（実データ: MS&amp;AD）
    expect(pushed[3]?.filer_name_en).toBe('MS&AD Insurance Group Holdings, Inc.');
    expectGolden(goldenDir, 'run.doc-ids.json', pushed);
  });

  it('重複doc_idは1回だけ処理する', async () => {
    const { deps, pushed } = makeDeps(fixtureClient());
    const summary = await runEdinetFinancials({ doc_ids: ['S100YN9E', 'S100YN9E'] }, deps);
    expect(summary.records_pushed).toBe(1);
    expect(pushed).toHaveLength(1);
  });

  it('doc_idsと日付範囲の両方指定はdoc_ids優先＋警告', async () => {
    const { deps, warnings } = makeDeps(fixtureClient());
    const summary = await runEdinetFinancials(
      { doc_ids: ['S100YN9E'], date_from: '2026-06-30', date_to: '2026-06-30' },
      deps,
    );
    expect(summary.records_pushed).toBe(1);
    expect(summary.days_scanned).toBe(0);
    expect(warnings.some((w) => w.includes('doc_ids takes precedence'))).toBe(true);
  });

  it('FR-C7: doc_idsは500件で打ち切り＋警告', async () => {
    const { deps, warnings } = makeDeps(fixtureClient());
    const summary = await runEdinetFinancials(
      { doc_ids: ['S100YIZC', 'S100YN9E', 'S100YN95'] },
      { ...deps, maxDocuments: 2 },
    );
    expect(summary.documents_truncated).toBe(true);
    expect(summary.documents_planned).toBe(2);
    expect(warnings.some((w) => w.includes('per-run limit'))).toBe(true);
    expect(MAX_DOCUMENTS).toBe(500);
  });

  it('入力バリデーション: 不正docID・入力なしは実行失敗', async () => {
    const { deps } = makeDeps(fixtureClient());
    await expect(runEdinetFinancials({ doc_ids: ['bad id'] }, deps)).rejects.toThrow(
      RunFailedError,
    );
    await expect(runEdinetFinancials({}, deps)).rejects.toThrow(/doc_ids/);
  });
});

describe('runEdinetFinancials（安全弁・FR-C8）', () => {
  it('非有報（DocumentTypeDEI≠第三号様式）は_error行（非課金）でスキップする', async () => {
    const zip = syntheticZip([
      ['jpdei_cor:DocumentTypeDEI', '様式', 'FilingDateInstant', '', '', '', '', '', '第五号様式'],
    ]);
    const { deps, pushed, charge } = makeDeps(fixtureClient({ fetchDocument: async () => zip }));
    const summary = await runEdinetFinancials({ doc_ids: ['S100XXXX'] }, deps);
    expect(summary.skipped_non_annual).toBe(1);
    expect(summary.records_pushed).toBe(0);
    expect(charge).not.toHaveBeenCalled();
    expect(pushed[0]).toMatchObject({ doc_id: 'S100XXXX' });
    expect(String(pushed[0]?._error)).toContain('第五号様式');
  });

  it('DEIが無い書類は全null＋coverage 0で出力する（判定できない場合は落とさない）', async () => {
    const zip = syntheticZip([
      [
        'jppfs_cor:Assets',
        '資産',
        'CurrentYearInstant',
        '当期末',
        '連結',
        '時点',
        'JPY',
        '円',
        '100',
      ],
    ]);
    const { deps, pushed, charge } = makeDeps(fixtureClient({ fetchDocument: async () => zip }));
    const summary = await runEdinetFinancials({ doc_ids: ['S100XXXX'] }, deps);
    expect(summary.records_pushed).toBe(1);
    expect(charge).toHaveBeenCalledTimes(1);
    expect(pushed[0]).toMatchObject({
      doc_id: 'S100XXXX',
      edinet_code: null,
      accounting_standard: 'jgaap',
      basis: 'consolidated',
    });
  });

  it('CSV行ゼロ（csvFlag=0相当）は_error行（非課金）で継続する', async () => {
    const emptyZip = zipSync({ 'XBRL_TO_CSV/jpaud-test.csv': new Uint8Array([0xff, 0xfe]) });
    const base = fixtureClient();
    const { deps, pushed, charge } = makeDeps({
      ...base,
      fetchDocument: async (docId, type) =>
        docId === 'S100XXXX' ? emptyZip : base.fetchDocument(docId, type),
    });
    const summary = await runEdinetFinancials({ doc_ids: ['S100XXXX', 'S100YN9E'] }, deps);
    expect(summary.record_errors).toBe(1);
    expect(summary.records_pushed).toBe(1);
    expect(charge).toHaveBeenCalledTimes(1);
    expect(String(pushed[0]?._error)).toContain('No CSV financial data');
  });

  it('書類取得404は_error行で継続・認証401は実行失敗', async () => {
    const { deps, pushed } = makeDeps(fixtureClient());
    const summary = await runEdinetFinancials(
      { doc_ids: ['S100ZZZZ', 'S100YN9E'] },
      { ...deps, maxDocuments: 10 },
    );
    expect(summary.record_errors).toBe(1);
    expect(summary.records_pushed).toBe(1);
    expect(String(pushed[0]?._error)).toContain('404');

    const authFail = fixtureClient({
      fetchDocument: async () => {
        throw new EdinetApiError(401, 'unauthorized');
      },
    });
    const { deps: deps2 } = makeDeps(authFail);
    await expect(runEdinetFinancials({ doc_ids: ['S100YN9E'] }, deps2)).rejects.toThrow(
      /authentication failed/,
    );
  });

  it('失敗率50%超で実行失敗（FR-C8）', async () => {
    const { deps } = makeDeps(fixtureClient());
    await expect(
      runEdinetFinancials({ doc_ids: ['S100ZZZ1', 'S100ZZZ2', 'S100YN9E'] }, deps),
    ).rejects.toThrow(/exceeded 50%/);
  });

  it('R2-6: 課金上限到達でgraceful終了する', async () => {
    const { deps } = makeDeps(fixtureClient());
    const limitedBilling = createBilling({
      charge: async () => ({ eventChargeLimitReached: true, chargedCount: 1 }),
    });
    const summary = await runEdinetFinancials(
      { doc_ids: ['S100YIZC', 'S100YN9E'] },
      { ...deps, billing: limitedBilling },
    );
    expect(summary.charge_limit_reached).toBe(true);
    expect(summary.records_pushed).toBe(1);
  });
});

describe('runEdinetFinancials（日付範囲副経路）', () => {
  it('一覧から120・非ファンドのみを対象にする（FR6-2/FR6-9③）', async () => {
    const listDocuments = vi.fn(async (date: string) => fixtureListResult(date));
    const { deps, pushed } = makeDeps(fixtureClient({ listDocuments }));
    const summary = await runEdinetFinancials(
      { date_from: '2026-06-30', date_to: '2026-06-30' },
      deps,
    );
    expect(listDocuments).toHaveBeenCalledTimes(1);
    // 一覧fixtureは4件: 120法人2件（S100YNCJ/S100YIZC）＋ファンド120＋ファンド160 → 2件のみ
    expect(summary.documents_planned).toBe(2);
    expect(summary.records_pushed).toBe(2);
    expect(pushed.map((p) => p.doc_id)).toEqual(['S100YNCJ', 'S100YIZC']);
    expect(MAX_LIST_DAYS).toBe(31);
  });

  it('日付範囲は31日で打ち切り・一覧失敗の日はday_errorsで継続', async () => {
    const listDocuments = vi.fn(async (date: string) => {
      if (date === '2026-06-01') throw new EdinetApiError(500, 'server error');
      return { documents: [], drift: NO_DRIFT, publicUrl: `https://example.test/${date}` };
    });
    const { deps, warnings } = makeDeps(fixtureClient({ listDocuments }));
    const summary = await runEdinetFinancials(
      { date_from: '2026-06-01', date_to: '2026-08-31' },
      { ...deps, maxListDays: 3 },
    );
    expect(summary.days_truncated).toBe(true);
    expect(summary.days_scanned).toBe(2);
    expect(summary.day_errors).toBe(1);
    expect(warnings.some((w) => w.includes('per-run limit'))).toBe(true);
  });
});
