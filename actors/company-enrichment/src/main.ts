import { Actor, log } from 'apify';
import { createBilling } from '@jp-opendata/billing';
import {
  COMPANY_ENRICH_DEFAULT_MODEL,
  createCompanyEnricher,
  type CompanyEnricher,
} from '@jp-opendata/enrich';
import { GbizinfoClient, HoujinClient, postWebhookAlert } from '@jp-opendata/gov-clients';
import { RunFailedError, runCompanyEnrichment, type CompanyEnrichmentInput } from './run.js';

const ACTOR_NAME = 'japan-company-enrichment';

await Actor.init();
try {
  const input = await Actor.getInput<CompanyEnrichmentInput>();
  if (!input) {
    throw new RunFailedError('Input is required.');
  }
  const token = process.env.GBIZINFO_API_TOKEN;
  if (!token) {
    throw new RunFailedError('GBIZINFO_API_TOKEN is not set. Configure it as an Actor secret.');
  }
  // company_names解決にのみ必要。HOUJIN_API_BASEで本番/検証環境を切替（Step 0(c)）
  const houjinAppId = process.env.HOUJIN_APP_ID;
  const houjinBase = process.env.HOUJIN_API_BASE;

  // Startイベントは合成 `apify-actor-start` をプラットフォームが自動課金する（R2-5）。
  // 無料枠は実行単位: 先頭N社は課金しない（R2-3。20社は仮置き、公開前に事業主が確定）。
  // record-enrichedにはfreeAllowanceを適用しない（LLM原価が実費で発生するため）
  const FREE_RECORDS_PER_RUN = 20;
  const billing = createBilling(
    { charge: (options) => Actor.charge(options) },
    { freeAllowance: { 'record-basic': FREE_RECORDS_PER_RUN } },
  );

  // enrich: 同期Messages API（追補R2-1）。キー未設定でenrich=trueが来た場合はrun側で実行失敗にする
  let enricher: CompanyEnricher | undefined;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const enrichModel = process.env.ENRICH_MODEL ?? COMPANY_ENRICH_DEFAULT_MODEL;
  if (anthropicKey) {
    enricher = createCompanyEnricher({
      apiKey: anthropicKey,
      model: enrichModel,
      priceInPerMtok: Number(process.env.ENRICH_PRICE_IN ?? '1.00'),
      priceOutPerMtok: Number(process.env.ENRICH_PRICE_OUT ?? '5.00'),
    });
  }

  await runCompanyEnrichment(input, {
    client: new GbizinfoClient({ token }),
    houjin: houjinAppId
      ? new HoujinClient({ id: houjinAppId, ...(houjinBase ? { baseUrl: houjinBase } : {}) })
      : null,
    billing,
    pushData: (item) => Actor.pushData(item),
    log: {
      info: (message) => log.info(message),
      warning: (message) => log.warning(message),
      error: (message) => log.error(message),
    },
    retrievedAt: new Date().toISOString(),
    enrichModel,
    ...(enricher ? { enricher } : {}),
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
