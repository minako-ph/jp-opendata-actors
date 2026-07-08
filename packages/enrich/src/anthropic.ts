import Anthropic from '@anthropic-ai/sdk';
import type { CreateMessage } from './edinet.js';

/**
 * 同期Messages APIアダプタ（追補R2-1）。createEnricherの既定createMessage実装。
 * - temperature 0・tools+tool_choice固定でJSONスキーマ出力を強制
 * - システムプロンプトにcache_controlを付与（prompt caching。注: claude-haiku-4-5の
 *   最小キャッシュ長は4096トークンのため、短いプロンプトでは実際にはキャッシュされない）
 * - usageは通常入力とcache読取を分離して返す（原価式の入力）。cache書込(1.25×)は
 *   通常入力として計上する近似
 */
export function createAnthropicCreateMessage(options: { apiKey: string }): CreateMessage {
  const client = new Anthropic({ apiKey: options.apiKey });
  return async (request) => {
    const response = await client.messages.create({
      model: request.model,
      max_tokens: request.maxTokens,
      temperature: 0,
      system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: request.userText }],
      tools: [
        {
          name: request.tool.name,
          description: request.tool.description,
          input_schema: request.tool.inputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: request.tool.name },
    });

    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (toolUse === undefined) {
      throw new Error(
        `LLM did not call ${request.tool.name} (stop_reason=${String(response.stop_reason)})`,
      );
    }
    const usage = response.usage;
    return {
      toolInput: toolUse.input,
      usage: {
        inputTokens: usage.input_tokens + (usage.cache_creation_input_tokens ?? 0),
        cachedInputTokens: usage.cache_read_input_tokens ?? 0,
        outputTokens: usage.output_tokens,
      },
    };
  };
}
