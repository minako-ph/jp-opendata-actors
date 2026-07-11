import { Actor, log } from 'apify';
import { createBilling } from '@jp-opendata/billing';
import { EdinetClient, postWebhookAlert } from '@jp-opendata/gov-clients';
import {
  RunFailedError,
  runEdinetFinancials,
  type EdinetFinancialsInput,
  type RunSummary,
} from './run.js';

const ACTOR_NAME = 'japan-edinet-financials';

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
  const input = await Actor.getInput<EdinetFinancialsInput>();
  if (!input) {
    throw new RunFailedError('Input is required.');
  }
  const apiKey = process.env.EDINET_API_KEY;
  if (!apiKey) {
    throw new RunFailedError('EDINET_API_KEY is not set. Configure it as an Actor secret.');
  }

  // Startイベントは合成 `apify-actor-start` をプラットフォームが自動課金する（R2-5）。
  // 無料枠は実行単位: 最初の3書類は課金しない（FR-C6の#6適用値。仮置き、公開前に事業主確定）
  const FREE_RECORDS_PER_RUN = 3;
  const billing = createBilling(
    { charge: (options) => Actor.charge(options) },
    { freeAllowance: { 'record-basic': FREE_RECORDS_PER_RUN } },
  );

  await runEdinetFinancials(input, {
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
  });
  await Actor.exit();
} catch (error) {
  await Actor.fail(error instanceof Error ? error.message : String(error));
}
