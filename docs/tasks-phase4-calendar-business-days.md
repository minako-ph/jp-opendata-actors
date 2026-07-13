# Phase 4 実行指示書 — Actor #7: calendar-business-days（Japan Business Days & Calendar）移植・実装（2026-07-13）

保存先: `docs/tasks-phase4-calendar-business-days.md` ／ 実施者: Claude Code ／ 実施順: Step 0 → 1 → 2 → 3 → 4 → 5 → 6
目的: 要件追加文書v1.0（`docs/requirements-calendar-business-days.md`）を満たすActor #7を、レビュー済みの jp-business-api コアの**無改変移植**で実装し、「実装＋golden回帰グリーン、残りは人間手作業（apify push・Store公開・PPE設定）のみ」の状態にする。
参照の正: 本書 → `docs/requirements-calendar-business-days.md`（FR7-x/N7-x/CR7-x。#7範囲の正） → 既存 `docs/requirements.md`（FR-C/N系）／`docs/addendum-v1.1.md`（R2-*）／`docs/handover.md` §13。矛盾時はこの順で優先。
移植元: `https://github.com/minako-ph/jp-business-api`（ローカル `~/s/jp-business-api` があればそれを読み取り専用で参照。無ければ `--depth 1` でclone）。**移植元リポジトリへの変更・コミットは一切行わない**。

---

## Step 0: 前提確認

- [ ] mainがCI緑（`pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`・259テスト基準）を着手前に確認。
- [ ] `docs/requirements-calendar-business-days.md` が配置済みであることを確認（無ければ中断して事業主へ報告）。
- [ ] 移植元 jp-business-api を読み取り参照できることを確認（`SYNC.md`・`src/core/`・`src/generated/holidays-data.ts`・`data/`・`test/`）。

## Step 1: normalize-jp 同一性の検証（監査ではなく確認）

移植元の `packages/normalize-jp` は本リポジトリからのsubtree・読み取り専用規律（移植元 `SYNC.md`）。

1. [ ] 移植元 `packages/normalize-jp/src` と本リポジトリ `packages/normalize-jp/src` をdiffし、**内容同一**を確認する（SYNC.md規律どおりなら差分ゼロのはず）。
2. [ ] 万一差分があれば**中断して事業主へ報告**（勝手に上流反映しない）。同一なら decisions.md 記録用に「差分ゼロ確認」を控えておく。

## Step 2: コア移植（`actors/calendar-business-days/src/core/`）

1. [ ] 移植対象: `src/core/{date-utils,era,holidays,business-days}.ts`・`src/generated/holidays-data.ts`・`data/syukujitsu-snapshot.csv`（＋`data/README.md`）・`scripts/{fetch-holidays,build-holidays}.ts`・対応する `test/{date-utils,era,holidays,business-days}.test.ts`。
2. [ ] 移植は**コピー＋monorepo流儀への最小調整のみ**（import経路を `@jp-opendata/normalize-jp` へ、パス定数をactor配下へ）。**ロジック・定数・判定順・エラーメッセージの改変禁止**——等価性は移植テストの全緑で保証する。出典コメントヘッダ（内閣府CSV・URL変更履歴の注意書き）は維持する。
3. [ ] `fetch-holidays` / `build-holidays` はactorの `package.json` scripts に載せ、**手動実行のみ**（CI・実行時から呼ばない）であることをスクリプト冒頭コメントで維持。
4. [ ] snapshot・生成物は移植元の現行コミットのものをそのまま採用（再fetchしない。COVERED_FROM/COVERED_TO が変わるとgoldenの根拠が動くため）。

## Step 3: Actor実装（`actors/calendar-business-days` 新規）

構成・型は**#3（real-estate-prices）を参照実装**として完全踏襲（LLM不使用・enrich依存なし）: RunDeps注入のApify非依存コア／billing（freeAllowance・ChargeResult graceful）・attribution共用／esbuild単一bundle＋createRequireバナー。

