# prompts

LLM enrichment のプロンプトをここでバージョン管理する（引継書§6）。
命名: `<actor>-<用途>-v<N>.md`（例: `edinet-summary-v1.md`）。

- `edinet-summary-v1.md` — Actor#1 の事業概要・主要リスク・セグメントサマリ（正典）。
  実行時は `src/prompt-edinet-summary-v1.ts` の埋め込み定数を使い、両者の同期は
  `test/prompt-sync.test.ts` で担保する。改訂時は両方を更新しv2として増やす。
