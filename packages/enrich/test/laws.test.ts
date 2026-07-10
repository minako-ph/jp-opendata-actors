import { describe, expect, it } from 'vitest';
import { createLawsTranslator, verifyDigitsAgainstKanjiSource } from '../src/laws.js';
import type { CreateMessage } from '../src/edinet.js';

const PRICES = { priceInPerMtok: 1, priceOutPerMtok: 5 };
const USAGE = { inputTokens: 2000, cachedInputTokens: 0, outputTokens: 400 };

function messageWith(toolInput: unknown): CreateMessage {
  return async () => ({ toolInput, usage: USAGE });
}

const ARTICLE_INPUT = {
  lawTitleJa: '個人情報の保護に関する法律',
  articleDisplayJa: '第百十二条',
  captionJa: '（罰則）',
  textJa: '第百十二条の規定に違反した者は、十万円以下の過料に処する。',
};

describe('verifyDigitsAgainstKanjiSource', () => {
  it('英訳中の数字列を漢数字正規化済み原文と存在照合する', () => {
    expect(
      verifyDigitsAgainstKanjiSource(
        'A fine of not more than 100,000 yen under Article 112.',
        ARTICLE_INPUT.textJa,
      ),
    ).toBe(true);
    expect(verifyDigitsAgainstKanjiSource('A fine of 500,000 yen.', ARTICLE_INPUT.textJa)).toBe(
      false,
    );
    // 数字を含まない生成文は常に通る
    expect(verifyDigitsAgainstKanjiSource('No numbers here.', ARTICLE_INPUT.textJa)).toBe(true);
  });
});

describe('createLawsTranslator.translateArticle', () => {
  it('数値が原文に存在すればフラグなし、存在しなければフラグのみ（null化しない）', async () => {
    const good = createLawsTranslator({
      ...PRICES,
      createMessage: messageWith({
        translation_en: {
          text: 'Article 112: a civil fine of not more than 100000 yen.',
          confidence: 0.9,
        },
        summary_en: { text: 'Sets a civil fine.', confidence: 0.9 },
      }),
    });
    const okResult = await good.translateArticle(ARTICLE_INPUT);
    expect(okResult.fields.translation_en.verification_failed).toBeUndefined();
    expect(okResult.fields.translation_en.method).toBe('llm');
    // 原価式: 2000×1 + 400×5 = 4000 / 1e6
    expect(okResult.usage.costUsd).toBeCloseTo(0.004, 6);

    const bad = createLawsTranslator({
      ...PRICES,
      createMessage: messageWith({
        translation_en: { text: 'A fine of 999,999 yen.', confidence: 0.9 },
        summary_en: { text: 'Sets a fine.', confidence: 0.9 },
      }),
    });
    const badResult = await bad.translateArticle(ARTICLE_INPUT);
    expect(badResult.fields.translation_en.verification_failed).toBe(true);
    expect(badResult.fields.translation_en.value).toContain('999,999'); // null化しない
  });
});

describe('createLawsTranslator.translateTitle', () => {
  it('題名訳はllmメタ付きで返る', async () => {
    const translator = createLawsTranslator({
      ...PRICES,
      createMessage: messageWith({
        title_en: { text: 'Act on the Protection of Personal Information', confidence: 0.97 },
      }),
    });
    const result = await translator.translateTitle('個人情報の保護に関する法律');
    expect(result.field).toMatchObject({
      value: 'Act on the Protection of Personal Information',
      confidence: 0.97,
      method: 'llm',
    });
  });
});