1. [ ] 雛形: `.actor/actor.json`（name `japan-business-days-calendar`・title `Japan Business Days & Calendar (Cabinet Office Official)`・descriptionは本書「掲載文言」節の通常説明文）／`input_schema.json`／Dockerfile／`package.json`（`@jp-opendata/actor-calendar-business-days`）／`package.docker.json`。**enrichパッケージ・gov-clientsへの依存を追加しない**（外部API呼び出しなし）。
2. [ ] 入力（FR7-1）: `operation` enum（`date_info` / `wareki_to_western` / `holidays` / `holidays_next` / `business_days_add` / `business_days_count`）＋operation別フィールド＋共通オプション（`weekend_days` 既定土日／`include_national_holidays` 既定true／`extra_holidays[]` 上限100）。入力項目合計1,000/runで打ち切り（FR-C7・graceful）。prefillは `date_info`×固定4日付（改元境界2日＋振替休日1日＋平日1日。**振替休日の日付はsnapshotの祝日行に実在するものを選ぶ**——推測で書かない）。
3. [ ] MCP向けdescription: 全フィールドに具体例（和暦表記ゆれ3形式・weekend_daysの曜日名・extra_holidaysの用途=会社独自休業日）。`holidays_next` の `from_date` 省略時today JSTの旨を明記。
4. [ ] `src/run.ts`: 項目単位 `_error`（不正日付・パース不能・収録範囲外。covered_from/covered_toをメッセージに含める）で継続・**非課金**。有効レコードのみ `billing.charge('record-basic')`×freeAllowance 50件/実行。入力全項目不正のみ実行失敗。
5. [ ] `src/transform.ts`: 移植元エンドポイント返却フィールドとの同値性（FR7-2・snake_case維持）＋FR-C2共通メタ＋`attribution`「出典：内閣府「国民の祝日」」＋`schema_version: "0.1.0"`＋`operation`。**新規フィールドを発明しない**——移植元 `src/routes/` の返却形とテスト・goldenで突合して確定。
6. [ ] N7-2 鮮度ガード: 実行時 `today > COVERED_TO − 90日` でサマリ警告＋`ALERT_WEBHOOK_URL` 通知（1回/実行）。
7. [ ] `scripts/live-e2e.ts`: prefill入力での実機確認（30秒以内に最初の結果・課金ログは `ACTOR_TEST_PAY_PER_EVENT=1`＋`ACTOR_USE_CHARGING_LOG_DATASET=1` で無料枠50の実配線と `_error` 非課金を確認）。

## Step 4: テスト・golden

1. [ ] unit: 移植4ファイルのテスト全緑（Step 2）＋actor層（入力バリデーション・上限打ち切り・_error生成・課金カウント）。
2. [ ] golden: 6 operation系統＋境界ケース（改元境界2019-04-30/05-01・振替休日・`extra_holidays`・収録範囲外`_error`・和暦表記ゆれ「令和8年7月11日／R8.7.11／reiwa 8」）。`holidays_next` は `from_date` 明示で決定化。**候補生成は`GOLDEN_UPDATE=1`、diffは自動コミットせず要約を報告して事業主レビューを仰ぐ**。
3. [ ] 移植元goldenとの突合: 同一入力に対する値の同値性をスポット確認（形式差＝共通メタ追加分のみ許容）し、確認結果を完了報告に記載。
4. [ ] 既存#1〜#6の全テスト・goldenが**変更ゼロ**で緑。

## Step 5: README・掲載文言・CI・文書整合

