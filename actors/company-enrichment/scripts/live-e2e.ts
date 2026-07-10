/**
 * 実行コアのE2E実機確認（手動実行。CIに含めない）:
 * 実gBizINFO APIに対して runCompanyEnrichment をprefill相当入力で流し、
 * 「開始から最初の結果まで30秒以内」（marketing.md §6/§11-4）を計測する。課金はモック。
 *
 *   pnpm --filter @jp-opendata/actor-company-enrichment exec esbuild scripts/live-e2e.ts \
 *     --bundle --platform=node --target=node22 --format=esm \
 *     --banner:js="import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);" \
 *     --outfile=dist/live-e2e.mjs --log-level=error \
 *   && node dist/live-e2e.mjs
 *   （バナー必須: gov-clients経由でCJSのiconv-liteが同梱されるため。decisions 2026-07-09）
 */
import { createBilling } from '@jp-opendata/billing';
import { GbizinfoClient, HoujinClient } from '@jp-opendata/gov-clients';
import { runCompanyEnrichment } from '../src/run.js';

const token = process.env.GBIZINFO_API_TOKEN;
if (!token) throw new Error('GBIZINFO_API_TOKEN を設定して実行すること');
const houjinAppId = process.env.HOUJIN_APP_ID;
const houjinBase = process.env.HOUJIN_API_BASE;

const t0 = Date.now();
let firstItemMs: number | null = null;
let pushedCount = 0;

const summary = await runCompanyEnrichment(
  // prefill相当: 株式会社日立製作所（全ブロック）
  { corporate_numbers: ['7010001008844'] },
  {
    client: new GbizinfoClient({ token }),
    houjin: houjinAppId
      ? new HoujinClient({ id: houjinAppId, ...(houjinBase ? { baseUrl: houjinBase } : {}) })
      : null,
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
