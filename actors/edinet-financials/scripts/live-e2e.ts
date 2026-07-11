/**
 * Actor#6 実機E2E（手動実行。CIに含めない）:
 *   node_modules/.bin/esbuild actors/edinet-financials/scripts/live-e2e.ts \
 *     --bundle --platform=node --format=esm \
 *     --banner:js="import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);" \
 *     --outfile=<out>/live-e2e.mjs && node <out>/live-e2e.mjs [docId...]
 *   日付範囲副経路の疎通（レビューFIX-2）:
 *     node <out>/live-e2e.mjs --from=2026-06-30 --to=2026-06-30 [--max=5]
 * prefill入力（JGAAP連結＋IFRS標準）での実疎通・最初の結果までの時間・抽出結果を確認する。
 * 課金の実挙動はActorローカル実行（ACTOR_TEST_PAY_PER_EVENT=1）側で確認する。
 */
import { performance } from 'node:perf_hooks';
import { createBilling } from '@jp-opendata/billing';
import { EdinetClient } from '@jp-opendata/gov-clients';
import { runEdinetFinancials, type EdinetFinancialsInput } from '../src/run.js';

const apiKey = process.env.EDINET_API_KEY;
if (!apiKey) throw new Error('EDINET_API_KEY を .env に設定して source してから実行すること');

const args = process.argv.slice(2);
const flag = (name: string): string | undefined =>
  args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const from = flag('from');
const to = flag('to');
const max = flag('max');
const docIds = args.filter((a) => !a.startsWith('--'));

const input: EdinetFinancialsInput =
  from !== undefined && to !== undefined
    ? { date_from: from, date_to: to }
    : { doc_ids: docIds.length > 0 ? docIds : ['S100YN9E', 'S100YN95'] };

const t0 = performance.now();
let firstResultMs: number | null = null;
const summary = await runEdinetFinancials(input, {
  client: new EdinetClient({ apiKey }),
  billing: createBilling({ charge: async () => undefined }),
  pushData: async (item) => {
    if (firstResultMs === null) firstResultMs = Math.round(performance.now() - t0);
    console.log(JSON.stringify(item).slice(0, 600));
  },
  log: {
    info: (m) => console.log(`INFO  ${m}`),
    warning: (m) => console.log(`WARN  ${m}`),
    error: (m) => console.log(`ERROR ${m}`),
  },
  retrievedAt: new Date().toISOString(),
  // 実機疎通ではFR-C7上限を小さく上書きできる（例: --max=5。取得リクエストの節約）
  ...(max !== undefined ? { maxDocuments: Number(max) } : {}),
});
console.log(
  `[e2e] first result: ${firstResultMs}ms / total: ${Math.round(performance.now() - t0)}ms`,
);
console.log(`[e2e] summary: ${JSON.stringify(summary)}`);
