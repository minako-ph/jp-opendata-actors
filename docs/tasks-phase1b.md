# Phase 1b 実行指示書 — enrich実装＋レビュー残対応（2026-07-08）

保存先: `docs/tasks-phase1b.md` ／ 実施者: Claude Code ／ 目的: 公開ゲート3を「(a) enrich実装完了」で解消し、Actor#1をbasic＋enrichedのフル形態で公開可能な状態にする。
参照順: 本書 → `docs/review-2026-07-08.md` → `docs/addendum-v1.1.md`（R2-1/R2-2） → 要件書FR-1/N-9。

---

## Step 0: 前提確認

- [ ] `docs/review-2026-07-08.md` の**F-1〜F-7が対応済みか確認**。未対応ならenrichより先に全件対応する（特にF-1キー漏洩は公開ブロッカー。F-2のComing soon注記は本書Step 4で除去するので、未対応ならF-2はスキップして良い）。
- [ ] CIグリーン（typecheck / lint / format:check / test / bundle）を着手前に確認。

## Step 1: 原文テキストの抽出（`actors/edinet-filings/src/textblocks.ts` 新規）

enrichの入力原文は**既取得のCSV zip（type=5）内のTextBlock行**から取る。**EDINETへの追加APIコールは禁止**（原価と負荷を増やさない）。

1. 実fixture（`document.S100YIZC.csv.trimmed.zip`・`document.S100YNCJ.csv.trimmed.zip`）を展開し、elementIdに`TextBlock`を含む行を一覧して、以下3節に対応するIDを**実データで特定**する（financials.tsと同じ候補リスト方式。fixtureで確認できないIDを推測で書かない＝N-9②）:
   - 事業の内容 — 候補起点: `jpcrp_cor:DescriptionOfBusinessTextBlock`（要実データ確認）
   - 事業等のリスク — 候補起点: `jpcrp_cor:BusinessRisksTextBlock`（要実データ確認）
   - セグメント情報 — 実データから特定（財務諸表注記側の可能性あり）
   ※ trimmed fixtureにTextBlock行が残っていない場合は、`scripts/live-verify.ts`を拡張してTextBlock行の存在するdocIDから**当該行のみ**再採取し、fixtureを更新（キー混入禁止・値の改変なし。goldenのdiffレビューは事業主）。
2. `extractTextBlocks(rows): { business: string|null; risks: string|null; segments: string|null }` を実装:
   - HTMLタグ除去（`<[^>]+>`→空白）、実体参照の最低限デコード（&amp; &lt; &gt; &quot; &#x…;）、連続空白の圧縮。
   - 節別の文字数上限で切り詰め: business 3,000字 / risks 6,000字 / segments 3,000字（定数。合計≒6〜8kトークン想定）。切り詰めたら`truncated`フラグを内部で持つ。
3. ユニットテスト: 実fixture由来の行から3節が取れること、HTML除去、上限切り詰め。

## Step 2: LLM呼び出し本体（`packages/enrich` 拡張）

追補**R2-1準拠: 同期Messages API**（Batch禁止）。`@anthropic-ai/sdk` を packages/enrich の dependencies に追加。

1. プロンプトを `packages/enrich/prompts/edinet-summary-v1.md` に新規作成。要点:
   - 役割: 日本の有価証券報告書の抜粋から英文サマリを作る。**原文にない事実の生成禁止・該当節がなければnull**。
   - 出力は各2〜3文の英語: business_overview / key_risks / segments。
   - **具体的な数値・金額を要約文に書かない**（定性表現のみ。数値はbasicのfinancialsが担う）— 逐語照合を単純化するための設計判断。
   - 各フィールドに自己評価confidence（0〜1）を付ける。
2. `createEnricher(options)` を実装:
   - options: `{ model, apiKey, priceInPerMtok, priceOutPerMtok, createMessage? }`。`createMessage`はAnthropic SDK呼び出しの注入点（テストでモック差し替え）。
   - 呼び出し: temperature 0、`tools`+`tool_choice`でJSONスキーマ固定（tool名 `emit_summary`）、systemプロンプトは`cache_control: {type:'ephemeral'}`で**prompt caching**、max_tokens 1200。
   - 返り値: `{ fields: { business_overview_en, key_risks_en, segments_en }, usage: { inputTokens, cachedInputTokens, outputTokens, costUsd } }`。
   - 原価式（近似）: `cost = in×P_in + cached_in×P_in×0.1 + out×P_out`（USD/Mtok換算。近似である旨コメント）。
   - 各フィールドは既存の `GeneratedField<string>`（method:'llm'、confidence=モデル自己評価）。
3. **逐語照合（N-9運用）**: 生成文中の数字列（`/\d[\d,，.]*\d|\d/`で抽出）を `verifyVerbatim` で原文（3節連結）と照合。要約文は**フラグのみ**（null化しない）: 1つでも不一致なら当該フィールドに `verification_failed: true`。プロンプトで数値禁止にしているため、通常は数字列ゼロ＝照合スキップになる。
4. ユニットテスト（`createMessage`モック）: 正常系（fields＋cost算出）／数値混入→フラグ／API例外はそのままthrow（フォールバックは呼び出し側の責務）。

