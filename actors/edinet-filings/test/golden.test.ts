import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { expectGolden, loadJsonFixture } from '@jp-opendata/testing';
import { edinetDocumentListSchema } from '@jp-opendata/gov-clients';
import { toBasicItem } from '../src/transform.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, '..', '..', '..', 'packages', 'gov-clients', 'fixtures', 'edinet');
const goldenDir = join(here, 'golden');

describe('edinet-filings golden', () => {
  it('一覧fixture → basicアイテム変換がgoldenと一致する', () => {
    const raw = loadJsonFixture(fixturesDir, 'documents.2026-06-30.spec-based.json');
    const parsed = edinetDocumentListSchema.parse(raw);
    const items = (parsed.results ?? []).map((doc) =>
      toBasicItem(doc, {
        sourceUrl: 'https://api.edinet-fsa.go.jp/api/v2/documents.json?date=2026-06-30&type=2',
        retrievedAt: '2026-07-07T00:00:00+09:00',
      }),
    );
    expect(items).toHaveLength(3);
    expectGolden(goldenDir, 'documents.2026-06-30.basic.json', items);
  });
});
