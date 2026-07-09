/**
 * 実行コアのE2E実機確認（手動実行。CIに含めない）:
 * 実reinfolib APIに対して runRealEstatePrices をprefill相当入力で流し、
 * 「開始から最初の結果まで30秒以内」（marketing.md §6/§11-4）を計測する。課金はモック。
 *
 *   pnpm --filter @jp-opendata/actor-real-estate-prices exec esbuild scripts/live-e2e.ts \
 *     --bundle --platform=node --target=node22 --format=esm --outfile=dist/live-e2e.mjs --log-level=error \
 *   && node dist/live-e2e.mjs
 */
import { createBilling } from '@jp-opendata/billing';
import { ReinfolibClient } from '@jp-opendata/gov-clients';
import { runRealEstatePrices } from '../src/run.js';

const apiKey = process.env.REINFOLIB_API_KEY;
if (!apiKey) throw new Error('REINFOLIB_API_KEY を設定して実行すること');

const t0 = Date.now();
let firstItemMs: number | null = null;
let pushedCount = 0;

const summary = await runRealEstatePrices(
  // prefill相当: 東京都・千代田区・2024（実証済みの組合せ）
  { year: 2024, prefectures: ['Tokyo'], cities: ['Chiyoda'], include_aggregates: true },
  {
    client: new ReinfolibClient({ apiKey }),
    billing: createBilling({ charge: async () => undefined }),
    pushData: async (item) => {
      pushedCount++;
      if (firstItemMs === null) {
        firstItemMs = Date.now() - t0;
        console.log(`[first item +${firstItemMs}ms]`, JSON.stringify(item).slice(0, 200));
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
