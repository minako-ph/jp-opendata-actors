/**
 * 実行コアのE2E実機確認（手動実行。CIに含めない）:
 * 実e-Gov法令API v2に対して runLawsRegulations をprefill相当入力で流し、
 * 「開始から最初の結果まで30秒以内」（marketing.md §6/§11-4）を計測する。課金はモック。
 *
 *   pnpm --filter @jp-opendata/actor-laws-regulations exec esbuild scripts/live-e2e.ts \
 *     --bundle --platform=node --target=node22 --format=esm \
 *     --banner:js="import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);" \
 *     --outfile=dist/live-e2e.mjs --log-level=error \
 *   && node dist/live-e2e.mjs
 */
import { createBilling } from '@jp-opendata/billing';
import { LawsClient } from '@jp-opendata/gov-clients';
import { runLawsRegulations } from '../src/run.js';

const t0 = Date.now();
let firstItemMs: number | null = null;
let pushedCount = 0;

const summary = await runLawsRegulations(
  // prefill相当: 個人情報保護法×最初の5条
  { law_query: '個人情報の保護に関する法律', articles: ['1', '2', '3', '4', '5'] },
  {
    client: new LawsClient(),
    billing: createBilling({ charge: async () => undefined }),
    pushData: async (item) => {
      pushedCount++;
      if (firstItemMs === null) {
        firstItemMs = Date.now() - t0;
        console.log(`[first item +${firstItemMs}ms]`, JSON.stringify(item).slice(0, 300));
      }
    },
    log: {
      info: (m) => console.log(`[info] ${m}`),
      warning: (m) => console.log(`[warn] ${m}`),
      error: (m) => console.log(`[error] ${m}`),
    },
    retrievedAt: new Date().toISOString(),
  },
);

console.log(
  `[e2e] first item at ${firstItemMs}ms (30秒以内が目標) / total ${Date.now() - t0}ms / pushed=${pushedCount}`,
);
console.log(`[e2e] summary=${JSON.stringify(summary)}`);
