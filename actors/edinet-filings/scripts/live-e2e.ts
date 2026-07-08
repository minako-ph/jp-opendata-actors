/**
 * 実行コアのE2E実機確認（手動実行。CIに含めない）:
 * 実EDINET APIに対して runEdinetFilings を小規模（maxDocuments=3）で流し、
 * 「開始から最初の結果まで30秒以内」（marketing.md §11-4 / §6-3）を計測する。
 * 課金はモック（Actor.chargeは使わない）。
 */
import { EdinetClient } from '@jp-opendata/gov-clients';
import { createBilling } from '@jp-opendata/billing';
import { runEdinetFilings } from '../src/run.js';

const apiKey = process.env.EDINET_API_KEY;
if (!apiKey) throw new Error('EDINET_API_KEY を設定して実行すること');

const date = process.argv[2] ?? '2026-06-30';
const t0 = Date.now();
let firstItemMs: number | null = null;
let charged = 0;

const summary = await runEdinetFilings(
  { date_from: date, date_to: date },
  {
    client: new EdinetClient({ apiKey }),
    billing: createBilling({
      charge: async () => {
        charged++;
      },
    }),
    pushData: async (item) => {
      if (firstItemMs === null) firstItemMs = Date.now() - t0;
      console.log(
        `[push +${Date.now() - t0}ms] ${String(item.doc_id)} ${String(item.filer_name_ja)} financials=${JSON.stringify(item.financials)}`,
      );
    },
    log: {
      info: (m) => console.log(`[info] ${m}`),
      warning: (m) => console.log(`[warn] ${m}`),
      error: (m) => console.log(`[error] ${m}`),
    },
    retrievedAt: new Date().toISOString(),
    maxDocuments: 3,
  },
);

console.log(`[e2e] first item at ${firstItemMs}ms (30秒以内が目標) / total ${Date.now() - t0}ms`);
console.log(`[e2e] charged(record-basic)=${charged} summary=${JSON.stringify(summary)}`);
