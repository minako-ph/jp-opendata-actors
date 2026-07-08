/**
 * enrichの実LLM品質確認（手動実行。CIに含めない・goldenにもしない）:
 *   要 EDINET_API_KEY / ANTHROPIC_API_KEY（＋任意でENRICH_MODEL, ENRICH_PRICE_IN/OUT）
 *   pnpm --filter @jp-opendata/actor-edinet-filings exec esbuild scripts/live-enrich.ts \
 *     --bundle --platform=node --format=esm --outfile=dist/live-enrich.mjs --log-level=error \
 *   && node dist/live-enrich.mjs [docId]
 * 出力: 抽出セクション長・enrichment（照合結果込み）・tokens/原価（R2-2の単価確定の入力）。
 */
import {
  ENRICH_DEFAULT_MODEL,
  createAnthropicMessagesInvoke,
  enrichEdinetFiling,
} from '@jp-opendata/enrich';
import { EdinetClient, parseEdinetCsvZip } from '@jp-opendata/gov-clients';
import { extractEdinetTextSections } from '../src/enrich-input.js';

const edinetKey = process.env.EDINET_API_KEY;
const anthropicKey = process.env.ANTHROPIC_API_KEY;
if (!edinetKey || !anthropicKey) {
  throw new Error('EDINET_API_KEY と ANTHROPIC_API_KEY を設定して実行すること');
}

const docId = process.argv[2] ?? 'S100YIZC';
const client = new EdinetClient({ apiKey: edinetKey });

console.log(`[fetch] ${docId} type=5`);
const rows = parseEdinetCsvZip(await client.fetchDocument(docId, 5));
const sections = extractEdinetTextSections(rows);
console.log(
  `[sections] business=${sections.business?.length ?? 'null'} risks=${sections.risks?.length ?? 'null'} segments=${sections.segments?.length ?? 'null'} chars`,
);

const result = await enrichEdinetFiling({
  sections,
  invoke: createAnthropicMessagesInvoke({ apiKey: anthropicKey }),
  model: process.env.ENRICH_MODEL ?? ENRICH_DEFAULT_MODEL,
  prices: {
    usdPerMtokIn: Number(process.env.ENRICH_PRICE_IN ?? '1.00'),
    usdPerMtokOut: Number(process.env.ENRICH_PRICE_OUT ?? '5.00'),
  },
});

console.log(JSON.stringify(result.enrichment, null, 2));
console.log(
  `[usage] in=${result.usage.inputTokens} out=${result.usage.outputTokens} tokens → $${result.usage.costUsd.toFixed(6)}/doc（R2-2単価確定の入力）`,
);
