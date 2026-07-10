import { z } from 'zod';
import { convertKanjiNumerals, normalizeForVerbatimMatch } from '@jp-opendata/normalize-jp';
import type { CreateMessage, CreateMessageRequest, EnrichUsage } from './edinet.js';
import type { GeneratedField } from './verbatim.js';
import { LAWS_TRANSLATE_SYSTEM_PROMPT } from './prompt-laws-translate-v1.js';

/**
 * Actor#5 laws translation（FR-5 translated / docs/tasks-phase2.md）。
 * #1/#4と同型: 同期Messages API・temperature 0・tool useでJSONスキーマ固定・prompt caching。
 *
 * N-9運用（条文は数値が本質のため#1の数値禁止プロンプトは適用不可）:
 * - 英訳・要約中の数字列を「漢数字正規化済み原文」との**存在照合**にかける。
 *   不一致は**フラグのみ**（verification_failed: true・null化しない）＝N-9の要約文扱い。
 * - 題名訳（title_en）は照合対象外（数値を含まない前提・モデル自己評価confidenceで担保）。
 */

export interface ArticleTranslateInput {
  lawTitleJa: string;
  /** 「第一条」等の表示 */
  articleDisplayJa: string;
  captionJa: string | null;
  textJa: string;
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

export const LAWS_ARTICLE_TOOL: CreateMessageRequest['tool'] = {
  name: 'emit_article_translation',
  description: 'Record the English reference translation and summary of the article.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['translation_en', 'summary_en'],
    properties: {
      translation_en: {
        ...FIELD_JSON_SCHEMA,
        description: 'Faithful English translation preserving all numbers.',
      },
      summary_en: { ...FIELD_JSON_SCHEMA, description: 'One-sentence English summary.' },
    },
  },
};

export const LAWS_TITLE_TOOL: CreateMessageRequest['tool'] = {
  name: 'emit_title_translation',
  description: 'Record the conventional English rendering of the law title.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['title_en'],
    properties: {
      title_en: { ...FIELD_JSON_SCHEMA, description: 'English rendering of the law title.' },
    },
  },
};

// 実LLMはtool_choice強制でもまれに文字列省略形を返す（#4実測）→ confidence=0.5（不明）で受容
const fieldOutputSchema = z.preprocess(
  (value) => (typeof value === 'string' ? { text: value, confidence: 0.5 } : value),
  z.object({ text: z.string().nullable(), confidence: z.number().min(0).max(1) }),
);

const articleOutputSchema = z.object({
  translation_en: fieldOutputSchema,
  // 実LLMは長い条で要約を省略することがある（2026-07-10実測）。訳文が完全なら
  // 要約なし（null・confidence 0）として受容する
  summary_en: fieldOutputSchema.optional(),
});

const titleOutputSchema = z.object({ title_en: fieldOutputSchema });

export interface ArticleTranslatedFields extends Record<string, unknown> {
  translation_en: GeneratedField<string>;
  summary_en: GeneratedField<string>;
}

export interface ArticleTranslateResult {
  fields: ArticleTranslatedFields;
  usage: EnrichUsage;
}

export interface TitleTranslateResult {
  field: GeneratedField<string>;
  usage: EnrichUsage;
}

export interface LawsTranslator {
  translateArticle(input: ArticleTranslateInput): Promise<ArticleTranslateResult>;
  translateTitle(lawTitleJa: string): Promise<TitleTranslateResult>;
}

export const LAWS_TRANSLATE_DEFAULT_MODEL = 'claude-haiku-4-5';

export interface CreateLawsTranslatorOptions {
  model?: string;
  apiKey?: string;
  priceInPerMtok: number;
  priceOutPerMtok: number;
  /** テスト用の注入点。省略時は@anthropic-ai/sdkの同期Messages API */
  createMessage?: CreateMessage;
}

/** 生成文中の数字列（半角/全角カンマ・小数を含む。edinet.tsと同一regex） */
function digitRuns(text: string): string[] {
  return text.match(/\d[\d,，.]*\d|\d/g) ?? [];
}

