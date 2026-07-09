import { Actor, log } from 'apify';
import { createBilling } from '@jp-opendata/billing';
import { ReinfolibClient, postWebhookAlert } from '@jp-opendata/gov-clients';
import { RunFailedError, runRealEstatePrices, type RealEstateInput } from './run.js';

const ACTOR_NAME = 'japan-real-estate-prices';

await Actor.init();
try {
  const input = await Actor.getInput<RealEstateInput>();
  if (!input) {
    throw new RunFailedError('Input is required.');
  }
  const apiKey = process.env.REINFOLIB_API_KEY;
  if (!apiKey) {
    throw new RunFailedError('REINFOLIB_API_KEY is not set. Configure it as an Actor secret.');
  }

  // Startイベントは合成 `apify-actor-start` をプラットフォームが自動課金する（R2-5）。
  // 無料枠は実行単位: 先頭N件は課金しない（R2-3。50件は仮置き、公開前に事業主が確定）
  const FREE_RECORDS_PER_RUN = 50;
  const billing = createBilling(
    { charge: (options) => Actor.charge(options) },
    { freeAllowance: { 'record-basic': FREE_RECORDS_PER_RUN } },
  );

  await runRealEstatePrices(input, {
    client: new ReinfolibClient({ apiKey }),
    billing,
    pushData: (item) => Actor.pushData(item),
    log: {
      info: (message) => log.info(message),
      warning: (message) => log.warning(message),
      error: (message) => log.error(message),
    },
    retrievedAt: new Date().toISOString(),
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
