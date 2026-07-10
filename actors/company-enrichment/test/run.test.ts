import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { expectGolden, loadJsonFixture, loadTextFixture } from '@jp-opendata/testing';
import { createBilling } from '@jp-opendata/billing';
import {
  HttpStatusError,
  gbizBasicInfoSchema,
  gbizEnvelopeSchema,
  gbizPatentHojinSchema,
  gbizProcurementHojinSchema,
  gbizSubsidyHojinSchema,
  parseHoujinXml,
  stripNullStrings,
  type GbizinfoResult,
  type HttpStats,
} from '@jp-opendata/gov-clients';
import { z } from '@jp-opendata/schema-buffer';
import {
  MAX_COMPANIES,
  RunFailedError,
  runCompanyEnrichment,
  type CompanyEnricherLike,
  type GbizinfoClientLike,
  type HoujinLookup,
  type RunLogger,
} from '../src/run.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, '..', '..', '..', 'packages', 'gov-clients', 'fixtures');
const goldenDir = join(here, 'golden');

const NO_DRIFT = { unknownFields: [], missingFields: [], hasDrift: false };
const ZERO_STATS: HttpStats = { requests: 0, failures: 0, rateLimitHits: 0, retries: 0 };
const HITACHI = '7010001008844';

function envelope<S extends z.ZodTypeAny>(fixture: string, schema: S, url: string) {
  const cleaned = stripNullStrings(loadJsonFixture(join(fixturesDir, 'gbizinfo'), fixture));
  const parsed = gbizEnvelopeSchema(schema).parse(cleaned);
  return {
    id: parsed.id ?? '',
    message: parsed.message ?? '',
    hojinInfos: parsed['hojin-infos'],
    drift: NO_DRIFT,
    publicUrl: url,
  };
}

function fixtureClient(): GbizinfoClientLike {
  const base = `https://api.info.gbiz.go.jp/hojin/v2/hojin/${HITACHI}`;
  return {
    getBasicInfo: async (corp) => {
      if (corp !== HITACHI) throw new HttpStatusError(404, `${base}`);
      const result: GbizinfoResult<z.infer<typeof gbizBasicInfoSchema>> = envelope(
        'basic.7010001008844.2026-07-10.json',
        gbizBasicInfoSchema,
        base,
      );
      return result;
    },
    getSubsidies: async () =>
      envelope('subsidy.7010001008844.2026-07-10.json', gbizSubsidyHojinSchema, `${base}/subsidy`),
    getProcurements: async () =>
      envelope(
        'procurement.7010001008844.trimmed.2026-07-10.json',
        gbizProcurementHojinSchema,
        `${base}/procurement`,
      ),
    getPatents: async () =>
      envelope(
        'patent.7010001008844.trimmed.2026-07-10.json',
        gbizPatentHojinSchema,
        `${base}/patent`,
      ),
    getHttpStats: () => ZERO_STATS,
  };
}

/**
 * 法人番号Web-APIスタブ。名称検索は公式サンプル、番号指定は実応答fixture
 * （num.7010001008844.2026-07-10.xml・該当法人のみヒット）を返す。
 */
function houjinLookup(): HoujinLookup {
  const byName = parseHoujinXml(loadTextFixture(join(fixturesDir, 'houjin'), 'name_ver4_x4.xml'));
  const byNum = parseHoujinXml(
    loadTextFixture(join(fixturesDir, 'houjin'), 'num.7010001008844.2026-07-10.xml'),
  );
  return {
    searchByName: async (name) => ({
      header: byName.header,
      corporations: name.includes('国税商事') ? byName.corporations : [],
      drift: NO_DRIFT,
      publicUrl: 'https://api.houjin-bangou.nta.go.jp/4/name?name=x&type=12',
      responseType: '12',
    }),
    findByNumbers: async (numbers) => ({
      header: byNum.header,
      corporations: numbers.includes(HITACHI) ? byNum.corporations : [],
      drift: NO_DRIFT,
      publicUrl: `https://api.houjin-bangou.nta.go.jp/4/num?number=${numbers.join(',')}&type=12&history=0`,
      responseType: '12',
    }),
  };
}

