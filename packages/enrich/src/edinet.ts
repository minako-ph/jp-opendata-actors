import { z } from 'zod';
import { verifyVerbatim, type GeneratedField } from './verbatim.js';
import { EDINET_SUMMARY_SYSTEM_PROMPT } from './prompt-edinet-summary-v1.js';

/**
 * EDINETサマリenrichment（FR-1 enriched / 追補R2-1 / Phase 1b Step 2）。
 * 同期Messages API（Batch禁止）・temperature 0・tools+tool_choiceでJSONスキーマ固定
 * （tool名 emit_summary）・systemプロンプトはprompt caching・max_tokens 1200。
 *
 * N-9運用: プロンプトで数値・金額の要約文への記載を禁止しているため、通常は生成文に
 * 数字列が現れない（＝照合スキップ）。数字列が混入した場合は原文（3節連結）と
 * verifyVerbatimで照合し、不一致なら**要約文はフラグのみ**（verification_failed: true、
 * null化しない）。
 */

export interface EdinetTextSections {
  business: string | null;
  risks: string | null;
  segments: string | null;
}

/** Anthropic SDK呼び出しの注入点（テストでモック差し替え） */
export interface CreateMessageRequest {
  model: string;
  maxTokens: number;
  system: string;
  userText: string;
  tool: {
    name: string;
    description: string;
    inputSchema: { type: 'object' } & Record<string, unknown>;
  };
}

export interface CreateMessageResponse {
  /** tool useのinput（スキーマ検証は呼び出し側で行う） */
  toolInput: unknown;
  usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number };
}

export type CreateMessage = (request: CreateMessageRequest) => Promise<CreateMessageResponse>;

const SECTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'confidence'],
  properties: {
    text: {
      type: ['string', 'null'],
      description:
        '2-3 English sentences with no figures, or null when the section is NOT AVAILABLE.',
    },
    confidence: { type: 'number', description: '0-1 confidence that the summary is faithful.' },
  },
};

export const EDINET_SUMMARY_TOOL: CreateMessageRequest['tool'] = {
  name: 'emit_summary',
  description: 'Record the English summaries of the EDINET filing sections.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['business_overview', 'key_risks', 'segments'],
    properties: {
      business_overview: SECTION_JSON_SCHEMA,
      key_risks: SECTION_JSON_SCHEMA,
      segments: SECTION_JSON_SCHEMA,
    },
  },
};

const sectionOutputSchema = z.object({
  text: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

const summariesOutputSchema = z.object({
  business_overview: sectionOutputSchema,
  key_risks: sectionOutputSchema,
  segments: sectionOutputSchema,
});

export interface EnrichedFields extends Record<string, unknown> {
  business_overview_en: GeneratedField<string>;
  key_risks_en: GeneratedField<string>;
  segments_en: GeneratedField<string>;
}

export interface EnrichUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  /** 概算原価（USD）。cache読取は0.1×で近似（cache書込の1.25×は未考慮） */
  costUsd: number;
}

export interface EnrichResult {
  fields: EnrichedFields;
  usage: EnrichUsage;
}

/** enrich=true時にActorが呼ぶ関数（3節すべてnullの書類はActor側でスキップする） */
export type Enricher = (sections: EdinetTextSections) => Promise<EnrichResult>;

export const ENRICH_DEFAULT_MODEL = 'claude-haiku-4-5';

export interface CreateEnricherOptions {
  model?: string;
  /** createMessage未指定時に必須（実Anthropicクライアントを生成する） */
  apiKey?: string;
  priceInPerMtok: number;
  priceOutPerMtok: number;
  /** テスト用の注入点。省略時は@anthropic-ai/sdkの同期Messages API */
  createMessage?: CreateMessage;
}

function sectionBlock(label: string, text: string | null): string {
  return `## ${label}\n${text ?? 'NOT AVAILABLE'}`;
}

export function buildEdinetSummaryUserText(sections: EdinetTextSections): string {
  return [
    sectionBlock('BUSINESS (事業の内容)', sections.business),
    sectionBlock('RISKS (事業等のリスク)', sections.risks),
    sectionBlock('SEGMENTS (セグメント情報)', sections.segments),
  ].join('\n\n');
}

/** 生成文中の数字列（半角/全角カンマ・小数を含む）。Phase 1b Step 2-3の指定regex */
function digitRuns(text: string): string[] {
  return text.match(/\d[\d,，.]*\d|\d/g) ?? [];
}

function toField(
  section: z.infer<typeof sectionOutputSchema>,
  sourceText: string,
): GeneratedField<string> {
  if (section.text === null) {
    return { value: null, confidence: section.confidence, method: 'llm' };
  }
  // 要約文はフラグのみ（null化しない）: 数字列が1つでも原文不一致ならverification_failed
  const failed = digitRuns(section.text).some((run) => !verifyVerbatim(run, sourceText));
  const field: GeneratedField<string> = {
    value: section.text,
    confidence: section.confidence,
    method: 'llm',
  };
  return failed ? { ...field, verification_failed: true } : field;
}

export function createEnricher(options: CreateEnricherOptions): Enricher {
  const model = options.model ?? ENRICH_DEFAULT_MODEL;
  let createMessage = options.createMessage;

  return async (sections) => {
    if (createMessage === undefined) {
      if (!options.apiKey) {
        throw new Error('createEnricher: apiKey is required when createMessage is not injected.');
      }
      // 遅延import相当: 実クライアントは初回呼び出し時に生成（テスト経路でSDKを触らない）
      const { createAnthropicCreateMessage } = await import('./anthropic.js');
      createMessage = createAnthropicCreateMessage({ apiKey: options.apiKey });
    }

    const sourceText = [sections.business, sections.risks, sections.segments]
      .filter((text): text is string => text !== null && text !== '')
      .join('\n');

    const response = await createMessage({
      model,
      maxTokens: 1200,
      system: EDINET_SUMMARY_SYSTEM_PROMPT,
      userText: buildEdinetSummaryUserText(sections),
      tool: EDINET_SUMMARY_TOOL,
    });
    const parsed = summariesOutputSchema.parse(response.toolInput);

    const { inputTokens, cachedInputTokens, outputTokens } = response.usage;
    // 原価式（近似）: in×P_in + cached_in×P_in×0.1 + out×P_out（USD/Mtok換算）
    const costUsd =
      (inputTokens * options.priceInPerMtok +
        cachedInputTokens * options.priceInPerMtok * 0.1 +
        outputTokens * options.priceOutPerMtok) /
      1_000_000;

    return {
      fields: {
        business_overview_en: toField(parsed.business_overview, sourceText),
        key_risks_en: toField(parsed.key_risks, sourceText),
        segments_en: toField(parsed.segments, sourceText),
      },
      usage: { inputTokens, cachedInputTokens, outputTokens, costUsd },
    };
  };
}