1. [ ] README: マーケ§5.3の7節構成・300語以上・実golden由来の出力サンプルJSON（date_infoの改元境界ペアを見せる）・**CR7-3の正直明記**（祝日一覧だけなら無料代替=Nager.Date系Actor・オープンデータが存在する。本Actorの価値は営業日演算・和暦パース・独自休業日）・CR7-2（英語名は参考訳）・CR7-4（法改正で変更されうる）・CR7-5（1873年前非対応・範囲外は明示エラー）・Pricing（$0.003・start $0.02・無料50件/実行）・出典「出典：内閣府「国民の祝日」」＋外部リンク・#1相互参照（**リンクなし太字規約**——実URL化は公開後の人間タスク。用途例:「#1の入札締切日から残営業日を数える」）。
2. [ ] `docs/marketing.md` 更新: §5.1表・§5.2確定文言リスト・§5.4キーワードマップに#7行を追加（**文言は本書「掲載文言」節が正。一字一句そのまま転記**）。
3. [ ] `.github/workflows/ci.yml` に `pnpm --filter @jp-opendata/actor-calendar-business-days build` を追加（bundle 7本）。
4. [ ] `AGENTS.md` の読み順に `docs/requirements-calendar-business-days.md` の1行を追加（FIX-4と同型。CLAUDE.mdはsymlinkのため同時反映）。
5. [ ] ルートREADME等の「6本」表記を7本へ（2026-07-12 FIX-3と同型の箇所確認）。requirements/handoverの本数前提は追補パターンで次回全面改訂まで据え置き。

## Step 6: 記録・完了報告

1. [ ] `docs/decisions.md` に記録（1行/件・新しいものを上）: ①2026-07-13 #7統合決定（jp-business-api→Actor化。RapidAPI公開中止=Nokia買収後の市場縮小・チャネル整理として。詳細は要件追加文書§1・§9） ②record-basic $0.003・無料枠50/実行 確定（チャット側Claude承認・家族#3同額の整合優先） ③KPI特例（要件§8の4点。**公開前記録**） ④normalize-jp差分ゼロ確認 ⑤移植元goldenとの同値性確認サマリ。
2. [ ] コミット例: `feat(calendar-business-days): add Actor #7 — Japan business days, holidays & wareki (port from jp-business-api) (FR7)`
3. [ ] 完了報告に必ず含める: golden diff要約（6系統＋境界）／移植元との同値性確認結果／柱3再同期の要否（normalize-jp無変更なら「不要」の明記で可）／**「残り（人間タスク）」節**（apify push・PPE設定・Store公開・#1再push・旧repoアーカイブ・LP再ポイント。NotionのA7チェックリストと対応）。

## 完了条件（全体）

typecheck／lint／format:check／test（既存全Actor含む）／bundle生成**7本すべて**が緑。golden差分は自動採用せず要約を報告。decisions記録5点。完了報告に「残り（人間タスク）」節。

## やらないこと

- 価格・イベント名を変えない（`record-basic` $0.003・`apify-actor-start` $0.02。変更提案があれば完了報告に書き、実施しない）
- Store公開・apify pushは人間のみ
- **ランタイムCSV取得への変更禁止**（N7-1。snapshot設計を維持）
- LLM・enriched系イベントの追加禁止
- 移植元 jp-business-api リポジトリへの変更・コミット・削除は一切しない（アーカイブは人間タスク）
- golden自動コミット禁止（要約報告→事業主レビュー）
- Batch API禁止（家族共通）
- コアロジックの「改善」禁止（等価移植のみ。気づきは完了報告に記載）

## 掲載文言（この節が#7掲載コピーの正。marketing.md §5へそのまま転記）

- Store名（通常）: `Japan Business Days & Calendar (Cabinet Office Official)` ／ スラッグ: `japan-business-days-calendar`
- SEO名（Google向け）: `Japan Business Days & Holidays API — Wareki (Japanese Era) Conversion`
- 通常説明文（actor.json description兼用）: `Japanese business-day calculations, national holidays, and wareki (era) conversion. Official Cabinet Office holiday data, deterministic JSON output.`
- SEO説明文: `Japan business days API. Check, add & count business days with Japanese national holidays & custom closures. Wareki era conversion both ways. Official Cabinet Office data, JSON.`
- タグ候補: japan, business-days, holidays, calendar, wareki, japanese-era, official-api（公開時の現行タグ体系で確定） ／ 推奨カテゴリ: Developer tools（無ければAutomation／Business）
- §5.4キーワード: japan business days api / japanese holidays api / wareki conversion / japanese era date / japan calendar api / business day calculator japan
