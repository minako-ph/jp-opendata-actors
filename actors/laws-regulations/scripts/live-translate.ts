/**
 * translate実測スクリプト（手動実行・CI外・結果はコミットしない）:
 * 要 ANTHROPIC_API_KEY（＋任意でENRICH_MODEL, ENRICH_PRICE_IN/OUT）。
 * 個人情報保護法の最初の10条を実翻訳し、件別tokens/cost・平均cost・
 * **推奨単価（avg/0.15＝マージン85%下限）**・サンプル出力2件を表示する。
 * dataset書き込み・課金は行わない。**単価確定は人間タスク**（完了報告参照）。
 *
 *   pnpm --filter @jp-opendata/actor-laws-regulations exec esbuild scripts/live-translate.ts \
 *     --bundle --platform=node --target=node22 --format=esm \
 *     --banner:js="import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);" \
 *     --outfile=dist/live-translate.mjs --log-level=error \
 *   && node dist/live-translate.mjs
 */
import { LAWS_TRANSLATE_DEFAULT_MODEL, createLawsTranslator } from '@jp-opendata/enrich';
import { LawsClient } from '@jp-opendata/gov-clients';
import { extractArticles } from '../src/transform.js';

const anthropicKey = process.env.ANTHROPIC_API_KEY;
if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY を設定して実行すること');

const model = process.env.ENRICH_MODEL ?? LAWS_TRANSLATE_DEFAULT_MODEL;
const translator = createLawsTranslator({
  apiKey: anthropicKey,
  model,
  priceInPerMtok: Number(process.env.ENRICH_PRICE_IN ?? '1.00'),
  priceOutPerMtok: Number(process.env.ENRICH_PRICE_OUT ?? '5.00'),
});

const client = new LawsClient();
const lawData = await client.getLawData('415AC0000000057'); // 個人情報保護法
if (!lawData.found) throw new Error('law_dataの取得に失敗');
const lawTitle = lawData.data.revision_info.law_title;
const articles = extractArticles(lawData.data.law_full_text).slice(0, 10);
console.log(`[plan] ${lawTitle} 最初の${articles.length}条 model=${model}`);

const title = await translator.translateTitle(lawTitle);
console.log(
  `[title] "${String(title.field.value)}" cost=$${title.usage.costUsd.toFixed(6)}（law単位1回・条課金に内包）`,
);

let totalCost = 0;
let flagged = 0;
let succeeded = 0;
const samples: string[] = [];
for (const [i, article] of articles.entries()) {
  let result;
  try {
    result = await translator.translateArticle({
      lawTitleJa: lawTitle,
      articleDisplayJa: article.display_ja,
      captionJa: article.caption_ja,
      textJa: article.text_ja,
    });
  } catch (error) {
    console.log(`[fail] ${article.display_ja}: ${String(error).slice(0, 120)}`);
    continue;
  }
  succeeded++;
  totalCost += result.usage.costUsd;
  const failed = result.fields.translation_en.verification_failed === true;
  if (failed) flagged++;
  console.log(
    `[${i + 1}] ${article.display_ja} in=${result.usage.inputTokens} out=${result.usage.outputTokens} cost=$${result.usage.costUsd.toFixed(6)}${failed ? ' [verification_failed]' : ''}`,
  );
  if (samples.length < 2) {
    samples.push(
      JSON.stringify(
        { article: article.display_ja, summary_en: result.fields.summary_en },
        null,
        2,
      ),
    );
  }
}

const avg = succeeded === 0 ? 0 : totalCost / succeeded;
console.log(
  `\n[result] model=${model} n=${succeeded} total=$${totalCost.toFixed(6)} flagged=${flagged}`,
);
console.log(
  `[result] 平均原価: $${avg.toFixed(6)}/条（題名訳$${title.usage.costUsd.toFixed(6)}は別途・law単位）`,
);
console.log(`[result] マージン85%の推奨単価（avg/0.15）: $${(avg / 0.15).toFixed(4)}`);
console.log(`[samples]\n${samples.join('\n---\n')}`);
