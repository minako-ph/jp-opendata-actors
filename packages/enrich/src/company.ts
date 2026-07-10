import { z } from 'zod';
import type { CreateMessage, CreateMessageRequest, EnrichUsage } from './edinet.js';
import { verifyVerbatim, type GeneratedField } from './verbatim.js';
import { COMPANY_ENRICH_SYSTEM_PROMPT } from './prompt-company-enrich-v1.js';

/**
 * Actor#4 company enrichment（FR-4 enriched / R2-10 / docs/tasks-phase2.md）。
 * #1（edinet.ts）と同型: 同期Messages API・temperature 0・tool useでJSONスキーマ固定・
 * systemプロンプトはprompt caching。
 *
 * N-9運用:
 * - business_summary_en: 数値禁止プロンプト。数字列が混入した場合は原文と照合し、
 *   不一致は**フラグのみ**（verification_failed: true、null化しない）＝#1の要約文と同じ扱い。
 * - name_en（ローマ字翻字）: **逐語照合は原理的に不可のため照合スキップ**とし、
 *   method:"llm"＋モデル自己評価confidenceで担保する（N-9の生成項目規律）。
 *   gBizINFO登録英名（api_native）がある場合はLLM出力を採用しない（プロンプトでnull強制）。
 */

export interface CompanyEnrichInput {
  nameJa: string;
  kana: string | null;
  /** gBizINFO登録英名（api_native）。ある場合はLLM翻字を生成しない */
  nativeNameEn: string | null;
  businessSummaryJa: string | null;
  /** JSIC大分類の英語名（rule変換済み） */
  industryEn: string[];
}

const FIELD_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'confidence'],
  properties: {
    text: { type: ['string', 'null'] },
    confidence: { type: 'number', description: '0-1 confidence.' },
  },
};

export const COMPANY_ENRICH_TOOL: CreateMessageRequest['tool'] = {
  name: 'emit_company_enrichment',
  description: 'Record the English enrichment of the Japanese company profile.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['business_summary_en', 'name_en'],
    properties: {
      business_summary_en: {
        ...FIELD_JSON_SCHEMA,
        description: 'One English sentence with no figures, or null when no source text.',
      },
      name_en: {
        ...FIELD_JSON_SCHEMA,
        description:
          'Romanized rendering of the company name, or null when NATIVE_ENGLISH_NAME exists.',
      },
    },
  },
};

const fieldObjectSchema = z.object({
  text: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

// 実LLM（claude-haiku-4-5）はtool_choice強制でもまれに {text, confidence} でなく
// 文字列省略形を返す（2026-07-10実測）。実行失敗にせず confidence=0.5（不明）で受容する
const fieldOutputSchema = z.preprocess(
  (value) => (typeof value === 'string' ? { text: value, confidence: 0.5 } : value),
  fieldObjectSchema,
);

const companyOutputSchema = z.object({
  business_summary_en: fieldOutputSchema,
  name_en: fieldOutputSchema,
});

export interface CompanyEnrichedFields extends Record<string, unknown> {
  business_summary_en: GeneratedField<string>;
  /** 翻字。api_nativeがある場合はvalue null（Actor側でapi_native名を正とする） */
  name_en: GeneratedField<string>;
}

export interface CompanyEnrichResult {
  fields: CompanyEnrichedFields;
  usage: EnrichUsage;
}

export type CompanyEnricher = (input: CompanyEnrichInput) => Promise<CompanyEnrichResult>;

export function buildCompanyEnrichUserText(input: CompanyEnrichInput): string {
  return [
    `NAME: ${input.nameJa}`,
    `KANA: ${input.kana ?? 'NOT AVAILABLE'}`,
    `NATIVE_ENGLISH_NAME: ${input.nativeNameEn ?? 'NOT AVAILABLE'}`,
    `BUSINESS_SUMMARY: ${input.businessSummaryJa ?? 'NOT AVAILABLE'}`,
    `INDUSTRY: ${input.industryEn.length > 0 ? input.industryEn.join(', ') : 'NOT AVAILABLE'}`,
  ].join('\n');
}

/** 生成文中の数字列（半角/全角カンマ・小数を含む。edinet.tsと同一regex） */
function digitRuns(text: string): string[] {
  return text.match(/\d[\d,，.]*\d|\d/g) ?? [];
}

export interface CreateCompanyEnricherOptions {
  model?: string;
  apiKey?: string;
  priceInPerMtok: number;
  priceOutPerMtok: number;
  /** テスト用の注入点。省略時は@anthropic-ai/sdkの同期Messages API */
  createMessage?: CreateMessage;
}

export const COMPANY_ENRICH_DEFAULT_MODEL = 'claude-haiku-4-5';

export function createCompanyEnricher(options: CreateCompanyEnricherOptions): CompanyEnricher {
  const model = options.model ?? COMPANY_ENRICH_DEFAULT_MODEL;
  let createMessage = options.createMessage;

  return async (input) => {
    if (createMessage === undefined) {
      if (!options.apiKey) {
        throw new Error(
          'createCompanyEnricher: apiKey is required when createMessage is not injected.',
        );
      }
      const { createAnthropicCreateMessage } = await import('./anthropic.js');
      createMessage = createAnthropicCreateMessage({ apiKey: options.apiKey });
    }

    const response = await createMessage({
      model,
      maxTokens: 400,
      system: COMPANY_ENRICH_SYSTEM_PROMPT,
      userText: buildCompanyEnrichUserText(input),
      tool: COMPANY_ENRICH_TOOL,
    });
    const parsed = companyOutputSchema.parse(response.toolInput);

    const sourceText = [input.businessSummaryJa, ...input.industryEn]
      .filter((text): text is string => text !== null && text !== '')
      .join('\n');
    const summary: GeneratedField<string> = {
      value: parsed.business_summary_en.text,
      confidence: parsed.business_summary_en.confidence,
      method: 'llm',
    };
    const summaryFailed =
      summary.value !== null &&
      digitRuns(summary.value).some((run) => !verifyVerbatim(run, sourceText));

    // 翻字は照合スキップ（原理的に逐語照合不可）。api_nativeがある場合はnull想定
    const nameEn: GeneratedField<string> = {
      value: input.nativeNameEn !== null ? null : parsed.name_en.text,
      confidence: parsed.name_en.confidence,
      method: 'llm',
    };

    const { inputTokens, cachedInputTokens, outputTokens } = response.usage;
    const costUsd =
      (inputTokens * options.priceInPerMtok +
        cachedInputTokens * options.priceInPerMtok * 0.1 +
        outputTokens * options.priceOutPerMtok) /
      1_000_000;

    return {
      fields: {
        business_summary_en: summaryFailed ? { ...summary, verification_failed: true } : summary,
        name_en: nameEn,
      },
      usage: { inputTokens, cachedInputTokens, outputTokens, costUsd },
    };
  };
}
