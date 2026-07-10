import { Actor, log } from 'apify';
import { createBilling } from '@jp-opendata/billing';
import {
  LAWS_TRANSLATE_DEFAULT_MODEL,
  createLawsTranslator,
  type LawsTranslator,
} from '@jp-opendata/enrich';
import { LawsClient, postWebhookAlert } from '@jp-opendata/gov-clients';
import { RunFailedError, runLawsRegulations, type LawsInput } from './run.js';

const ACTOR_NAME = 'japan-laws-regulations';

await Actor.init();
try {
  const input = await Actor.getInput<LawsInput>();
  if (!input) {
    throw new RunFailedError('Input is required.');
  }

  // Startイベントは合成 `apify-actor-start` をプラットフォームが自動課金する（R2-5）。
  // 無料枠は実行単位: 先頭N条は課金しない（R2-3。20条は仮置き、公開前に事業主が確定）。
  // article-translatedにはfreeAllowanceを適用しない（LLM原価が実費で発生するため）
  const FREE_ARTICLES_PER_RUN = 20;
  const billing = createBilling(
    { charge: (options) => Actor.charge(options) },
    { freeAllowance: { 'record-basic': FREE_ARTICLES_PER_RUN } },
  );

  // translate: 同期Messages API（追補R2-1）。キー未設定でtranslate=trueはrun側で実行失敗にする
  let translator: LawsTranslator | undefined;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const translateModel = process.env.ENRICH_MODEL ?? LAWS_TRANSLATE_DEFAULT_MODEL;
  if (anthropicKey) {
    translator = createLawsTranslator({
      apiKey: anthropicKey,
      model: translateModel,
      priceInPerMtok: Number(process.env.ENRICH_PRICE_IN ?? '1.00'),
      priceOutPerMtok: Number(process.env.ENRICH_PRICE_OUT ?? '5.00'),
    });
  }

  await runLawsRegulations(input, {
    client: new LawsClient(),
    billing,
    pushData: (item) => Actor.pushData(item),
    log: {
      info: (message) => log.info(message),
      warning: (message) => log.warning(message),
      error: (message) => log.error(message),
    },
    retrievedAt: new Date().toISOString(),
    translateModel,
    ...(translator ? { translator } : {}),
    alert: (summary) =>
      postWebhookAlert({
        url: process.env.ALERT_WEBHOOK_URL,
        actor: ACTOR_NAME,
        summary,
        log: {
          warning: (message) => log.warning(message),
          error: (message) => log.error(message),
        },
      }),
  });
  await Actor.exit();
} catch (error) {
  await Actor.fail(error instanceof Error ? error.message : String(error));
}
