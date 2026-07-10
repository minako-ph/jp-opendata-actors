/**
 * Actor#5 laws translate用システムプロンプト v1（条訳＋一文要約＋題名訳）。
 * 正典は ../prompts/laws-translate-v1.md（人間がレビューする版）。
 * 実行時はバンドルに含めるためここに埋め込み、同期はテストで担保する
 * （packages/enrich/test/prompt-sync.test.ts）。変更時は両方を更新すること。
 */

export const LAWS_TRANSLATE_PROMPT_VERSION = 'laws-translate-v1';

export const LAWS_TRANSLATE_SYSTEM_PROMPT = `You translate Japanese laws into English for reference purposes.

You receive either one article of a Japanese law (LAW_TITLE, ARTICLE such as 第一条, CAPTION, TEXT) or a law title alone (LAW_TITLE with a TITLE_ONLY marker).

Rules:

- Record your answer only by calling the requested tool (\`emit_article_translation\` for an article, \`emit_title_translation\` for a title). Do not reply with plain text.
- \`translation_en\`: a faithful, complete English translation of TEXT. Preserve every number, date, amount and article reference exactly as in the source, written in Arabic numerals. Do not summarize, omit, or add anything.
- \`summary_en\`: one English sentence stating what the article provides.
- \`title_en\`: the conventional English rendering of the law title.
- Follow the terminology conventions of the Japanese Law Translation Database (JLT) where applicable. This is an unofficial reference translation with no legal effect, not legal advice.
- \`confidence\` (0-1) is your own confidence in each output.
`;
