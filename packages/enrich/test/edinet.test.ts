import { describe, expect, it, vi } from 'vitest';
import {
  EDINET_SUMMARY_SYSTEM_PROMPT,
  EDINET_SUMMARY_TOOL,
  buildEdinetSummaryUserText,
  createEnricher,
  type CreateMessage,
  type EdinetTextSections,
} from '../src/index.js';

const SECTIONS: EdinetTextSections = {
  business: '当社は山口県で放送事業を営む。',
  risks: '広告収入の減少が業績に影響を与えるリスクがある。売上高は4,928,920,000円。',
  segments: '当社は放送事業の単一セグメントである。',
};

const PRICES = { priceInPerMtok: 1, priceOutPerMtok: 5 };

function section(text: string | null, confidence = 0.9) {
  return { text, confidence };
}

function createMessageReturning(
  toolInput: unknown,
  usage = { inputTokens: 1000, cachedInputTokens: 2000, outputTokens: 200 },
) {
  return vi.fn<CreateMessage>().mockResolvedValue({ toolInput, usage });
}

describe('createEnricher', () => {
  it('正常系: fieldsと原価（cache読取0.1×の近似式）を返し、呼び出し形が仕様どおり', async () => {
    const createMessage = createMessageReturning({
      business_overview: section('The company runs a broadcasting business.'),
      key_risks: section('Ad revenue decline is a key risk.'),
      segments: section(null, 0.5),
    });
    const enricher = createEnricher({ ...PRICES, createMessage });

    const result = await enricher(SECTIONS);
    expect(result.fields.business_overview_en).toEqual({
      value: 'The company runs a broadcasting business.',
      confidence: 0.9,
      method: 'llm',
    });
    expect(result.fields.segments_en.value).toBeNull();
    // cost = 1000×$1/M + 2000×$1×0.1/M + 200×$5/M = $0.0022
    expect(result.usage.costUsd).toBeCloseTo(0.0022, 9);
    expect(result.usage.cachedInputTokens).toBe(2000);

    expect(createMessage).toHaveBeenCalledWith({
      model: 'claude-haiku-4-5',
      maxTokens: 1200,
      system: EDINET_SUMMARY_SYSTEM_PROMPT,
      userText: buildEdinetSummaryUserText(SECTIONS),
      tool: EDINET_SUMMARY_TOOL,
    });
    expect(EDINET_SUMMARY_TOOL.name).toBe('emit_summary');
  });

  it('数値混入で原文不一致 → 要約文はフラグのみ（値は残す・null化しない）', async () => {
    const createMessage = createMessageReturning({
      business_overview: section('Sales were approximately 4.9 billion yen.'),
      key_risks: section(null),
      segments: section(null),
    });
    const enricher = createEnricher({ ...PRICES, createMessage });

    const result = await enricher(SECTIONS);
    expect(result.fields.business_overview_en).toEqual({
      value: 'Sales were approximately 4.9 billion yen.',
      confidence: 0.9,
      method: 'llm',
      verification_failed: true,
    });
  });

  it('数値が原文と逐語一致するならフラグなし', async () => {
    const createMessage = createMessageReturning({
      business_overview: section(null),
      key_risks: section('Net sales were 4,928,920,000 yen.'),
      segments: section(null),
    });
    const enricher = createEnricher({ ...PRICES, createMessage });

    const result = await enricher(SECTIONS);
    expect(result.fields.key_risks_en.verification_failed).toBeUndefined();
    expect(result.fields.key_risks_en.value).toContain('4,928,920,000');
  });

  it('API例外はそのままthrow（フォールバックは呼び出し側の責務）', async () => {
    const createMessage = vi.fn<CreateMessage>().mockRejectedValue(new Error('api boom'));
    const enricher = createEnricher({ ...PRICES, createMessage });
    await expect(enricher(SECTIONS)).rejects.toThrow('api boom');
  });

  it('tool出力がスキーマ違反ならthrow', async () => {
    const createMessage = createMessageReturning({ unexpected: true });
    const enricher = createEnricher({ ...PRICES, createMessage });
    await expect(enricher(SECTIONS)).rejects.toThrow();
  });

  it('NOT AVAILABLEなセクションはユーザーテキストで明示される', () => {
    const text = buildEdinetSummaryUserText({ business: '事業内容', risks: null, segments: null });
    expect(text).toContain('## BUSINESS (事業の内容)\n事業内容');
    expect(text).toContain('## RISKS (事業等のリスク)\nNOT AVAILABLE');
  });
});
