/**
 * enrich実測スクリプト（手動実行・CI外・結果はコミットしない）:
 * 要 GBIZINFO_API_TOKEN / ANTHROPIC_API_KEY（＋任意でENRICH_MODEL, ENRICH_PRICE_IN/OUT）。
 * 実在法人10社の基本情報→company enrich実行→件別tokens/cost・平均cost・
 * **推奨単価（avg/0.15＝マージン85%下限）**・サンプル出力2件を表示する。
 * dataset書き込み・課金は行わない。**単価確定は人間タスク**（完了報告参照）。
 *
 *   pnpm --filter @jp-opendata/actor-company-enrichment exec esbuild scripts/live-enrich.ts \
 *     --bundle --platform=node --target=node22 --format=esm \
 *     --banner:js="import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);" \
 *     --outfile=dist/live-enrich.mjs --log-level=error \
 *   && node dist/live-enrich.mjs
 */
import { COMPANY_ENRICH_DEFAULT_MODEL, createCompanyEnricher } from '@jp-opendata/enrich';
import { GbizinfoClient } from '@jp-opendata/gov-clients';
import { industryToEnglish } from '../src/transform.js';

const token = process.env.GBIZINFO_API_TOKEN;
const anthropicKey = process.env.ANTHROPIC_API_KEY;
if (!token || !anthropicKey) {
  throw new Error('GBIZINFO_API_TOKEN と ANTHROPIC_API_KEY を設定して実行すること');
}

const model = process.env.ENRICH_MODEL ?? COMPANY_ENRICH_DEFAULT_MODEL;
const enricher = createCompanyEnricher({
  apiKey: anthropicKey,
  model,
  priceInPerMtok: Number(process.env.ENRICH_PRICE_IN ?? '1.00'),
  priceOutPerMtok: Number(process.env.ENRICH_PRICE_OUT ?? '5.00'),
});
const client = new GbizinfoClient({ token });

// 実在保証のある確定3社（大企業・英名あり／補助金0件／中小）＋補助金保有法人から動的補充で計10社
const TARGETS: string[] = ['7010001008844', '1180301018771', '1010001117205'];
const search = await client.searchHojin({ source: '4', ministry: '27', limit: 20, page: 1 });
for (const profile of search.hojinInfos) {
  if (TARGETS.length >= 10) break;
  if (!TARGETS.includes(profile.corporate_number)) TARGETS.push(profile.corporate_number);
}

let done = 0;
let totalCost = 0;
const samples: string[] = [];
for (const num of TARGETS) {
  if (done >= 10) break;
  let basic;
  try {
    basic = (await client.getBasicInfo(num)).hojinInfos[0];
  } catch {
    console.log(`[skip] ${num}: gBizINFO未収載`);
    continue;
  }
  if (!basic) continue;
  let result;
  try {
    result = await enricher({
      nameJa: basic.name,
      kana: basic.kana ?? null,
      nativeNameEn: basic.name_en ?? null,
      businessSummaryJa: basic.business_summary ?? null,
      industryEn: industryToEnglish(basic.industry ?? []),
    });
  } catch (error) {
    console.log(`[fail] ${basic.name}: ${String(error).slice(0, 120)}`);
    continue;
  }
  done++;
  totalCost += result.usage.costUsd;
  console.log(
    `[${done}] ${basic.name} in=${result.usage.inputTokens} cached=${result.usage.cachedInputTokens} out=${result.usage.outputTokens} cost=$${result.usage.costUsd.toFixed(6)}`,
  );
  if (samples.length < 2) samples.push(JSON.stringify(result.fields, null, 2));
}

const avg = done === 0 ? 0 : totalCost / done;
console.log(`\n[result] model=${model} n=${done} total=$${totalCost.toFixed(6)}`);
console.log(`[result] 平均原価: $${avg.toFixed(6)}/社`);
console.log(`[result] マージン85%の推奨単価（avg/0.15）: $${(avg / 0.15).toFixed(4)}`);
console.log(`[samples]\n${samples.join('\n---\n')}`);
