import { Actor, log } from 'apify';
import { createBilling } from '@jp-opendata/billing';
import { EdinetClient } from '@jp-opendata/gov-clients';
import {
  RunFailedError,
  runEdinetFilings,
  type EdinetFilingsInput,
  type RunSummary,
} from './run.js';

const ACTOR_NAME = 'japan-edinet-filings';

/** N-4: アラートはALERT_WEBHOOK_URLへ要約POST。未設定ならログのみ */
async function sendWebhookAlert(summary: RunSummary): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) {
    log.warning(`ALERT_WEBHOOK_URL is not set; alert is logged only. ${JSON.stringify(summary)}`);
    return;
  }
  await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ actor: ACTOR_NAME, summary }),
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

  const billing = createBilling({ charge: (options) => Actor.charge(options) });
  await billing.charge('actor-start');

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
  });
  await Actor.exit();
} catch (error) {
  await Actor.fail(error instanceof Error ? error.message : String(error));
}
