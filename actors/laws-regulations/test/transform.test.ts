import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadJsonFixture } from '@jp-opendata/testing';
import { lawDataResponseSchema } from '@jp-opendata/gov-clients';
import { extractArticles, normalizeArticleNumber, textOf } from '../src/transform.js';

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'packages',
  'gov-clients',
  'fixtures',
  'laws',
);

const lawData = lawDataResponseSchema.parse(
  loadJsonFixture(fixturesDir, 'law_data.415AC0000000057.trimmed.2026-07-10.json'),
);

describe('extractArticles', () => {
  it('本則から条を文書順に抽出し、条/項/号のツリーとフラットテキストを組み立てる', () => {
    const articles = extractArticles(lawData.law_full_text);
    expect(articles).toHaveLength(5);
    const first = articles[0];
    expect(first).toMatchObject({
      number: '1',
      display_ja: '第一条',
      caption_ja: '（目的）',
    });
    expect(first?.paragraphs[0]?.text_ja).toContain('この法律は');
    expect(first?.text_ja).toContain('第一条');
    // 第二条（定義）は号を持つ
    const second = articles[1];
    expect(second?.paragraphs.some((p) => p.items.length > 0)).toBe(true);
  });

  it('想定外の構造は空配列（防御的）', () => {
    expect(extractArticles(null)).toEqual([]);
    expect(extractArticles({ tag: 'Law', children: [] })).toEqual([]);
    expect(extractArticles('text')).toEqual([]);
  });
});

describe('textOf', () => {
  it('ルビの読み仮名（Rt）は除外して連結する', () => {
    expect(
      textOf({
        tag: 'Sentence',
        children: ['所轄', { tag: 'Ruby', children: ['庁', { tag: 'Rt', children: ['ちょう'] }] }],
      }),
    ).toBe('所轄庁');
  });
});

describe('normalizeArticleNumber', () => {
  it.each([
    ['1', '1'],
    ['2-2', '2_2'],
    ['2_2', '2_2'],
    ['第一条', '1'],
    ['第二条の二', '2_2'],
    ['第百十二条', '112'],
    ['第2条の3', '2_3'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeArticleNumber(input)).toBe(expected);
  });
  it('解釈できない入力はnull', () => {
    expect(normalizeArticleNumber('第x条')).toBeNull();
    expect(normalizeArticleNumber('')).toBeNull();
    expect(normalizeArticleNumber('abc')).toBeNull();
  });
});
