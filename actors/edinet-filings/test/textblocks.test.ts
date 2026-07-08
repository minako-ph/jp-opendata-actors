import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadBinaryFixture } from '@jp-opendata/testing';
import { parseEdinetCsvZip } from '@jp-opendata/gov-clients';
import { extractTextBlocks, stripHtml } from '../src/textblocks.js';

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'packages',
  'gov-clients',
  'fixtures',
  'edinet',
);

describe('stripHtml', () => {
  it('タグ・実体参照を除去し連続空白を圧縮する', () => {
    expect(stripHtml('<p>当社は<b>放送事業</b>を営む。&nbsp;売上&amp;利益&#x3042;</p>')).toBe(
      '当社は 放送事業 を営む。 売上&利益あ',
    );
  });
});

describe('extractTextBlocks（実fixture）', () => {
  it('個別提出者（S100YIZC）: 3節すべて取得できる', () => {
    const rows = parseEdinetCsvZip(
      loadBinaryFixture(fixturesDir, 'document.S100YIZC.csv.trimmed.zip'),
    );
    const blocks = extractTextBlocks(rows);
    expect(blocks.business).toContain('放送');
    expect(blocks.risks).not.toBeNull();
    expect(blocks.segments).not.toBeNull();
    // HTMLタグが残っていない
    expect(blocks.business).not.toMatch(/<[^>]+>/);
    expect(blocks.truncated).toBe(false);
  });

  it('連結IFRS提出者（S100YNCJ）: セグメントはIFRS注記のTextBlockから取得し、リスク6,000字で切り詰め', () => {
    const rows = parseEdinetCsvZip(
      loadBinaryFixture(fixturesDir, 'document.S100YNCJ.csv.trimmed.zip'),
    );
    const blocks = extractTextBlocks(rows);
    expect(blocks.segments).not.toBeNull();
    // 原文リスク節は約8,000字 → 上限6,000字で切り詰められる
    expect(blocks.risks).toHaveLength(6000);
    expect(blocks.truncated).toBe(true);
  });

  it('TextBlock行が無い（ファンド等）→ 3節すべてnull', () => {
    const blocks = extractTextBlocks([]);
    expect(blocks).toEqual({ business: null, risks: null, segments: null, truncated: false });
  });
});
