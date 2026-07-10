import { LAWS_TRANSLATION_DISCLAIMER } from '@jp-opendata/attribution';
import type { Billing } from '@jp-opendata/billing';
import {
  RateLimitAbortError,
  type LawDataResult,
  type LawsSearchQuery,
  type LawsSearchResult,
  type HttpStats,
} from '@jp-opendata/gov-clients';
import {
  extractArticles,
  normalizeArticleNumber,
  toArticleItem,
  type LawContext,
} from './transform.js';

/**
 * Actor#5 実行コア（Apify SDK非依存・テスト可能。#1〜#4と同型）。
 * - **law_query必須**（全法令ループ取得禁止の第2層。無条件実行が構造的に不可能）
 * - law_queryの解決順: law_id形式→直接取得／法令番号表記→直接取得／それ以外は
 *   法令名検索→完全一致 or 略称一致 or 単一ヒットのみ採用（曖昧は候補提示で実行失敗）
 * - FR-C7: 200条/run。超過はエラーでなく打ち切り＋警告
 * - FR-C8: 1条の失敗は_error行で継続。実行失敗は法令解決不能または失敗率50%超のみ
 * - basic: record-basic/条。translated: 成功した条のみarticle-translated追加課金。
 *   題名訳はlaw単位で1回生成し全条のtranslatedへ複写（条課金に内包）
 */

export interface LawsInput {
  /** 法令名・法令番号・法令IDのいずれか（必須） */
  law_query: string;
  /** 条番号の絞り込み（"1"・"2-2"・"第二条の二" 等）。省略時は本則の全条（上限まで） */
  articles?: string[];
  /** 時点指定（YYYY-MM-DD） */
  as_of_date?: string;
  translate?: boolean;
}

export interface LawsClientLike {
  searchLaws(query: LawsSearchQuery): Promise<LawsSearchResult>;
  getLawData(lawIdOrNum: string, asof?: string): Promise<LawDataResult>;
  getHttpStats(): Readonly<HttpStats>;
}

/** 生成項目の必要最小面（enrichのGeneratedFieldと構造互換） */
export interface GeneratedFieldLike {
  value: string | null;
  confidence: number;
  method: string;
  verification_failed?: boolean;
}

/** translator注入点（実装はpackages/enrichのcreateLawsTranslatorをmain.tsで注入する） */
export interface LawsTranslatorLike {
  translateArticle(input: {
    lawTitleJa: string;
    articleDisplayJa: string;
    captionJa: string | null;
    textJa: string;
  }): Promise<{ fields: Record<string, unknown>; usage: { costUsd: number } }>;
  translateTitle(
    lawTitleJa: string,
  ): Promise<{ field: GeneratedFieldLike; usage: { costUsd: number } }>;
}

export interface RunLogger {
  info(message: string): void;
  warning(message: string): void;
  error(message: string): void;
}

export interface RunSummary {
  law_id: string | null;
  law_revision_id: string | null;
  articles_in_law: number;
  articles_matched: number;
  articles_truncated: boolean;
  records_pushed: number;
  record_errors: number;
  record_failure_rate: number;
  records_charged: number;
  free_used: number;
  translated_records: number;
  translate_failures: number;
  translate_cost_usd_total: number;
  translate_cost_usd_avg: number;
  drift_detected: boolean;
  rate_limit_hits: number;
  aborted_by_rate_limit: boolean;
  charge_limit_reached: boolean;
}

export interface RunDeps {
  client: LawsClientLike;
  billing: Billing;
  pushData: (item: Record<string, unknown>) => Promise<void>;
  log: RunLogger;
  retrievedAt: string;
  /** translate=true時に使うLLM翻訳（未設定でtranslate要求は実行失敗＝設定不備） */
  translator?: LawsTranslatorLike;
  /** translatedアイテムに記録するモデル名（main.tsのENRICH_MODELと一致させる） */
  translateModel?: string;
  alert?: (summary: RunSummary) => Promise<void>;
  /** テスト用の上限上書き */
  maxArticles?: number;
}

/** FR-C7: 1実行の条数上限 */
export const MAX_ARTICLES = 200;

export class RunFailedError extends Error {}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** law_id形式（例: 415AC0000000057） */
const LAW_ID_PATTERN = /^\d{3}[A-Z][A-Z0-9]\d{10}$/;
/** 法令番号表記（例: 平成十五年法律第五十七号） */
const LAW_NUM_PATTERN = /^(明治|大正|昭和|平成|令和).+第.+号$/;

function validateInput(input: LawsInput): void {
  if ((input.law_query ?? '').trim() === '') {
    throw new RunFailedError(
      'law_query is required (law title, law number, or law ID). ' +
        'Bulk corpus needs are served by the official bulk download, not this Actor.',
    );
  }
  if (
    input.as_of_date !== undefined &&
    input.as_of_date !== '' &&
    !ISO_DATE.test(input.as_of_date)
  ) {
    throw new RunFailedError('as_of_date must be YYYY-MM-DD.');
  }
}

