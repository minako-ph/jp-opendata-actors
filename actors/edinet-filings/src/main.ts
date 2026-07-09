import { Actor, log } from 'apify';
import { createBilling } from '@jp-opendata/billing';
import { ENRICH_DEFAULT_MODEL, createEnricher } from '@jp-opendata/enrich';
import { EdinetClient, postWebhookAlert } from '@jp-opendata/gov-clients';
import {
  RunFailedError,
  runEdinetFilings,
  type EdinetFilingsInput,
  type EnricherLike,
  type RunSummary,
} from './run.js';

const ACTOR_NAME = 'japan-edinet-filings';

/** N-4: アラートはALERT_WEBHOOK_URLへ要約POST（共通ヘルパ）。未設定ならログのみ */
async function sendWebhookAlert(summary: RunSummary): Promise<void> {
  await postWebhookAlert({
    url: process.env.ALERT_WEBHOOK_URL,
    actor: ACTOR_NAME,
    summary,
    log: {
      warning: (message) => log.warning(message),
      error: (message) => log.error(message),
    },
  });
}

await Actor.init();
try {
  const input = await Actor.getInput<EdinetFilingsInput>();
  if (!input) {
    throw new RunFailedError('Input is required.');
  }
  const apiKey = process.env.EDINET_API_KEY;
  if (!apiKey) {
    throw new RunFailedError('EDINET_API_KEY is not set. Configure it as an Actor secret.');
  }

  // Startイベントは合成 `apify-actor-start` をプラットフォームが自動課金する（R2-5）。
  // 無料枠は実行単位: 最初のN書類は課金しない（R2-3。仮置き値、公開前に確定）。
  // record-enrichedにはfreeAllowanceを適用しない（LLM原価が実費で発生するため）。
  const FREE_RECORDS_PER_RUN = 3;
  const billing = createBilling(
    { charge: (options) => Actor.charge(options) },
    { freeAllowance: { 'record-basic': FREE_RECORDS_PER_RUN } },
  );

  // enrich: 同期Messages API（追補R2-1）。キー未設定でenrich=trueが来た場合はrun側で実行失敗にする
  let enricher: EnricherLike | undefined;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const enrichModel = process.env.ENRICH_MODEL ?? ENRICH_DEFAULT_MODEL;
  if (anthropicKey) {
    enricher = createEnricher({
      apiKey: anthropicKey,
      model: enrichModel,
      priceInPerMtok: Number(process.env.ENRICH_PRICE_IN ?? '1.00'),
      priceOutPerMtok: Number(process.env.ENRICH_PRICE_OUT ?? '5.00'),
    });
  }

  await runEdinetFilings(input, {
    client: new EdinetClient({ apiKey }),
    billing,
    pushData: (item) => Actor.pushData(item),
    log: {
      info: (message) => log.info(message),
      warning: (message) => log.warning(message),
      error: (message) => log.error(message),
    },
    retrievedAt: new Date().toISOString(),
    alert: sendWebhookAlert,
    enrichModel,
    ...(enricher ? { enricher } : {}),
  });
  await Actor.exit();
} catch (error) {
  await Actor.fail(error instanceof Error ? error.message : String(error));
}
