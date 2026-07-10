import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { expectGolden, loadJsonFixture } from '@jp-opendata/testing';
import { createBilling } from '@jp-opendata/billing';
import { LAWS_TRANSLATION_DISCLAIMER } from '@jp-opendata/attribution';
import {
  lawDataResponseSchema,
  lawsSearchResponseSchema,
  type HttpStats,
  type LawDataResult,
  type LawsSearchResult,
} from '@jp-opendata/gov-clients';
import {
  MAX_ARTICLES,
  RunFailedError,
  runLawsRegulations,
  type LawsClientLike,
  type LawsTranslatorLike,
  type RunLogger,
} from '../src/run.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, '..', '..', '..', 'packages', 'gov-clients', 'fixtures', 'laws');
const goldenDir = join(here, 'golden');

const NO_DRIFT = { unknownFields: [], missingFields: [], hasDrift: false };
const ZERO_STATS: HttpStats = { requests: 0, failures: 0, rateLimitHits: 0, retries: 0 };
const APPI_ID = '415AC0000000057';

function lawDataResult(): LawDataResult {
  const parsed = lawDataResponseSchema.parse(
    loadJsonFixture(fixturesDir, 'law_data.415AC0000000057.trimmed.2026-07-10.json'),
  );
  return {
    data: parsed,
    drift: NO_DRIFT,
    publicUrl: `https://laws.e-gov.go.jp/api/2/law_data/${APPI_ID}?response_format=json`,
    found: true,
  };
}

function searchResult(): LawsSearchResult {
  const parsed = lawsSearchResponseSchema.parse(
    loadJsonFixture(fixturesDir, 'laws.kojin-joho.2026-07-10.json'),
  );
  return {
    totalCount: parsed.total_count,
    laws: parsed.laws ?? [],
    drift: NO_DRIFT,
    publicUrl: 'https://laws.e-gov.go.jp/api/2/laws?law_title=x&response_format=json',
  };
}

function fixtureClient(): LawsClientLike & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    searchLaws: async (query) => {
      calls.push(`search:${query.lawTitle ?? query.lawNum ?? ''}`);
      return searchResult();
    },
    getLawData: async (idOrNum, asof) => {
      calls.push(`data:${idOrNum}:${asof ?? ''}`);
      return lawDataResult();
    },
    getHttpStats: () => ZERO_STATS,
  };
}

function stubTranslator(): LawsTranslatorLike {
  return {
    translateArticle: async (input) => ({
      fields: {
        translation_en: {
          value: `EN translation of ${input.articleDisplayJa}`,
          confidence: 0.9,
          method: 'llm',
        },
        summary_en: { value: 'One sentence.', confidence: 0.9, method: 'llm' },
      },
      usage: { costUsd: 0.002 },
    }),
    translateTitle: async () => ({
      field: {
        value: 'Act on the Protection of Personal Information',
        confidence: 0.95,
        method: 'llm',
      },
      usage: { costUsd: 0.0005 },
    }),
  };
}

function makeDeps(client: LawsClientLike, options?: { translator?: LawsTranslatorLike }) {
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
    retrievedAt: '2026-07-10T00:00:00+09:00',
    translateModel: 'claude-haiku-4-5',
    ...(options?.translator ? { translator: options.translator } : {}),
  };
  return { deps, pushed, warnings, charge };
}

