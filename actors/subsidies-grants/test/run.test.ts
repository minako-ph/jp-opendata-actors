import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { expectGolden, loadJsonFixture, loadTextFixture } from '@jp-opendata/testing';
import { createBilling } from '@jp-opendata/billing';
import {
  HttpStatusError,
  gbizEnvelopeSchema,
  gbizHojinProfileSchema,
  gbizSubsidyHojinSchema,
  parseHoujinXml,
  stripNullStrings,
  type GbizinfoResult,
  type GbizinfoSearchQuery,
  type GbizHojinProfile,
  type GbizSubsidyHojin,
  type HoujinNameSearcher,
  type HttpStats,
} from '@jp-opendata/gov-clients';
import {
  MAX_COMPANIES,
  MAX_CROSS_RECORDS,
  RunFailedError,
  runSubsidiesGrants,
  type GbizinfoClientLike,
  type RunLogger,
} from '../src/run.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, '..', '..', '..', 'packages', 'gov-clients', 'fixtures');
const goldenDir = join(here, 'golden');

const NO_DRIFT = { unknownFields: [], missingFields: [], hasDrift: false };
const ZERO_STATS: HttpStats = { requests: 0, failures: 0, rateLimitHits: 0, retries: 0 };

const HITACHI = '7010001008844';
const TOYOTA = '1180301018771';

function subsidiesResult(fixture: string, corp: string): GbizinfoResult<GbizSubsidyHojin> {
  const cleaned = stripNullStrings(loadJsonFixture(join(fixturesDir, 'gbizinfo'), fixture));
  const parsed = gbizEnvelopeSchema(gbizSubsidyHojinSchema).parse(cleaned);
  return {
    id: parsed.id ?? '',
    message: parsed.message ?? '',
    hojinInfos: parsed['hojin-infos'],
    drift: NO_DRIFT,
    publicUrl: `https://api.info.gbiz.go.jp/hojin/v2/hojin/${corp}/subsidy`,
  };
}

function profileResult(fixture: string, query: string): GbizinfoResult<GbizHojinProfile> {
  const cleaned = stripNullStrings(loadJsonFixture(join(fixturesDir, 'gbizinfo'), fixture));
  const parsed = gbizEnvelopeSchema(gbizHojinProfileSchema).parse(cleaned);
  return {
    id: parsed.id ?? '',
    message: parsed.message ?? '',
    hojinInfos: parsed['hojin-infos'],
    drift: NO_DRIFT,
    publicUrl: `https://api.info.gbiz.go.jp/hojin/v2/hojin?${query}`,
  };
}

function fixtureClient(): GbizinfoClientLike & { searches: GbizinfoSearchQuery[] } {
  const searches: GbizinfoSearchQuery[] = [];
  return {
    searches,
    searchHojin: async (query) => {
      searches.push(query);
      if (query.corporateNumber === HITACHI) {
        return profileResult('search.7010001008844.2026-07-10.json', `corporate_number=${HITACHI}`);
      }
      if (query.source === '4') {
        return profileResult('search.source4-ministry26.2026-07-10.json', 'source=4&ministry=26');
      }
      return {
        id: '',
        message: '404 - Not Found.',
        hojinInfos: [],
        drift: NO_DRIFT,
        publicUrl: 'https://api.info.gbiz.go.jp/hojin/v2/hojin?x',
      };
    },
    getSubsidies: async (corp) => {
      if (corp === HITACHI) return subsidiesResult('subsidy.7010001008844.2026-07-10.json', corp);
      if (corp === TOYOTA)
        return subsidiesResult('subsidy.1180301018771.empty.2026-07-10.json', corp);
      throw new HttpStatusError(404, `https://api.info.gbiz.go.jp/hojin/v2/hojin/${corp}/subsidy`);
    },
    getHttpStats: () => ZERO_STATS,
  };
}

function houjinSearcher(): HoujinNameSearcher {
  const parsed = parseHoujinXml(loadTextFixture(join(fixturesDir, 'houjin'), 'name_ver4_x4.xml'));
  return {
    searchByName: async (name) => ({
      header: parsed.header,
      corporations: name.includes('国税商事') ? parsed.corporations : [],
      drift: NO_DRIFT,
      publicUrl: 'https://api.houjin-bangou.nta.go.jp/4/name?name=x&type=12',
      responseType: '12',
    }),
  };
}

function makeDeps(client: GbizinfoClientLike, freeAllowance?: number) {
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
    houjin: houjinSearcher(),
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
    retrievedAt: '2026-07-10T00:00:00+09:00',
    alert,
  };
  return { deps, pushed, warnings, charge, alert };
}

