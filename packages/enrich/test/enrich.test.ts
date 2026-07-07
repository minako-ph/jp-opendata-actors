import { describe, expect, it } from 'vitest';
import { applyVerbatimVerification, verifyVerbatim } from '../src/index.js';

const source = '当社の売上高は１，２３４百万円であり、主要顧客は架空商事株式会社である。';

describe('verifyVerbatim', () => {
  it('全半角・カンマ差を吸収して原文一致を検証する', () => {
    expect(verifyVerbatim('1,234百万円', source)).toBe(true);
    expect(verifyVerbatim('架空商事株式会社', source)).toBe(true);
  });
  it('原文に無い候補は不一致', () => {
    expect(verifyVerbatim('5,678百万円', source)).toBe(false);
    expect(verifyVerbatim('', source)).toBe(false);
  });
});

describe('applyVerbatimVerification', () => {
  it('照合失敗した値は null化＋verification_failed', () => {
    const result = applyVerbatimVerification(
      { value: '実在しない株式会社', confidence: 0.9, method: 'llm' },
      source,
    );
    expect(result).toEqual({
      value: null,
      confidence: 0.9,
      method: 'llm',
      verification_failed: true,
    });
  });
  it('照合成功した値はそのまま', () => {
    const field = { value: '架空商事株式会社', confidence: 0.9, method: 'llm' } as const;
    expect(applyVerbatimVerification(field, source)).toEqual(field);
  });
});