describe('runLawsRegulations', () => {
  it('prefill相当（個人情報保護法・最初の5条）: 名称解決→条抽出→変換がgoldenと一致する', async () => {
    const client = fixtureClient();
    const { deps, pushed, charge } = makeDeps(client);
    const summary = await runLawsRegulations(
      { law_query: '個人情報の保護に関する法律', articles: ['1', '2', '3', '4', '5'] },
      deps,
    );
    expect(summary.records_pushed).toBe(5);
    expect(summary.law_id).toBe(APPI_ID);
    expect(charge).toHaveBeenCalledTimes(5);
    // 名称→検索→law_idで本文取得の2段
    expect(client.calls[0]).toContain('search:');
    expect(client.calls[1]).toBe(`data:${APPI_ID}:`);
    expect(pushed[0]).toMatchObject({
      record_type: 'article',
      law_id: APPI_ID,
      article_number: '1',
      article_display_ja: '第一条',
      article_caption_ja: '（目的）',
      title_en: null,
    });
    expectGolden(goldenDir, 'run.appi-first5.json', pushed);
  });

  it('law_id・法令番号はlaw_dataを直接取得する（検索を挟まない）', async () => {
    const client = fixtureClient();
    const { deps } = makeDeps(client);
    await runLawsRegulations({ law_query: APPI_ID }, deps);
    expect(client.calls[0]).toBe(`data:${APPI_ID}:`);

    const client2 = fixtureClient();
    const { deps: deps2 } = makeDeps(client2);
    await runLawsRegulations({ law_query: '平成十五年法律第五十七号' }, deps2);
    expect(client2.calls[0]).toBe('data:平成十五年法律第五十七号:');
  });

  it('as_of_dateはasofとしてクライアントへ渡す', async () => {
    const client = fixtureClient();
    const { deps } = makeDeps(client);
    await runLawsRegulations({ law_query: APPI_ID, as_of_date: '2020-01-01' }, deps);
    expect(client.calls[0]).toBe(`data:${APPI_ID}:2020-01-01`);
  });

  it('条番号は漢数字・枝番表記も解釈する', async () => {
    const { deps, pushed } = makeDeps(fixtureClient());
    const summary = await runLawsRegulations(
      { law_query: APPI_ID, articles: ['第二条', '第三条'] },
      deps,
    );
    expect(summary.records_pushed).toBe(2);
    expect(pushed.map((p) => p.article_number)).toEqual(['2', '3']);
    await expect(
      runLawsRegulations(
        { law_query: APPI_ID, articles: ['第x条'] },
        makeDeps(fixtureClient()).deps,
      ),
    ).rejects.toThrow(/Cannot interpret/);
  });

  it('translate=true: translated内包・article-translated追加課金・disclaimer・題名訳の複写', async () => {
    const { deps, pushed, charge } = makeDeps(fixtureClient(), { translator: stubTranslator() });
    const summary = await runLawsRegulations(
      { law_query: APPI_ID, articles: ['1', '2'], translate: true },
      deps,
    );
    expect(summary.translated_records).toBe(2);
    // 題名訳1回 + 条訳2回
    expect(summary.translate_cost_usd_total).toBeCloseTo(0.0005 + 0.004, 6);
    expect(charge).toHaveBeenCalledTimes(4); // record-basic×2 + article-translated×2
    const first = pushed[0]?.translated;
    expect(first).toMatchObject({
      disclaimer: LAWS_TRANSLATION_DISCLAIMER,
      prompt_version: 'laws-translate-v1',
      law_title_en: { value: 'Act on the Protection of Personal Information' },
    });
    expect(pushed[1]?.translated).toMatchObject({
      law_title_en: { value: 'Act on the Protection of Personal Information' },
    });
  });

  it('translate=trueで条訳失敗はbasicへフォールバック（translated:null・追加課金なし）', async () => {
    const failing: LawsTranslatorLike = {
      ...stubTranslator(),
      translateArticle: async () => {
        throw new Error('LLM down');
      },
    };
    const { deps, pushed, charge } = makeDeps(fixtureClient(), { translator: failing });
    const summary = await runLawsRegulations(
      { law_query: APPI_ID, articles: ['1'], translate: true },
      deps,
    );
    expect(summary.translate_failures).toBe(1);
    expect(pushed[0]?.translated).toBeNull();
    expect(charge).toHaveBeenCalledTimes(1); // record-basicのみ
  });

  it('translate=trueでtranslator未設定（ANTHROPIC_API_KEYなし）は実行失敗', async () => {
    const { deps } = makeDeps(fixtureClient());
    await expect(runLawsRegulations({ law_query: APPI_ID, translate: true }, deps)).rejects.toThrow(
      /ANTHROPIC_API_KEY/,
    );
  });

  it('FR-C7: 条数上限で打ち切り＋警告', async () => {
    const { deps, warnings } = makeDeps(fixtureClient());
    const summary = await runLawsRegulations({ law_query: APPI_ID }, { ...deps, maxArticles: 3 });
    expect(summary.articles_matched).toBe(5);
    expect(summary.records_pushed).toBe(3);
    expect(summary.articles_truncated).toBe(true);
    expect(warnings.some((w) => w.includes('per-run limit'))).toBe(true);
    expect(MAX_ARTICLES).toBe(200);
  });

  it('law_query必須（全法令ループ禁止の第2層）・不正なas_of_dateは実行失敗', async () => {
    const { deps } = makeDeps(fixtureClient());
    await expect(runLawsRegulations({ law_query: '' }, deps)).rejects.toThrow(/law_query/);
    await expect(
      runLawsRegulations({ law_query: APPI_ID, as_of_date: '2020/01/01' }, deps),
    ).rejects.toThrow(RunFailedError);
  });

  it('曖昧な法令名は候補提示で実行失敗、0件は不一致で実行失敗', async () => {
    const client = fixtureClient();
    const ambiguous: LawsClientLike = {
      ...client,
      searchLaws: async () => {
        const result = searchResult();
        // 完全一致もabbrev一致もしないクエリを想定（3件のまま）
        return result;
      },
    };
    const { deps } = makeDeps(ambiguous);
    await expect(runLawsRegulations({ law_query: '個人情報' }, deps)).rejects.toThrow(
      /matched .* laws/,
    );

    const empty: LawsClientLike = {
      ...client,
      searchLaws: async () => ({ ...searchResult(), laws: [], totalCount: 0 }),
    };
    const { deps: deps2 } = makeDeps(empty);
    await expect(runLawsRegulations({ law_query: '存在しない法' }, deps2)).rejects.toThrow(
      /No law matched/,
    );
  });

  it('R2-6: 課金上限到達でgraceful終了する', async () => {
    const { deps, pushed } = makeDeps(fixtureClient());
    const limitedBilling = createBilling({
      charge: async () => ({ eventChargeLimitReached: true, chargedCount: 1 }),
    });
    const summary = await runLawsRegulations(
      { law_query: APPI_ID },
      { ...deps, billing: limitedBilling },
    );
    expect(summary.charge_limit_reached).toBe(true);
    expect(summary.records_pushed).toBe(1);
    expect(pushed).toHaveLength(1);
  });

  it('無料枠（freeAllowance）: 先頭N条はActor.chargeを呼ばない', async () => {
    const charge = vi.fn().mockResolvedValue(undefined);
    const { deps } = makeDeps(fixtureClient());
    const summary = await runLawsRegulations(
      { law_query: APPI_ID },
      {
        ...deps,
        billing: createBilling({ charge }, { freeAllowance: { 'record-basic': 3 } }),
      },
    );
    expect(summary.records_pushed).toBe(5);
    expect(summary.free_used).toBe(3);
    expect(summary.records_charged).toBe(2);
    expect(charge).toHaveBeenCalledTimes(2);
  });
});
