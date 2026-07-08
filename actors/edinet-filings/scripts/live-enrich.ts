/**
 * enrich実測スクリプト（Phase 1b Step 5。手動実行・CI外・結果はコミットしない）:
 * 要 EDINET_API_KEY / ANTHROPIC_API_KEY（＋任意でENRICH_MODEL, ENRICH_PRICE_IN/OUT）。
 * 指定日（引数。既定はprefill範囲 2026-06-24〜2026-06-30）から**有報10件**を対象に、
 * basic抽出→enrich実行→件別tokens/cost・平均cost・**推奨単価（avg/0.15）**・
 * サンプル出力2件を表示する。dataset書き込み・課金は行わない。
 *
 *   pnpm --filter @jp-opendata/actor-edinet-filings exec esbuild scripts/live-enrich.ts \
 *     --bundle --platform=node --format=esm --outfile=dist/live-enrich.mjs --log-level=error \
 *   && node dist/live-enrich.mjs [date_from] [date_to]
 */
import { ENRICH_DEFAULT_MODEL, createEnricher } from '@jp-opendata/enrich';
import { EdinetClient, parseEdinetCsvZip } from '@jp-opendata/gov-clients';
import { extractTextBlocks } from '../src/textblocks.js';

const edinetKey = process.env.EDINET_API_KEY;
const anthropicKey = process.env.ANTHROPIC_API_KEY;
if (!edinetKey || !anthropicKey) {
  throw new Error('EDINET_API_KEY と ANTHROPIC_API_KEY を設定して実行すること');
}

const dateFrom = process.argv[2] ?? '2026-06-24';
const dateTo = process.argv[3] ?? '2026-06-30';
const TARGET_DOCS = 10;

const client = new EdinetClient({ apiKey: edinetKey });
const model = process.env.ENRICH_MODEL ?? ENRICH_DEFAULT_MODEL;
const enricher = createEnricher({
  apiKey: anthropicKey,
  model,
  priceInPerMtok: Number(process.env.ENRICH_PRICE_IN ?? '1.00'),
  priceOutPerMtok: Number(process.env.ENRICH_PRICE_OUT ?? '5.00'),
});

function enumerateDates(from: string, to: string): string[] {
  const dates: string[] = [];
  for (
    let t = new Date(`${from}T00:00:00Z`).getTime();
    t <= new Date(`${to}T00:00:00Z`).getTime();
    t += 86_400_000
  ) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }
  return dates;
}

// 有報（120・法人・CSVあり）をTARGET_DOCS件集める
const targets: { docId: string; filer: string }[] = [];
for (const date of enumerateDates(dateFrom, dateTo)) {
  if (targets.length >= TARGET_DOCS) break;
  const list = await client.listDocuments(date);
  for (const doc of list.documents) {
    if (targets.length >= TARGET_DOCS) break;
    if (doc.docTypeCode === '120' && doc.fundCode === null && doc.csvFlag === '1') {
      targets.push({ docId: doc.docID, filer: doc.filerName ?? '' });
    }
  }
}
console.log(`[plan] ${dateFrom}..${dateTo} 有報${targets.length}件 model=${model}`);

interface Row {
  docId: string;
  filer: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  costUsd: number;
}
const rows: Row[] = [];
const samples: { filer: string; fields: Record<string, unknown> }[] = [];
let skipped = 0;

for (const { docId, filer } of targets) {
  const csvRows = parseEdinetCsvZip(await client.fetchDocument(docId, 5));
  const blocks = extractTextBlocks(csvRows);
  if (blocks.business === null && blocks.risks === null && blocks.segments === null) {
    skipped++;
    console.log(`[skip] ${docId} ${filer}: TextBlockなし`);
    continue;
  }
  const result = await enricher({
    business: blocks.business,
    risks: blocks.risks,
    segments: blocks.segments,
  });
  rows.push({ docId, filer, ...result.usage });
  console.log(
    `[doc] ${docId} ${filer}: in=${result.usage.inputTokens} cached=${result.usage.cachedInputTokens} out=${result.usage.outputTokens} → $${result.usage.costUsd.toFixed(6)}`,
  );
  if (samples.length < 2) {
    samples.push({ filer, fields: result.fields });
  }
}

if (rows.length === 0) {
  console.log('[result] 対象なし（日付範囲を変えて再実行）');
} else {
  const total = rows.reduce((sum, r) => sum + r.costUsd, 0);
  const avg = total / rows.length;
  console.log(`\n[result] enriched=${rows.length}件 skip=${skipped}件`);
  console.log(`[result] total=$${total.toFixed(6)} avg=$${avg.toFixed(6)}/doc`);
  console.log(
    `[result] 推奨record-enriched単価（85%マージン＝avg/0.15）: $${(avg / 0.15).toFixed(4)}`,
  );
  console.log('\n=== サンプル出力（2件） ===');
  for (const sample of samples) {
    console.log(`--- ${sample.filer} ---`);
    console.log(JSON.stringify(sample.fields, null, 2));
  }
}