function makeDeps(client: GbizinfoClientLike, options?: { enricher?: CompanyEnricherLike }) {
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
    houjin: houjinLookup(),
    billing: createBilling({ charge }),
    pushData: async (item: Record<string, unknown>) => {
      pushed.push(item);
    },
    log,
    retrievedAt: '2026-07-10T00:00:00+09:00',
    enrichModel: 'claude-haiku-4-5',
    ...(options?.enricher ? { enricher: options.enricher } : {}),
  };
  return { deps, pushed, warnings, charge };
}

describe('runCompanyEnrichment', () => {
  it('prefill相当（日立製作所）: basic＋行政実績カウントがgoldenと一致し、record-basicのみ課金する', async () => {
    const { deps, pushed, charge } = makeDeps(fixtureClient());
    const summary = await runCompanyEnrichment({ corporate_numbers: [HITACHI] }, deps);
    expect(summary.records_pushed).toBe(1);
    expect(charge).toHaveBeenCalledTimes(1);
    expect(charge).toHaveBeenCalledWith({ eventName: 'record-basic', count: 1 });
    expect(pushed[0]).toMatchObject({
      name_en: 'Hitachi, Ltd.',
      name_en_method: 'api_native',
      prefecture: 'Tokyo',
      industry: ['Manufacturing'],
      has_subsidy: true,
      subsidy_count: 5,
      has_procurement: true,
      procurement_count: 2,
      patent_count: 2,
    });
    expectGolden(goldenDir, 'run.hitachi.json', pushed);
  });

  it('fieldsでブロックを絞ると未取得ブロックはnull（has_*もnull）', async () => {
    const { deps, pushed } = makeDeps(fixtureClient());
    await runCompanyEnrichment({ corporate_numbers: [HITACHI], fields: ['subsidies'] }, deps);
    expect(pushed[0]).toMatchObject({
      subsidy_count: 5,
      has_procurement: null,
      procurement_count: null,
      patent_count: null,
    });
  });

  it('不正なfieldsは実行失敗', async () => {
    const { deps } = makeDeps(fixtureClient());
    await expect(
      runCompanyEnrichment({ corporate_numbers: [HITACHI], fields: ['everything'] }, deps),
    ).rejects.toThrow(/Unknown field/);
  });

  it('enrich=true: enrichedを同一アイテムに内包し、record-enrichedも課金する', async () => {
    const enricher: CompanyEnricherLike = async () => ({
      fields: {
        business_summary_en: {
          value: 'Hitachi operates digital, energy and mobility businesses.',
          confidence: 0.95,
          method: 'llm',
        },
        name_en: { value: null, confidence: 0.9, method: 'llm' },
      },
      usage: { costUsd: 0.001 },
    });
    const { deps, pushed, charge } = makeDeps(fixtureClient(), { enricher });
    const summary = await runCompanyEnrichment(
      { corporate_numbers: [HITACHI], enrich: true },
      deps,
    );
    expect(summary.enrich_records).toBe(1);
    expect(summary.enrich_cost_usd_avg).toBeCloseTo(0.001, 6);
    expect(pushed[0]?.enriched).toMatchObject({
      model: 'claude-haiku-4-5',
      prompt_version: 'company-enrich-v1',
    });
    expect(charge).toHaveBeenCalledWith({ eventName: 'record-enriched', count: 1 });
  });

  it('enrich=trueでLLM失敗はbasicへフォールバック（enriched:null・enriched課金なし）', async () => {
    const enricher: CompanyEnricherLike = async () => {
      throw new Error('LLM down');
    };
    const { deps, pushed, charge } = makeDeps(fixtureClient(), { enricher });
    const summary = await runCompanyEnrichment(
      { corporate_numbers: [HITACHI], enrich: true },
      deps,
    );
    expect(summary.enrich_failures).toBe(1);
    expect(summary.records_pushed).toBe(1);
    expect(pushed[0]?.enriched).toBeNull();
    expect(charge).toHaveBeenCalledTimes(1); // record-basicのみ
  });

  it('enrich=trueでenricher未設定（ANTHROPIC_API_KEYなし）は実行失敗', async () => {
    const { deps } = makeDeps(fixtureClient());
    await expect(
      runCompanyEnrichment({ corporate_numbers: [HITACHI], enrich: true }, deps),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });

  it('gBizINFO未収載（404）: houjin /4/num フォールバックで基本3情報のみ・source=houjin・record-basic課金', async () => {
    const client = fixtureClient();
    const patched: GbizinfoClientLike = {
      ...client,
      getBasicInfo: async () => {
        throw new HttpStatusError(404, 'https://api.info.gbiz.go.jp/hojin/v2/hojin/x');
      },
    };
    const { deps, pushed, charge } = makeDeps(patched);
    const summary = await runCompanyEnrichment({ corporate_numbers: [HITACHI] }, deps);
    expect(summary.houjin_fallbacks).toBe(1);
    expect(summary.companies_not_found).toBe(0);
    expect(summary.records_pushed).toBe(1);
    expect(charge).toHaveBeenCalledTimes(1);
    expect(charge).toHaveBeenCalledWith({ eventName: 'record-basic', count: 1 });
    expect(pushed[0]).toMatchObject({
      record_type: 'company',
      corporate_number: HITACHI,
      name_ja: '株式会社日立製作所',
      name_kana: 'ヒタチセイサクショ',
      address_ja: '東京都千代田区丸の内１丁目６番６号',
      postal_code: '1000005',
      prefecture: 'Tokyo',
      prefecture_ja: '東京都',
      source: 'houjin',
      // gBizINFO由来フィールドはnull・行政実績カウントも未取得（null）
      name_en: null,
      capital_stock_jpy: null,
      employee_number: null,
      business_summary_ja: null,
      has_subsidy: null,
      subsidy_count: null,
      patent_count: null,
    });
    expect(String(pushed[0]?.attribution)).toContain('国税庁法人番号システム');
    expect(String(pushed[0]?.source_url)).toContain('/4/num');
    expect(pushed[0]?._error).toBeUndefined();
  });

  it('gBizINFO未収載かつレジストリにも無い番号は非課金の_error行で明示する', async () => {
    const { deps, pushed, charge } = makeDeps(fixtureClient());
    const summary = await runCompanyEnrichment(
      { corporate_numbers: ['9999999999999', HITACHI] },
      deps,
    );
    expect(summary.companies_not_found).toBe(1);
    expect(summary.houjin_fallbacks).toBe(0);
    expect(summary.records_pushed).toBe(1);
    expect(charge).toHaveBeenCalledTimes(1);
    expect(pushed[0]).toMatchObject({
      corporate_number: '9999999999999',
      _error:
        'Not covered by gBizINFO (approx. 4M corporations). Not found in the NTA corporate number registry either.',
    });
  });

  it('gBizINFO未収載でhoujin未設定（HOUJIN_APP_IDなし）は従来どおり非課金の_error行', async () => {
    const { deps, pushed, charge } = makeDeps(fixtureClient());
    const summary = await runCompanyEnrichment(
      { corporate_numbers: ['9999999999999'] },
      { ...deps, houjin: null },
    );
    expect(summary.companies_not_found).toBe(1);
    expect(charge).not.toHaveBeenCalled();
    expect(pushed[0]).toMatchObject({
      _error: 'Not covered by gBizINFO (approx. 4M corporations).',
    });
  });

  it('company_names: exact解決＋houjin未設定は実行失敗（#2と同じ確度モデル）', async () => {
    const client = fixtureClient();
    const patched: GbizinfoClientLike = {
      ...client,
      getBasicInfo: async () => client.getBasicInfo(HITACHI),
    };
    const { deps, pushed } = makeDeps(patched);
    const summary = await runCompanyEnrichment({ company_names: ['株式会社国税商事あ'] }, deps);
    expect(summary.names_resolved).toBe(1);
    expect(pushed[0]).toMatchObject({
      name_resolution: { input_name: '株式会社国税商事あ', confidence: 'exact' },
    });

    const { deps: noHoujin } = makeDeps(fixtureClient());
    await expect(
      runCompanyEnrichment(
        { company_names: ['株式会社国税商事あ'] },
        { ...noHoujin, houjin: null },
      ),
    ).rejects.toThrow(/HOUJIN_APP_ID/);
  });

  it('行政実績ブロックの404は当該実績0件として扱う', async () => {
    const client = fixtureClient();
    const patched: GbizinfoClientLike = {
      ...client,
      getPatents: async () => {
        throw new HttpStatusError(404, 'https://example.test/patent');
      },
    };
    const { deps, pushed } = makeDeps(patched);
    const summary = await runCompanyEnrichment({ corporate_numbers: [HITACHI] }, deps);
    expect(summary.block_errors).toBe(0);
    expect(pushed[0]).toMatchObject({ patent_count: 0, has_subsidy: true });
  });

  it('行政実績ブロックの一般エラーはnull＋警告で行は出力する', async () => {
    const client = fixtureClient();
    const patched: GbizinfoClientLike = {
      ...client,
      getProcurements: async () => {
        throw new HttpStatusError(500, 'https://example.test/procurement');
      },
    };
    const { deps, pushed, warnings } = makeDeps(patched);
    const summary = await runCompanyEnrichment({ corporate_numbers: [HITACHI] }, deps);
    expect(summary.block_errors).toBe(1);
    expect(pushed[0]).toMatchObject({ procurement_count: null, subsidy_count: 5 });
    expect(warnings.some((w) => w.includes('procurement'))).toBe(true);
  });

  it('FR-C7: 対象法人上限で打ち切り＋警告', async () => {
    const { deps, warnings } = makeDeps(fixtureClient());
    const summary = await runCompanyEnrichment(
      { corporate_numbers: [HITACHI, '9999999999998', '9999999999999'] },
      { ...deps, maxCompanies: 1 },
    );
    expect(summary.companies_truncated).toBe(true);
    expect(summary.companies_used).toBe(1);
    expect(warnings.some((w) => w.includes('per-run limit'))).toBe(true);
    expect(MAX_COMPANIES).toBe(1000);
  });

  it('FR-C8: 認証エラー（401）は実行失敗・入力なしも実行失敗', async () => {
    const failing: GbizinfoClientLike = {
      ...fixtureClient(),
      getBasicInfo: async () => {
        throw new HttpStatusError(401, 'https://example.test/x');
      },
    };
    const { deps } = makeDeps(failing);
    await expect(runCompanyEnrichment({ corporate_numbers: [HITACHI] }, deps)).rejects.toThrow(
      /authentication failed/,
    );
    await expect(runCompanyEnrichment({}, deps)).rejects.toThrow(RunFailedError);
  });

  it('R2-6: 課金上限到達でgraceful終了する', async () => {
    const { deps } = makeDeps(fixtureClient());
    const limitedBilling = createBilling({
      charge: async () => ({ eventChargeLimitReached: true, chargedCount: 1 }),
    });
    const summary = await runCompanyEnrichment(
      { corporate_numbers: [HITACHI, HITACHI.replace('7', '8')] },
      { ...deps, billing: limitedBilling },
    );
    expect(summary.charge_limit_reached).toBe(true);
    expect(summary.records_pushed).toBe(1);
  });
});
