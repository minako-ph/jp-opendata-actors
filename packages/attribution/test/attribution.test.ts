import { describe, expect, it } from 'vitest';
import { ATTRIBUTION_TEXT, withCommonMeta } from '../src/index.js';

describe('withCommonMeta', () => {
  it('FR-C2の共通メタ5項目を付与し、出典文言をsourceから解決する', () => {
    const item = withCommonMeta(
      { doc_id: 'S100TEST' },
      {
        source: 'edinet',
        sourceUrl: 'https://api.edinet-fsa.go.jp/api/v2/documents.json?date=2026-06-30&type=2',
        schemaVersion: '1.0.0',
        retrievedAt: '2026-07-07T00:00:00.000Z',
      },
    );
    expect(item).toEqual({
      doc_id: 'S100TEST',
      source: 'edinet',
      source_url: 'https://api.edinet-fsa.go.jp/api/v2/documents.json?date=2026-06-30&type=2',
      retrieved_at: '2026-07-07T00:00:00.000Z',
      attribution: '出典：金融庁 EDINET',
      schema_version: '1.0.0',
    });
  });

  it('出典文言は逐語定数（改変禁止）', () => {
    expect(ATTRIBUTION_TEXT.houjin).toContain('国税庁によって保証されたものではない');
    expect(ATTRIBUTION_TEXT.reinfolib).toContain('国土交通省不動産情報ライブラリ');
  });
});