async function resolveLaw(
  input: LawsInput,
  deps: RunDeps,
  summary: RunSummary,
): Promise<LawDataResult> {
  const query = input.law_query.trim();
  const asof = input.as_of_date === '' ? undefined : input.as_of_date;

  if (LAW_ID_PATTERN.test(query) || LAW_NUM_PATTERN.test(query)) {
    const result = await deps.client.getLawData(query, asof);
    if (!result.found) {
      throw new RunFailedError(`No law found for "${query}" (as of ${asof ?? 'latest'}).`);
    }
    return result;
  }

  const search = await deps.client.searchLaws({ lawTitle: query });
  summary.drift_detected = summary.drift_detected || search.drift.hasDrift;
  if (search.laws.length === 0) {
    throw new RunFailedError(`No law matched "${query}". Try the official title or a law number.`);
  }
  const exact = search.laws.filter(
    (law) =>
      law.revision_info.law_title === query ||
      (law.revision_info.abbrev ?? '').split('，').includes(query) ||
      law.revision_info.abbrev === query,
  );
  const picked =
    exact.length === 1 ? exact[0] : search.laws.length === 1 ? search.laws[0] : undefined;
  if (picked === undefined) {
    const candidates = search.laws
      .slice(0, 5)
      .map((law) => `「${law.revision_info.law_title}」(${law.law_info.law_id})`)
      .join(' / ');
    throw new RunFailedError(
      `"${query}" matched ${search.totalCount} laws — be more specific or pass a law ID. Candidates: ${candidates}`,
    );
  }
  const result = await deps.client.getLawData(picked.law_info.law_id, asof);
  if (!result.found) {
    throw new RunFailedError(
      `Law "${picked.revision_info.law_title}" has no text available as of ${asof ?? 'latest'}.`,
    );
  }
  return result;
}

