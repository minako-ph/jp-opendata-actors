import { describe, expect, it } from 'vitest';
import { buildCompanyEnrichUserText, createCompanyEnricher } from '../src/company.js';
import type { CreateMessage } from '../src/edinet.js';

const PRICES = { priceInPerMtok: 1, priceOutPerMtok: 5 };
const USAGE = { inputTokens: 1000, cachedInputTokens: 0, outputTokens: 100 };

function messageWith(toolInput: unknown): CreateMessage {
  return async () => ({ toolInput, usage: USAGE });
}

const HITACHI_INPUT = {
  nameJa: '株式会社日立製作所',
  kana: 'ヒタチセイサクショ',
  nativeNameEn: 'Hitachi, Ltd.',
  businessSummaryJa:
    'デジタルシステム&サービス分野における事業、エナジー分野における事業、モビリティ分野における事業',
  industryEn: ['Manufacturing'],
};

describe('buildCompanyEnrichUserText', () => {
  it('欠損フィールドはNOT AVAILABLEで埋める', () => {
    const text = buildCompanyEnrichUserText({
      nameJa: 'テスト株式会社',
      kana: null,
      nativeNameEn: null,
      businessSummaryJa: null,
      industryEn: [],
    });
    expect(text).toContain('NAME: テスト株式会社');
    expect(text).toContain('KANA: NOT AVAILABLE');
    expect(text).toContain('NATIVE_ENGLISH_NAME: NOT AVAILABLE');
    expect(text).toContain('BUSINESS_SUMMARY: NOT AVAILABLE');
    expect(text).toContain('INDUSTRY: NOT AVAILABLE');
  });
});

describe('createCompanyEnricher', () => {
  it('要約はllmメタ付き・api_nativeがある場合の翻字はnull', async () => {
    const enricher = createCompanyEnricher({
      ...PRICES,
      createMessage: messageWith({
        business_summary_en: {
          text: 'Hitachi operates digital systems, energy and mobility businesses.',
          confidence: 0.95,
        },
        name_en: { text: null, confidence: 0.9 },
      }),
    });
    const result = await enricher(HITACHI_INPUT);
    expect(result.fields.business_summary_en).toMatchObject({
      value: 'Hitachi operates digital systems, energy and mobility businesses.',
      method: 'llm',
    });
    expect(result.fields.business_summary_en.verification_failed).toBeUndefined();
    expect(result.fields.name_en.value).toBeNull();
    // 原価式: 1000×1 + 100×5 = 1500 / 1e6
    expect(result.usage.costUsd).toBeCloseTo(0.0015, 6);
  });

  it('api_nativeが無ければLLM翻字を採用（照合スキップ・自己評価confidence）', async () => {
    const enricher = createCompanyEnricher({
      ...PRICES,
      createMessage: messageWith({
        business_summary_en: { text: null, confidence: 0.5 },
        name_en: { text: 'Kokuzei Shoji Co., Ltd.', confidence: 0.8 },
      }),
    });
    const result = await enricher({
      nameJa: '株式会社国税商事',
      kana: 'コクゼイショウジ',
      nativeNameEn: null,
      businessSummaryJa: null,
      industryEn: [],
    });
    expect(result.fields.name_en).toMatchObject({
      value: 'Kokuzei Shoji Co., Ltd.',
      confidence: 0.8,
      method: 'llm',
    });
  });

  it('api_nativeがあるのにLLMが翻字を返してもnullに落とす', async () => {
    const enricher = createCompanyEnricher({
      ...PRICES,
      createMessage: messageWith({
        business_summary_en: { text: null, confidence: 0.5 },
        name_en: { text: 'Hitachi Seisakusho Co., Ltd.', confidence: 0.8 },
      }),
    });
    const result = await enricher(HITACHI_INPUT);
    expect(result.fields.name_en.value).toBeNull();
  });

  it('要約に原文と不一致の数字列が混入したらフラグのみ（null化しない）', async () => {
    const enricher = createCompanyEnricher({
      ...PRICES,
      createMessage: messageWith({
        business_summary_en: {
          text: 'Hitachi employs 99,999 people in manufacturing.',
          confidence: 0.9,
        },
        name_en: { text: null, confidence: 0.9 },
      }),
    });
    const result = await enricher(HITACHI_INPUT);
    expect(result.fields.business_summary_en.value).toContain('99,999');
    expect(result.fields.business_summary_en.verification_failed).toBe(true);
  });

  it('スキーマ不一致のtool出力はエラー（basicフォールバックは呼び出し側の責務）', async () => {
    const enricher = createCompanyEnricher({
      ...PRICES,
      createMessage: messageWith({ nonsense: true }),
    });
    await expect(enricher(HITACHI_INPUT)).rejects.toThrow();
  });
});