/**
 * 存在照合: 英訳中の数字列が漢数字正規化済み原文に存在するか。
 * 原文は算用数字と漢数字が混在するため、convertKanjiNumeralsで正規化してから照合する。
 */
export function verifyDigitsAgainstKanjiSource(generated: string, sourceJa: string): boolean {
  const normalizedSource = normalizeForVerbatimMatch(convertKanjiNumerals(sourceJa));
  return digitRuns(generated).every((run) =>
    normalizedSource.includes(normalizeForVerbatimMatch(run)),
  );
}

function usageOf(
  response: { usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number } },
  options: CreateLawsTranslatorOptions,
): EnrichUsage {
  const { inputTokens, cachedInputTokens, outputTokens } = response.usage;
  const costUsd =
    (inputTokens * options.priceInPerMtok +
      cachedInputTokens * options.priceInPerMtok * 0.1 +
      outputTokens * options.priceOutPerMtok) /
    1_000_000;
  return { inputTokens, cachedInputTokens, outputTokens, costUsd };
}

export function createLawsTranslator(options: CreateLawsTranslatorOptions): LawsTranslator {
  const model = options.model ?? LAWS_TRANSLATE_DEFAULT_MODEL;
  let createMessage = options.createMessage;

  async function ensureCreateMessage(): Promise<CreateMessage> {
    if (createMessage === undefined) {
      if (!options.apiKey) {
        throw new Error(
          'createLawsTranslator: apiKey is required when createMessage is not injected.',
        );
      }
      const { createAnthropicCreateMessage } = await import('./anthropic.js');
      createMessage = createAnthropicCreateMessage({ apiKey: options.apiKey });
    }
    return createMessage;
  }

  return {
    async translateArticle(input) {
      const send = await ensureCreateMessage();
      // 長い条（定義条など）は英訳が数千トークンに達する。max_tokens切れはtool入力の
      // 欠損としてzodエラー→呼び出し側のbasicフォールバック（FR-C8）に落ちる
      const response = await send({
        model,
        maxTokens: 8000,
        system: LAWS_TRANSLATE_SYSTEM_PROMPT,
        userText: [
          `LAW_TITLE: ${input.lawTitleJa}`,
          `ARTICLE: ${input.articleDisplayJa}`,
          `CAPTION: ${input.captionJa ?? 'NOT AVAILABLE'}`,
          `TEXT:\n${input.textJa}`,
        ].join('\n'),
        tool: LAWS_ARTICLE_TOOL,
      });
      const parsed = articleOutputSchema.parse(response.toolInput);
      // 数字列の存在照合（原文＝条表示＋本文の漢数字正規化）。不一致はフラグのみ
      const sourceJa = `${input.articleDisplayJa}\n${input.textJa}`;
      const toField = (section: z.infer<typeof fieldOutputSchema>): GeneratedField<string> => {
        const field: GeneratedField<string> = {
          value: section.text,
          confidence: section.confidence,
          method: 'llm',
        };
        if (field.value !== null && !verifyDigitsAgainstKanjiSource(field.value, sourceJa)) {
          return { ...field, verification_failed: true };
        }
        return field;
      };
      return {
        fields: {
          translation_en: toField(parsed.translation_en),
          summary_en: toField(parsed.summary_en ?? { text: null, confidence: 0 }),
        },
        usage: usageOf(response, options),
      };
    },

    async translateTitle(lawTitleJa) {
      const send = await ensureCreateMessage();
      const response = await send({
        model,
        maxTokens: 300,
        system: LAWS_TRANSLATE_SYSTEM_PROMPT,
        userText: `TITLE_ONLY\nLAW_TITLE: ${lawTitleJa}`,
        tool: LAWS_TITLE_TOOL,
      });
      const parsed = titleOutputSchema.parse(response.toolInput);
      return {
        field: {
          value: parsed.title_en.text,
          confidence: parsed.title_en.confidence,
          method: 'llm',
        },
        usage: usageOf(response, options),
      };
    },
  };
}