## Step 3: Actorへの配線（`actors/edinet-filings/src/run.ts`・`main.ts`）

1. `RunDeps` に `enricher?: EnricherLike` を追加（インターフェースはactor側に定義し、実装注入）。`main.ts`で `ANTHROPIC_API_KEY` があれば `createEnricher` を生成して渡す。enrich=trueかつキー未設定は**実行失敗**（RunFailedError:「ANTHROPIC_API_KEY is not set」）— 黙ってbasicに落とさない（課金約束との不整合防止）。
2. enrich=true時のフロー（書類ごと、basic push後）:
   - `extractTextBlocks` で原文取得。**3節すべてnull（原文なし・ファンド等）→ enrichedはnullのまま・課金なし**（`enrich_skipped_no_text`をサマリでカウント）。
   - enricher呼び出し成功 → アイテムに `enriched: { business_overview_en, key_risks_en, segments_en, model, prompt_version: 'edinet-summary-v1' }` を含めてpushし、`billing.charge('record-enriched')`（**freeAllowance適用なし**）。limitReached→既存のgraceful打ち切りに合流。
   - enricher例外 → **basicのみでpush継続**（FR-C8）。`enriched: null`、enriched課金なし、`enrich_failures`をカウント、warning 1行（エラーメッセージにキー・原文を含めない）。
   - 実装上の注意: 現状の「push→charge」順序を保ちつつ、enrich有効時は**enrich結果を待ってから1回だけpush**する（basic pushとenriched pushの二重出力にしない）。
3. `RunSummary` に追加: `enrich_records / enrich_failures / enrich_skipped_no_text / enrich_cost_usd_total / enrich_cost_usd_avg`。終端ログで平均原価と**85%マージン推奨単価（avg/0.15）**を1行出力（単価確定の入力）。
4. 陳腐化コメント修正: run.ts の `TODO(Phase 1b): packages/enrichのBatch API実装後に接続する` は**R2-1と矛盾**（Batch禁止）。同期API前提の記述に修正。
5. テスト追加（enricherモック注入）: ①成功→enriched付きアイテム＋record-enriched発火 ②enricher例外→basic出力・enriched課金なし・実行は成功 ③原文なし→スキップ課金なし ④enrich=true＋キーなし→RunFailedError（main側はE2Eでなくrun側の前提条件検証として）。goldenはbasic系を変更しない（enrichテストはgolden化せずassertで検証）。

## Step 4: 掲載物の更新（F-2の巻き戻し）

1. `input_schema.json` の enrich説明から「Coming soon…」を除去し、動作どおりの説明へ（per-record課金・数値は含まない定性サマリである旨）。
2. README: enrich段落の`**Coming soon.**`除去。Pricing表の record-enriched を `$0.0XX — finalized from measured LLM cost before launch` のプレースホルダ表記にし、**実測確定後に実額へ差し替える**保留タスクをlaunch文書に記載。
3. `docs/launch/edinet-filings.md`: 公開ゲート3を「**(a)で解消済み（2026-07-08）**」に更新し、残作業として「①事業主が `scripts/live-enrich.ts` で平均原価を実測 → ②record-enriched単価を確定（85%マージン） → ③READMEのPricing実額反映→再push → ④コンソールのPPEに同額設定」を明記。

## Step 5: 実測スクリプト（`actors/edinet-filings/scripts/live-enrich.ts` 新規）

要 `EDINET_API_KEY`・`ANTHROPIC_API_KEY`。指定日（引数、既定はprefill範囲）から**有報10件**を対象に: basic抽出→enrich実行→件別の tokens/cost、平均cost、**推奨単価（avg/0.15）**、サンプル出力2件を表示。dataset書き込み・課金なし。結果はコミットしない（人間がNotionチェックリスト§4で使用）。

## Step 6: 仕上げ・完了条件

1. `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test` グリーン、`pnpm --filter @jp-opendata/actor-edinet-filings build` 成功（@anthropic-ai/sdk同梱でbundleサイズ増は許容）。
2. golden差分が出た場合は自動コミットせず、diffの要約を報告して事業主レビューを仰ぐ。
3. `docs/decisions.md` に1行記録（例: 「2026-07-08 Phase 1b: enrich実装（同期API＋caching、数値禁止プロンプト＋数字列照合、原価集計と推奨単価ログ）。ゲート3を(a)で解消、単価実測は事業主タスク」）。
4. 本書のチェックボックスを全て埋めた状態でコミット（メッセージ例: `feat(edinet): implement enriched summaries (Phase 1b) + docs`）。

## やらないこと（本書スコープ外・絶対規則の再掲）

Batch APIの使用（R2-1違反）／EDINETへの追加コール／enrichedへのfreeAllowance適用／goldenの自動上書き／単価のREADME実額記載（実測前）／プロンプトへの数値要約の許可。
