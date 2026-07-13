import { Actor, log } from 'apify';
import { createBilling } from '@jp-opendata/billing';
import {
  RunFailedError,
  runCalendarBusinessDays,
  type CalendarInput,
  type RunSummary,
} from './run.js';

const ACTOR_NAME = 'japan-business-days-calendar';

/**
 * N-4通知（ALERT_WEBHOOK_URLへのPOST）。gov-clients/monitoring.tsと同型のローカル実装:
 * 本Actorは外部API呼び出しゼロでgov-clients依存を追加しない方針のため（要件書N7-1）。
 * 送信失敗はエラーログのみ（実行は落とさない）。
 */
async function postWebhookAlert(url: string | undefined, summary: RunSummary): Promise<void> {
  if (!url) {
    log.warning(`ALERT_WEBHOOK_URL is not set; alert is logged only. ${JSON.stringify(summary)}`);
    return;
  }
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actor: ACTOR_NAME, summary }),
    });
  } catch (error) {
    log.error(`Failed to send alert: ${String(error)}`);
  }
}

await Actor.init();
try {
  const input = await Actor.getInput<CalendarInput>();
  if (!input) {
    throw new RunFailedError('Input is required.');
  }

  // Startイベントは合成 `apify-actor-start` をプラットフォームが自動課金する（R2-5）。
  // 無料枠は実行単位: 先頭50件は課金しない（R2-3・FR-C6。#2/#3と同値で確定: 要件書§3）
  const FREE_RECORDS_PER_RUN = 50;
  const billing = createBilling(
    { charge: (options) => Actor.charge(options) },
    { freeAllowance: { 'record-basic': FREE_RECORDS_PER_RUN } },
  );

  await runCalendarBusinessDays(input, {
    billing,
    pushData: (item) => Actor.pushData(item),
    log: {
      info: (message) => log.info(message),
      warning: (message) => log.warning(message),
      error: (message) => log.error(message),
    },
    retrievedAt: new Date().toISOString(),
    alert: (summary) => postWebhookAlert(process.env.ALERT_WEBHOOK_URL, summary),
  });
  await Actor.exit();
} catch (error) {
  await Actor.fail(error instanceof Error ? error.message : String(error));
}
