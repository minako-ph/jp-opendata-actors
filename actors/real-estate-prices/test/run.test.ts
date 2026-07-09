import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { expectGolden, loadJsonFixture } from '@jp-opendata/testing';
import { createBilling } from '@jp-opendata/billing';
import {
  HttpStatusError,
  xit001ResponseSchema,
  xit002ResponseSchema,
  type HttpStats,
  type ReinfolibMunicipalitiesResult,
  type ReinfolibTransactionQuery,
  type ReinfolibTransactionsResult,
} from '@jp-opendata/gov-clients';
import {
  RunFailedError,
  runRealEstatePrices,
  type ReinfolibClientLike,
  type RunLogger,
} from '../src/run.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(
  here,
  '..',
  '..',
  '..',
  'packages',
  'gov-clients',
  'fixtures',
  'reinfolib',
);
const goldenDir = join(here, 'golden');

const NO_DRIFT = { unknownFields: [], missingFields: [], hasDrift: false };
const ZERO_STATS: HttpStats = { requests: 0, failures: 0, rateLimitHits: 0, retries: 0 };

function transactionsResult(
  lang: 'ja' | 'en',
  query: ReinfolibTransactionQuery,
): ReinfolibTransactionsResult {
  const parsed = xit001ResponseSchema.parse(
    loadJsonFixture(fixturesDir, `XIT001.13101-2024.${lang}.json`),
  );
  return {
    records: parsed.data ?? [],
    drift: NO_DRIFT,
    publicUrl: `https://www.reinfolib.mlit.go.jp/ex-api/external/XIT001?year=${query.year}&area=13&city=13101&language=${lang}`,
  };
}

function municipalitiesResult(lang: 'ja' | 'en'): ReinfolibMunicipalitiesResult {
  const parsed = xit002ResponseSchema.parse(loadJsonFixture(fixturesDir, `XIT002.13.${lang}.json`));
  return {
    municipalities: parsed.data ?? [],
    drift: NO_DRIFT,
    publicUrl: `https://www.reinfolib.mlit.go.jp/ex-api/external/XIT002?area=13&language=${lang}`,
  };
}

function fixtureClient(): ReinfolibClientLike & { queries: ReinfolibTransactionQuery[] } {
  const queries: ReinfolibTransactionQuery[] = [];
  return {
    queries,
    listTransactions: async (query) => {
      queries.push(query);
      return transactionsResult(query.language, query);
    },
    listMunicipalities: async (_area, language) => municipalitiesResult(language),
    getHttpStats: () => ZERO_STATS,
  };
}

function makeDeps(client: ReinfolibClientLike, freeAllowance?: number) {
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
    billing: createBilling(
      { charge },
      freeAllowance === undefined
        ? undefined
        : { freeAllowance: { 'record-basic': freeAllowance } },
    ),
    pushData: async (item: Record<string, unknown>) => {
      pushed.push(item);
    },
    log,
    retrievedAt: '2026-07-09T00:00:00+09:00',
    alert,
  };
  return { deps, pushed, warnings, charge, alert };
}

