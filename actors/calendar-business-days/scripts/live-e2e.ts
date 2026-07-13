/**
 * Actor#7 実機E2E（手動実行。CIに含めない）:
 *   node_modules/.bin/esbuild actors/calendar-business-days/scripts/live-e2e.ts \
 *     --bundle --platform=node --format=esm \
 *     --banner:js="import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);" \
 *     --outfile=<out>/live-e2e.mjs && node <out>/live-e2e.mjs
 * prefill入力（date_info×固定4日付）での疎通・最初の結果までの時間を確認する（30秒以内が目標）。
 * 課金の実挙動（無料枠50の実配線・_error非課金）はActorローカル実行
 * （ACTOR_TEST_PAY_PER_EVENT=1＋ACTOR_USE_CHARGING_LOG_DATASET=1 で dist/main.js を実行し
 * charging-log datasetを確認する）側で検証する。
 * 外部API呼び出しはないため、APIキー・ネットワークは不要。
 */
import { performance } from 'node:perf_hooks';
import { createBilling } from '@jp-opendata/billing';
import { runCalendarBusinessDays, type CalendarInput } from '../src/run.js';

// prefill相当: 改元境界ペア＋振替休日＋平日（.actor/input_schema.jsonのprefillと同値）
const input: CalendarInput = {
  operation: 'date_info',
  dates: ['2019-04-30', '2019-05-01', '2026-05-06', '2026-07-13'],
};

const t0 = performance.now();
let firstResultMs: number | null = null;
const summary = await runCalendarBusinessDays(input, {
  billing: createBilling({ charge: async () => undefined }),
  pushData: async (item) => {
    if (firstResultMs === null) firstResultMs = Math.round(performance.now() - t0);
    console.log(JSON.stringify(item));
  },
  log: {
    info: (m) => console.log(`INFO  ${m}`),
    warning: (m) => console.log(`WARN  ${m}`),
    error: (m) => console.log(`ERROR ${m}`),
  },
  retrievedAt: new Date().toISOString(),
});
console.log(
  `[e2e] first result: ${firstResultMs}ms / total: ${Math.round(performance.now() - t0)}ms`,
);
console.log(`[e2e] summary: ${JSON.stringify(summary)}`);
