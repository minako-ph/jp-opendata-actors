import { Actor, log } from 'apify';
import { createBilling } from '@jp-opendata/billing';
import { GbizinfoClient, HoujinClient, postWebhookAlert } from '@jp-opendata/gov-clients';
import { RunFailedError, runSubsidiesGrants, type SubsidiesInput } from './run.js';

const ACTOR_NAME = 'japan-subsidies-grants';

await Actor.init();
try {
  const input = await Actor.getInput<SubsidiesInput>();
  if (!input) {
    throw new RunFailedError('Input is required.');
  }
  const token = process.env.GBIZINFO_API_TOKEN;
  if (!token) {
    throw new RunFailedError('GBIZINFO_API_TOKEN is not set. Configure it as an Actor secret.');
  }
  // company_names解決にのみ必要（未設定でcorporate_numbers/ministry入力なら動く）
  const houjinAppId = process.env.HOUJIN_APP_ID;

  // Startイベントは合成 `apify-actor-start` をプラットフォームが自動課金する（R2-5）。
  // 無料枠は実行単位: 先頭N件は課金しない（R2-3。50件は仮置き、公開前に事業主が確定）
  const FREE_RECORDS_PER_RUN = 50;
  const billing = createBilling(
    { charge: (options) => Actor.charge(options) },
    { freeAllowance: { 'record-basic': FREE_RECORDS_PER_RUN } },
  );

  await runSubsidiesGrants(input, {
    client: new GbizinfoClient({ token }),
    houjin: houjinAppId ? new HoujinClient({ id: houjinAppId }) : null,
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
