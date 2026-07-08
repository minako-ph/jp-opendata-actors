/**
 * EDINET実疎通検証（手動実行。CIに含めない）:
 *   pnpm --filter @jp-opendata/actor-edinet-filings exec esbuild scripts/live-verify.ts \
 *     --bundle --platform=node --format=esm --outfile=dist/live-verify.mjs && node dist/live-verify.mjs [date]
 * 出力: 一覧件数・ドリフト・所要時間・財務値抽出結果。生応答はOUT_DIRへ保存（キーは含まれない）。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EdinetClient, parseEdinetCsvZip } from '@jp-opendata/gov-clients';
import { extractFinancials } from '../src/financials.js';

const apiKey = process.env.EDINET_API_KEY;
if (!apiKey) throw new Error('EDINET_API_KEY を .env に設定して source してから実行すること');
const outDir = process.env.LIVE_VERIFY_OUT ?? 'dist/live-verify-out';
mkdirSync(outDir, { recursive: true });

const date = process.argv[2] ?? '2026-06-30';
const client = new EdinetClient({ apiKey });

const t0 = Date.now();
const list = await client.listDocuments(date);
const listMs = Date.now() - t0;
console.log(`[list] date=${date} documents=${list.documents.length} elapsed=${listMs}ms`);
console.log(`[list] drift: ${JSON.stringify(list.drift)}`);

const byType = new Map<string, number>();
for (const doc of list.documents) {
  const key = doc.docTypeCode ?? 'null';
  byType.set(key, (byType.get(key) ?? 0) + 1);
}
const typeSummary = [...byType.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .map(([k, v]) => `${k}:${v}`)
  .join(' ');
console.log(`[list] docTypeCode上位: ${typeSummary}`);

writeFileSync(join(outDir, `documents.${date}.raw.json`), JSON.stringify(list, null, 2));

// 有報（120）・法人（fundCodeなし）・CSVありの最初の1件で財務値抽出を実データ検証
const target = list.documents.find(
  (d) => d.docTypeCode === '120' && d.fundCode === null && d.csvFlag === '1',
);
if (!target) {
  console.log('[csv] この日に法人の有報(120, csvFlag=1)なし。別の日付で再実行を推奨');
} else {
  console.log(
    `[csv] target=${target.docID} ${target.filerName} sec=${target.secCode} period=${target.periodStart}..${target.periodEnd}`,
  );
  const t1 = Date.now();
  const zip = await client.fetchDocument(target.docID, 5);
  console.log(`[csv] zip ${zip.byteLength} bytes elapsed=${Date.now() - t1}ms`);
  writeFileSync(join(outDir, `document.${target.docID}.csv.zip`), zip);

  const rows = parseEdinetCsvZip(zip);
  console.log(`[csv] rows=${rows.length}`);
  const interesting = rows.filter(
    (r) =>
      r.elementId.includes('SummaryOfBusinessResults') ||
      r.elementId.includes('NumberOfEmployees') ||
      r.elementId.includes('OperatingIncome') ||
      r.elementId.includes('OperatingProfit'),
  );
  console.log(`[csv] 経営指標等の候補行=${interesting.length}（当期分を表示）`);
  for (const r of interesting.filter((r) => r.relativeFiscalYear === '当期').slice(0, 40)) {
    console.log(
      `  ${r.elementId} | ${r.consolidatedOrNot} | ${r.unit} | ${r.value} | ${r.itemName}`,
    );
  }
  console.log(`[fin] extractFinancials: ${JSON.stringify(extractFinancials(rows))}`);
}

console.log(`[stats] http=${JSON.stringify(client.getHttpStats())}`);