describe('runRealEstatePrices', () => {
  it('市名解決→ja/en二重取得→変換→集計がgoldenと一致し、transaction行のみ課金する', async () => {
    const client = fixtureClient();
    const { deps, pushed, charge } = makeDeps(client);
    const summary = await runRealEstatePrices(
      {
        year: 2024,
        prefectures: ['Tokyo'],
        cities: ['Chiyoda'],
        include_aggregates: true,
      },
      deps,
    );
    expect(summary.records_pushed).toBe(4);
    expect(summary.aggregates_pushed).toBe(1); // 4件とも千代田区×2024Q1
    expect(summary.join_mismatches).toBe(0);
    // en→jaの順で二重取得
    expect(client.queries.map((q) => q.language)).toEqual(['en', 'ja']);
    expect(client.queries[0]).toMatchObject({ year: 2024, area: '13', city: '13101' });
    // 課金はtransaction行のみ（集計行は非課金）
    expect(charge).toHaveBeenCalledTimes(4);
    expectGolden(goldenDir, 'run.chiyoda-2024.json', pushed);
  });

  it('prefill相当（Tokyo/Chiyoda/2024）で市名はEN・JAどちらでも解決できる', async () => {
    const { deps } = makeDeps(fixtureClient());
    const summary = await runRealEstatePrices(
      { year: 2024, prefectures: ['東京都'], cities: ['千代田区'] },
      deps,
    );
    expect(summary.records_pushed).toBe(4);
  });

  it('price_category=closedはpriceClassification=02として送る', async () => {
    const client = fixtureClient();
    const { deps } = makeDeps(client);
    await runRealEstatePrices(
      { year: 2024, prefectures: ['13'], cities: ['13101'], price_category: 'closed' },
      deps,
    );
    expect(client.queries[0]?.priceClassification).toBe('02');
  });

  it('property_typesフィルタ（部分一致・大文字小文字不問）', async () => {
    const { deps, pushed } = makeDeps(fixtureClient());
    const summary = await runRealEstatePrices(
      { year: 2024, prefectures: ['Tokyo'], cities: ['13101'], property_types: ['condominium'] },
      deps,
    );
    expect(summary.records_pushed).toBe(2); // 中古マンション等×2
    expect(pushed.every((p) => String(p.property_type).includes('Condominium'))).toBe(true);
  });

  it('FR-C7: 組合せ12超は打ち切り＋警告＋combinations_truncated', async () => {
    const client = fixtureClient();
    const { deps, warnings } = makeDeps(client);
    const prefectures = Array.from({ length: 14 }, (_, i) => String(i + 1).padStart(2, '0'));
    const summary = await runRealEstatePrices(
      { year: 2024, prefectures },
      { ...deps, maxCombinations: 3 },
    );
    expect(summary.combinations_planned).toBe(14);
    expect(summary.combinations_used).toBe(3);
    expect(summary.combinations_truncated).toBe(true);
    expect(warnings.some((w) => w.includes('per-run limit'))).toBe(true);
    // 3組合せ×2言語=6リクエスト
    expect(client.queries).toHaveLength(6);
  });

  it('FR-C8: 対象単位の失敗は継続、認証エラー（401）は実行失敗', async () => {
    const failing: ReinfolibClientLike = {
      listTransactions: async () => {
        throw new HttpStatusError(401, 'https://example.test/x');
      },
      listMunicipalities: async (_a, l) => municipalitiesResult(l),
      getHttpStats: () => ZERO_STATS,
    };
    const { deps } = makeDeps(failing);
    await expect(runRealEstatePrices({ year: 2024, prefectures: ['Tokyo'] }, deps)).rejects.toThrow(
      /authentication failed/,
    );
  });

  it('対象単位の一般エラーはtarget_errorsで継続する', async () => {
    let call = 0;
    const flaky: ReinfolibClientLike = {
      listTransactions: async (query) => {
        call++;
        if (call <= 1) throw new HttpStatusError(500, 'https://example.test/x');
        return transactionsResult(query.language, query);
      },
      listMunicipalities: async (_a, l) => municipalitiesResult(l),
      getHttpStats: () => ZERO_STATS,
    };
    const { deps } = makeDeps(flaky);
    const summary = await runRealEstatePrices(
      { year: 2024, prefectures: ['13', '14'], cities: [] },
      deps,
    );
    expect(summary.target_errors).toBe(1);
    expect(summary.records_pushed).toBe(4); // 2件目の対象は成功
  });

  it('R2-6: 課金上限到達でgraceful終了し、部分データの集計は出さない', async () => {
    const { deps, pushed, warnings } = makeDeps(fixtureClient());
    const limitedBilling = createBilling({
      charge: async () => ({ eventChargeLimitReached: true, chargedCount: 1 }),
    });
    const summary = await runRealEstatePrices(
      { year: 2024, prefectures: ['Tokyo'], cities: ['13101'], include_aggregates: true },
      { ...deps, billing: limitedBilling },
    );
    expect(summary.charge_limit_reached).toBe(true);
    expect(summary.records_pushed).toBe(1);
    expect(summary.aggregates_pushed).toBe(0);
    expect(pushed).toHaveLength(1);
    expect(warnings.some((w) => w.includes('Aggregates skipped'))).toBe(true);
  });

  it('無料枠（freeAllowance）: 先頭N件はActor.chargeを呼ばない', async () => {
    const { deps, charge } = makeDeps(fixtureClient(), 3);
    const summary = await runRealEstatePrices(
      { year: 2024, prefectures: ['Tokyo'], cities: ['13101'] },
      deps,
    );
    expect(summary.records_pushed).toBe(4);
    expect(summary.free_used).toBe(3);
    expect(summary.records_charged).toBe(1);
    expect(charge).toHaveBeenCalledTimes(1);
  });

  it('入力バリデーション: 不正なstation・都道府県・年は実行失敗', async () => {
    const { deps } = makeDeps(fixtureClient());
    await expect(
      runRealEstatePrices({ year: 2024, station: 'Tokyo Station' }, deps),
    ).rejects.toThrow(/6-digit/);
    await expect(
      runRealEstatePrices({ year: 2024, prefectures: ['Atlantis'] }, deps),
    ).rejects.toThrow(/Unknown prefecture/);
    await expect(runRealEstatePrices({ year: 1999, prefectures: ['13'] }, deps)).rejects.toThrow(
      RunFailedError,
    );
    await expect(runRealEstatePrices({ year: 2024 }, deps)).rejects.toThrow(/Specify prefectures/);
  });

  it('ja/en結合サニティ不一致はjoin_mismatchesを数え、*_jaをnullにする', async () => {
    const client: ReinfolibClientLike = {
      listTransactions: async (query) => {
        const result = transactionsResult(query.language, query);
        if (query.language === 'ja') {
          // 先頭レコードの非翻訳フィールドを破壊して不一致を作る
          const [first, ...rest] = result.records;
          if (first) result.records = [{ ...first, TradePrice: '999' }, ...rest];
        }
        return result;
      },
      listMunicipalities: async (_a, l) => municipalitiesResult(l),
      getHttpStats: () => ZERO_STATS,
    };
    const { deps, pushed } = makeDeps(client);
    const summary = await runRealEstatePrices(
      { year: 2024, prefectures: ['13'], cities: ['13101'] },
      deps,
    );
    expect(summary.join_mismatches).toBe(1);
    expect(pushed[0]).toMatchObject({ prefecture_ja: null });
    expect(pushed[1]).toMatchObject({ prefecture_ja: '東京都' });
  });
});