describe('runSubsidiesGrants', () => {
  it('prefill相当（日立製作所）: プロフィール→補助金→変換がgoldenと一致し、subsidy行のみ課金する', async () => {
    const client = fixtureClient();
    const { deps, pushed, charge } = makeDeps(client);
    const summary = await runSubsidiesGrants({ corporate_numbers: [HITACHI] }, deps);
    expect(summary.records_pushed).toBe(5);
    expect(summary.companies_used).toBe(1);
    expect(charge).toHaveBeenCalledTimes(5);
    // 受給者ENはapi_native（検索応答のname_en）
    expect(pushed[0]).toMatchObject({ recipient_name: 'Hitachi, Ltd.' });
    expectGolden(goldenDir, 'run.hitachi.json', pushed);
  });

  it('補助金0件の法人は0レコードで正常終了する', async () => {
    const { deps, pushed } = makeDeps(fixtureClient());
    const summary = await runSubsidiesGrants({ corporate_numbers: [TOYOTA] }, deps);
    expect(summary.records_pushed).toBe(0);
    expect(pushed).toHaveLength(0);
  });

  it('gBizINFO未収載（404）の法人はcompanies_not_foundで継続する', async () => {
    const { deps } = makeDeps(fixtureClient());
    const summary = await runSubsidiesGrants(
      { corporate_numbers: ['9999999999999', HITACHI] },
      deps,
    );
    expect(summary.companies_not_found).toBe(1);
    expect(summary.records_pushed).toBe(5);
  });

  it('company_names: exact解決で取得し、name_resolutionを出力へ付す', async () => {
    const client = fixtureClient();
    const subsMap = new Map([
      ['2040001999902', subsidiesResult('subsidy.7010001008844.2026-07-10.json', '2040001999902')],
    ]);
    const patched: GbizinfoClientLike = {
      ...client,
      getSubsidies: async (corp) => {
        const hit = subsMap.get(corp);
        if (hit) return hit;
        return client.getSubsidies(corp);
      },
      searchHojin: async (query) =>
        query.corporateNumber === '2040001999902'
          ? {
              id: '',
              message: '404 - Not Found.',
              hojinInfos: [],
              drift: NO_DRIFT,
              publicUrl: 'https://api.info.gbiz.go.jp/hojin/v2/hojin?x',
            }
          : client.searchHojin(query),
    };
    const { deps, pushed } = makeDeps(patched);
    const summary = await runSubsidiesGrants({ company_names: ['株式会社国税商事あ'] }, deps);
    expect(summary.names_resolved).toBe(1);
    expect(summary.records_pushed).toBe(5);
    expect(pushed[0]).toMatchObject({
      name_resolution: { input_name: '株式会社国税商事あ', confidence: 'exact' },
      recipient_name: null,
    });
  });

  it('company_names: ambiguous/not_foundは_error行（非課金）で報告して継続する', async () => {
    const { deps, pushed, charge } = makeDeps(fixtureClient());
    const summary = await runSubsidiesGrants(
      { company_names: ['株式会社国税商事', '存在しない会社'] },
      deps,
    );
    expect(summary.names_unresolved).toBe(2);
    expect(summary.records_pushed).toBe(0);
    expect(charge).not.toHaveBeenCalled();
    expect(pushed).toHaveLength(2);
    expect(pushed[0]).toMatchObject({
      name_resolution: { input_name: '株式会社国税商事', confidence: 'ambiguous' },
    });
    expect(pushed[1]).toMatchObject({
      name_resolution: { input_name: '存在しない会社', confidence: 'not_found' },
    });
  });

  it('company_names入力でhoujin未設定（HOUJIN_APP_IDなし）は実行失敗', async () => {
    const { deps } = makeDeps(fixtureClient());
    await expect(
      runSubsidiesGrants({ company_names: ['株式会社国税商事あ'] }, { ...deps, houjin: null }),
    ).rejects.toThrow(/HOUJIN_APP_ID/);
  });

  it('横断検索: ministry→法人検索→法人ごとの補助金取得→府省でレコードを絞る', async () => {
    const client = fixtureClient();
    // 検索が返す5法人のうち日立のみ補助金fixtureを返すようにする
    const patched: GbizinfoClientLike & { searches: GbizinfoSearchQuery[] } = {
      ...client,
      searchHojin: async (query) => {
        client.searches.push(query);
        if (query.source === '4') {
          const base = profileResult('search.source4-ministry26.2026-07-10.json', 'source=4');
          const first = base.hojinInfos[0];
          if (first) {
            base.hojinInfos = [
              { ...first, corporate_number: HITACHI },
              ...base.hojinInfos.slice(1),
            ];
          }
          return base;
        }
        return client.searchHojin(query);
      },
    };
    const { deps, pushed } = makeDeps(patched);
    const summary = await runSubsidiesGrants({ ministry: '資源エネルギー庁' }, deps);
    expect(client.searches[0]).toMatchObject({ source: '4', ministry: '26', page: 1 });
    // 日立の5件中、資源エネルギー庁の2件のみ
    expect(summary.records_pushed).toBe(2);
    expect(pushed.every((p) => p.ministry_ja === '資源エネルギー庁')).toBe(true);
    expect(summary.cross_companies_scanned).toBe(5);
  });

  it('横断検索: 未知のministryは実行失敗', async () => {
    const { deps } = makeDeps(fixtureClient());
    await expect(runSubsidiesGrants({ ministry: '存在しない省' }, deps)).rejects.toThrow(
      /Unknown ministry/,
    );
  });

  it('date_from/toでdate_of_approvalを絞る（範囲外・日付なしは除外）', async () => {
    const { deps } = makeDeps(fixtureClient());
    const summary = await runSubsidiesGrants(
      { corporate_numbers: [HITACHI], date_from: '2022-01-01', date_to: '2022-12-31' },
      deps,
    );
    expect(summary.records_pushed).toBe(4); // 2019-05-10の1件が除外
  });

  it('FR-C7: 対象法人上限で打ち切り＋警告', async () => {
    const { deps, warnings } = makeDeps(fixtureClient());
    const numbers = [HITACHI, TOYOTA, '9999999999999'];
    const summary = await runSubsidiesGrants(
      { corporate_numbers: numbers },
      { ...deps, maxCompanies: 2 },
    );
    expect(summary.companies_truncated).toBe(true);
    expect(summary.companies_used).toBe(2);
    expect(warnings.some((w) => w.includes('per-run limit'))).toBe(true);
  });

  it('FR-C8: 認証エラー（401）は実行失敗', async () => {
    const failing: GbizinfoClientLike = {
      searchHojin: async () => {
        throw new HttpStatusError(401, 'https://example.test/x');
      },
      getSubsidies: async () => {
        throw new HttpStatusError(401, 'https://example.test/x');
      },
      getHttpStats: () => ZERO_STATS,
    };
    const { deps } = makeDeps(failing);
    await expect(runSubsidiesGrants({ corporate_numbers: [HITACHI] }, deps)).rejects.toThrow(
      /authentication failed/,
    );
  });

  it('FR-C8: 法人単位の一般エラーは_error行で継続する', async () => {
    const client = fixtureClient();
    const flaky: GbizinfoClientLike = {
      ...client,
      getSubsidies: async (corp) => {
        if (corp === TOYOTA) throw new HttpStatusError(500, 'https://example.test/x');
        return client.getSubsidies(corp);
      },
    };
    const { deps, pushed } = makeDeps(flaky);
    const summary = await runSubsidiesGrants({ corporate_numbers: [TOYOTA, HITACHI] }, deps);
    expect(summary.record_errors).toBe(1);
    expect(summary.records_pushed).toBe(5);
    expect(pushed.some((p) => typeof p._error === 'string')).toBe(true);
  });

  it('R2-6: 課金上限到達でgraceful終了する', async () => {
    const { deps, pushed } = makeDeps(fixtureClient());
    const limitedBilling = createBilling({
      charge: async () => ({ eventChargeLimitReached: true, chargedCount: 1 }),
    });
    const summary = await runSubsidiesGrants(
      { corporate_numbers: [HITACHI] },
      { ...deps, billing: limitedBilling },
    );
    expect(summary.charge_limit_reached).toBe(true);
    expect(summary.records_pushed).toBe(1);
    expect(pushed).toHaveLength(1);
  });

  it('無料枠（freeAllowance）: 先頭N件はActor.chargeを呼ばない', async () => {
    const { deps, charge } = makeDeps(fixtureClient(), 3);
    const summary = await runSubsidiesGrants({ corporate_numbers: [HITACHI] }, deps);
    expect(summary.records_pushed).toBe(5);
    expect(summary.free_used).toBe(3);
    expect(summary.records_charged).toBe(2);
    expect(charge).toHaveBeenCalledTimes(2);
  });

  it('入力バリデーション: 入力なし・不正な法人番号・不正な日付は実行失敗', async () => {
    const { deps } = makeDeps(fixtureClient());
    await expect(runSubsidiesGrants({}, deps)).rejects.toThrow(/Specify corporate_numbers/);
    await expect(runSubsidiesGrants({ corporate_numbers: ['123'] }, deps)).rejects.toThrow(
      /13-digit/,
    );
    await expect(
      runSubsidiesGrants({ corporate_numbers: [HITACHI], date_from: '2022/01/01' }, deps),
    ).rejects.toThrow(RunFailedError);
  });

  it('既定の上限値はFR-C7の新規定義どおり', () => {
    expect(MAX_COMPANIES).toBe(500);
    expect(MAX_CROSS_RECORDS).toBe(500);
  });
});
