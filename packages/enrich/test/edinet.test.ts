import { describe, expect, it, vi } from 'vitest';
import {
  EDINET_SUMMARY_TOOL,
  buildEdinetSummaryUserText,
  enrichEdinetFiling,
  type EdinetTextSections,
  type LlmInvoke,
  type LlmToolResponse,
} from '../src/edinet.js';

const SECTIONS: EdinetTextSections = {
  business: '当社は山口県で放送事業を営む。主要顧客は架空商事株式会社である。',
  risks: '広告収入の減少が業績に影響を与えるリスクがある。売上高は4,928,920,000円。',
  segments: '当社は放送事業の単一セグメントである。',
};

const PRICES = { usdPerMtokIn: 1, usdPerMtokOut: 5 };

function section(text: string | null, sourceTerms: string[] = [], confidence = 0.9) {
  return { text, source_terms: sourceTerms, confidence };
}

function invokeReturning(input: unknown, usage = { inputTokens: 1000, outputTokens: 200 }) {
  return vi.fn<LlmInvoke>().mockResolvedValue({ input, usage } satisfies LlmToolResponse);
}

describe('enrichEdinetFiling', () => {
  it('照合パス: source_termsと英文中の数値が原文一致なら値を保持し、原価を集計する', async () => {
    const invoke = invokeReturning({
      business_overview: section('The company runs a broadcasting business in Yamaguchi.', [
        '放送事業',
      ]),
      key_risks: section('Net sales were 4,928,920,000 yen; ad revenue decline is a key risk.', [
        '広告収入',
      ]),
      segments: section('The company operates in a single broadcasting segment.', []),
    });

    const result = await enrichEdinetFiling({ sections: SECTIONS, invoke, prices: PRICES });

    expect(result.invoked).toBe(true);
    expect(result.enrichment.business_overview_en).toEqual({
      value: 'The company runs a broadcasting business in Yamaguchi.',
      confidence: 0.9,
      method: 'llm',
    });
    expect(result.enrichment.key_risks_en.value).toContain('4,928,920,000');
    expect(result.enrichment.key_risks_en.verification_failed).toBeUndefined();
    // 原価: 1000×$1/M + 200×$5/M = $0.002
    expect(result.usage.costUsd).toBeCloseTo(0.002, 9);
    // system/tool/temperature相当の呼び出し形も確認
    expect(invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-haiku-4-5',
        tool: EDINET_SUMMARY_TOOL,
        userText: buildEdinetSummaryUserText(SECTIONS),
      }),
    );
  });

  it('照合失敗（source_termsが原文に無い）: null化＋verification_failed（N-9）', async () => {
    const invoke = invokeReturning({
      business_overview: section('Summary based on a hallucinated term.', ['存在しない用語']),
      key_risks: section(null),
      segments: section(null),
    });

    const result = await enrichEdinetFiling({ sections: SECTIONS, invoke, prices: PRICES });
    expect(result.enrichment.business_overview_en).toEqual({
      value: null,
      confidence: 0.9,
      method: 'llm',
      verification_failed: true,
    });
  });

  it('照合失敗（英文中の数値が原文に無い＝丸め）: null化＋verification_failed', async () => {
    const invoke = invokeReturning({
      business_overview: section(null),
      key_risks: section('Net sales were approximately 4.9 billion yen.', []),
      segments: section(null),
    });

    const result = await enrichEdinetFiling({ sections: SECTIONS, invoke, prices: PRICES });
    expect(result.enrichment.key_risks_en.value).toBeNull();
    expect(result.enrichment.key_risks_en.verification_failed).toBe(true);
  });

  it('原文セクションが全て無い場合はLLMを呼ばず全null（invoked=false・課金対象外）', async () => {
    const invoke = vi.fn<LlmInvoke>();
    const result = await enrichEdinetFiling({
      sections: { business: null, risks: null, segments: null },
      invoke,
      prices: PRICES,
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(result.invoked).toBe(false);
    expect(result.usage.costUsd).toBe(0);
    expect(result.enrichment.business_overview_en.value).toBeNull();
  });

  it('tool出力がスキーマ違反ならエラー（呼び出し側でbasicフォールバック）', async () => {
    const invoke = invokeReturning({ unexpected: true });
    await expect(
      enrichEdinetFiling({ sections: SECTIONS, invoke, prices: PRICES }),
    ).rejects.toThrow();
  });

  it('NOT AVAILABLEなセクションはユーザーテキストで明示される', () => {
    const text = buildEdinetSummaryUserText({ business: '事業内容', risks: null, segments: null });
    expect(text).toContain('## BUSINESS (事業の内容)\n事業内容');
    expect(text).toContain('## RISKS (事業等のリスク)\nNOT AVAILABLE');
  });
});