export async function runLawsRegulations(input: LawsInput, deps: RunDeps): Promise<RunSummary> {
  validateInput(input);
  const maxArticles = deps.maxArticles ?? MAX_ARTICLES;
  if (input.translate && deps.translator === undefined) {
    throw new RunFailedError('ANTHROPIC_API_KEY is not set (required when translate=true).');
  }

  const summary: RunSummary = {
    law_id: null,
    law_revision_id: null,
    articles_in_law: 0,
    articles_matched: 0,
    articles_truncated: false,
    records_pushed: 0,
    record_errors: 0,
    record_failure_rate: 0,
    records_charged: 0,
    free_used: 0,
    translated_records: 0,
    translate_failures: 0,
    translate_cost_usd_total: 0,
    translate_cost_usd_avg: 0,
    drift_detected: false,
    rate_limit_hits: 0,
    aborted_by_rate_limit: false,
    charge_limit_reached: false,
  };

  try {
    const lawData = await resolveLaw(input, deps, summary);
    summary.drift_detected = summary.drift_detected || lawData.drift.hasDrift;
    if (lawData.drift.hasDrift) {
      deps.log.warning(`Schema drift detected: ${JSON.stringify(lawData.drift)}`);
    }
    const { law_info: lawInfo, revision_info: revisionInfo } = lawData.data;
    summary.law_id = lawInfo.law_id;
    summary.law_revision_id = revisionInfo.law_revision_id;

    const law: LawContext = {
      lawId: lawInfo.law_id,
      lawNum: lawInfo.law_num ?? null,
      lawTitleJa: revisionInfo.law_title,
      lawTitleKana: revisionInfo.law_title_kana ?? null,
      lawAbbrevJa: revisionInfo.abbrev ?? null,
      promulgationDate: lawInfo.promulgation_date ?? null,
      enforcementDate: revisionInfo.amendment_enforcement_date ?? null,
      lawRevisionId: revisionInfo.law_revision_id,
      asOf: input.as_of_date === '' ? null : (input.as_of_date ?? null),
    };

    const allArticles = extractArticles(lawData.data.law_full_text);
    summary.articles_in_law = allArticles.length;
    if (allArticles.length === 0) {
      deps.log.warning(
        'No articles extracted from the main provision — the law structure may have changed (drift).',
      );
    }

    let selected = allArticles;
    if (input.articles !== undefined && input.articles.length > 0) {
      const wanted = new Set<string>();
      for (const raw of input.articles) {
        if (raw.trim() === '') continue;
        const normalized = normalizeArticleNumber(raw);
        if (normalized === null) {
          throw new RunFailedError(
            `Cannot interpret article number "${raw}" (use "1", "2-2", or 第二条の二).`,
          );
        }
        wanted.add(normalized);
      }
      selected = allArticles.filter((article) => wanted.has(article.number));
    }
    summary.articles_matched = selected.length;

    if (selected.length > maxArticles) {
      summary.articles_truncated = true;
      deps.log.warning(
        `${selected.length} articles matched; capped at ${maxArticles} per run (per-run limit). ` +
          'For full-corpus needs use the official bulk download.',
      );
      selected = selected.slice(0, maxArticles);
    }

    // 題名訳はlaw単位で1回（条課金に内包）。失敗しても条訳は続行
    let lawTitleEn: GeneratedFieldLike | null = null;
    if (input.translate && deps.translator && selected.length > 0) {
      try {
        const result = await deps.translator.translateTitle(law.lawTitleJa);
        lawTitleEn = result.field;
        summary.translate_cost_usd_total += result.usage.costUsd;
      } catch (error) {
        deps.log.warning(`Law title translation failed: ${String(error)}`);
      }
    }

    for (const article of selected) {
      let item;
      try {
        item = toArticleItem(article, law, {
          sourceUrl: lawData.publicUrl,
          retrievedAt: deps.retrievedAt,
        });
      } catch (error) {
        summary.record_errors++;
        deps.log.warning(`Failed to transform article ${article.number}: ${String(error)}`);
        await deps.pushData({
          record_type: 'article',
          law_id: law.lawId,
          article_number: article.number,
          _error: String(error).slice(0, 200),
        });
        continue;
      }

      // translate（#1のenrichと同型）: 結果を待ってから1回だけpushする。
      // LLM失敗はbasicのみ（translated:null）で出力して継続（FR-C8。translated課金なし）
      let translated: Record<string, unknown> | null = null;
      if (input.translate && deps.translator) {
        try {
          const result = await deps.translator.translateArticle({
            lawTitleJa: law.lawTitleJa,
            articleDisplayJa: article.display_ja,
            captionJa: article.caption_ja,
            textJa: article.text_ja,
          });
          translated = {
            ...result.fields,
            law_title_en: lawTitleEn,
            disclaimer: LAWS_TRANSLATION_DISCLAIMER,
            model: deps.translateModel ?? null,
            prompt_version: 'laws-translate-v1',
          };
          summary.translate_cost_usd_total += result.usage.costUsd;
        } catch (error) {
          summary.translate_failures++;
          deps.log.warning(
            `Translation failed for article ${article.number} (falling back to basic): ${String(error)}`,
          );
        }
      }

      await deps.pushData(input.translate ? { ...item, translated } : item);
      summary.records_pushed++;
      const outcome = await deps.billing.charge('record-basic');
      let limitReached = outcome.limitReached;
      if (translated !== null) {
        summary.translated_records++;
        const translatedOutcome = await deps.billing.charge('article-translated');
        limitReached = limitReached || translatedOutcome.limitReached;
      }
      if (limitReached) {
        summary.charge_limit_reached = true;
        deps.log.warning('Max charge limit reached; stopping gracefully with partial results.');
        break;
      }
    }
  } catch (error) {
    if (error instanceof RateLimitAbortError) {
      summary.aborted_by_rate_limit = true;
      await finalizeSummary(summary, deps, true);
      throw new RunFailedError(String(error));
    }
    throw error;
  }

  const failed = await finalizeSummary(summary, deps, false);
  if (failed) {
    throw new RunFailedError(
      `Record failure rate ${(summary.record_failure_rate * 100).toFixed(0)}% exceeded 50%.`,
    );
  }
  return summary;
}

async function finalizeSummary(
  summary: RunSummary,
  deps: RunDeps,
  forceAlert: boolean,
): Promise<boolean> {
  const processed = summary.records_pushed + summary.record_errors;
  summary.record_failure_rate = processed === 0 ? 0 : summary.record_errors / processed;
  summary.rate_limit_hits = deps.client.getHttpStats().rateLimitHits;
  summary.records_charged = deps.billing.totals()['record-basic'];
  summary.free_used = deps.billing.freeUsed()['record-basic'];
  summary.translate_cost_usd_avg =
    summary.translated_records === 0
      ? 0
      : Number((summary.translate_cost_usd_total / summary.translated_records).toFixed(6));

  const shouldAlert =
    forceAlert ||
    summary.record_failure_rate > 0.2 ||
    summary.rate_limit_hits > 0 ||
    summary.drift_detected;
  if (shouldAlert) {
    deps.log.warning(`Monitoring alert condition met: ${JSON.stringify(summary)}`);
    if (deps.alert) {
      try {
        await deps.alert(summary);
      } catch (error) {
        deps.log.error(`Failed to send alert: ${String(error)}`);
      }
    }
  }
  deps.log.info(`Run summary: ${JSON.stringify(summary)}`);
  return summary.record_failure_rate > 0.5;
}
