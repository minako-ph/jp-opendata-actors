import { z } from 'zod';
import { verifyVerbatim, type GeneratedField } from './verbatim.js';
import { EDINET_SUMMARY_SYSTEM_PROMPT } from './prompt-edinet-summary-v1.js';

/**
 * EDINETサマリenrichment（FR-1 enriched / 引継書§6 / 追補R2-1）。
 * 同期Messages API・temperature 0・tool useでJSONスキーマ固定。LLM呼び出しは
 * LlmInvoke注入点で抽象化し、テストではモック・実行時はAnthropicアダプタを渡す。
 *
 * 品質規律（N-9）: LLMには要約が依拠した固有名詞・数値の「原文そのままの文字列」を
 * source_termsとして出力させ、要約英文中の数値トークンと合わせてverifyVerbatimで
 * 原文照合する。1つでも不一致ならそのフィールドをnull＋verification_failed にする。
 */

export interface EdinetTextSections {
  business: string | null;
  risks: string | null;
  segments: string | null;
}

export interface LlmToolRequest {
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

export interface LlmToolResponse {
  /** tool useのinput（スキーマ検証は呼び出し側で行う） */
  input: unknown;
  usage: { inputTokens: number; outputTokens: number };
}

export type LlmInvoke = (request: LlmToolRequest) => Promise<LlmToolResponse>;

const SECTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'source_terms', 'confidence'],
  properties: {
    text: {
      type: ['string', 'null'],
      description: '2-3 English sentences, or null when the section is NOT AVAILABLE.',
    },
    source_terms: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Every Japanese proper noun and figure the summary relies on, each an exact verbatim substring of the source.',
    },
    confidence: { type: 'number', description: '0-1 confidence that the summary is faithful.' },
  },
};

export const EDINET_SUMMARY_TOOL: LlmToolRequest['tool'] = {
  name: 'record_edinet_summaries',
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
  source_terms: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

const summariesOutputSchema = z.object({
  business_overview: sectionOutputSchema,
  key_risks: sectionOutputSchema,
  segments: sectionOutputSchema,
});

export interface EdinetEnrichment extends Record<string, unknown> {
  business_overview_en: GeneratedField<string>;
  key_risks_en: GeneratedField<string>;
  segments_en: GeneratedField<string>;
}

export interface EnrichUsage {
  inputTokens: number;
  outputTokens: number;
  /** tokens×ENRICH_PRICE_*で算出した概算原価（R2-2の単価確定の入力。cache割引は未考慮の保守値） */
  costUsd: number;
}

export interface EdinetEnrichOutcome {
  /** LLMを実際に呼んだか（原文セクションが無い書類ではfalse＝enriched課金対象外） */
  invoked: boolean;
  enrichment: EdinetEnrichment;
  usage: EnrichUsage;
}

export interface EnrichPrices {
  usdPerMtokIn: number;
  usdPerMtokOut: number;
}

export const ENRICH_DEFAULT_MODEL = 'claude-haiku-4-5';

function nullField(confidence = 0): GeneratedField<string> {
  return { value: null, confidence, method: 'llm' };
}

export function emptyEdinetEnrichment(): EdinetEnrichment {
  return {
    business_overview_en: nullField(),
    key_risks_en: nullField(),
    segments_en: nullField(),
  };
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

/** 英文サマリ中の数値トークン（桁区切り・小数を含む）。末尾の句読点は除く */
function digitTokens(text: string): string[] {
  return (text.match(/\d[\d,.]*/g) ?? []).map((t) => t.replace(/[.,]+$/, ''));
}

function verifySection(
  section: z.infer<typeof sectionOutputSchema>,
  sourceText: string,
): GeneratedField<string> {
  if (section.text === null) {
    return { value: null, confidence: section.confidence, method: 'llm' };
  }
  const candidates = [...section.source_terms, ...digitTokens(section.text)];
  const failed = candidates.some((candidate) => !verifyVerbatim(candidate, sourceText));
  if (failed) {
    return {
      value: null,
      confidence: section.confidence,
      method: 'llm',
      verification_failed: true,
    };
  }
  return { value: section.text, confidence: section.confidence, method: 'llm' };
}

export async function enrichEdinetFiling(options: {
  sections: EdinetTextSections;
  invoke: LlmInvoke;
  prices: EnrichPrices;
  model?: string;
}): Promise<EdinetEnrichOutcome> {
  const { sections } = options;
  const sourceText = [sections.business, sections.risks, sections.segments]
    .filter((text): text is string => text !== null && text !== '')
    .join('\n');

  if (sourceText === '') {
    // 原文なし（ファンド等の別タクソノミ）→ LLMを呼ばず全null（推測禁止 N-9②）
    return {
      invoked: false,
      enrichment: emptyEdinetEnrichment(),
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    };
  }

  const response = await options.invoke({
    model: options.model ?? ENRICH_DEFAULT_MODEL,
    maxTokens: 1024,
    system: EDINET_SUMMARY_SYSTEM_PROMPT,
    userText: buildEdinetSummaryUserText(sections),
    tool: EDINET_SUMMARY_TOOL,
  });
  const parsed = summariesOutputSchema.parse(response.input);

  const costUsd =
    (response.usage.inputTokens * options.prices.usdPerMtokIn +
      response.usage.outputTokens * options.prices.usdPerMtokOut) /
    1_000_000;

  return {
    invoked: true,
    enrichment: {
      business_overview_en: verifySection(parsed.business_overview, sourceText),
      key_risks_en: verifySection(parsed.key_risks, sourceText),
      segments_en: verifySection(parsed.segments, sourceText),
    },
    usage: {
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      costUsd,
    },
  };
}
