# Phase 2 実行指示書 — #3レビュー対応・launch廃止・Actor #2/#4/#5 実装（2026-07-10）

保存先: `docs/tasks-phase2.md` ／ 実施者: Claude Code ／ 実施順: Step 0-A → 0-B → #2 → #4 → #5
参照の正: 要件書v2.0（FR/N/単価）／追補v1.1（R2-*）／マーケ戦略書§5（掲載文言）／`docs/review-2026-07-09-actor3.md`。矛盾時はこの順で優先。

---

## Step 0-A: #3レビュー対応（最初に・必須）

`docs/review-2026-07-09-actor3.md` を読み、**FIX-1**（aggregate.tsのリテラルNULバイト→`\u0000`エスケープ。完了確認3点込み）と**FIX-2**（無料枠50件の来歴補記）を実施。あわせてdecisions.mdに次の1行を追加:
「2026-07-10 #3実装は第三者レビュー承認済み（review-2026-07-09-actor3.md・121テスト/実機起動検証済み）」
※同レビュー文書内の「launch文書タスク」という語は、Step 0-B以降「Notionの人間タスク」と読み替える。

## Step 0-B: docs/launch/ の廃止（判断済み・事業主承認済み）

**判断根拠**: launch文書の内容は ①SEO/掲載文言→marketing.md §5が正 ②単価・設定値→要件書§7/追補/decisions ③ゲート履歴→decisions.md ④人間チェックリスト→Notion（事業主管理）と全面重複し、独立した正典ではない。ユニーク情報のみ移植して削除する。

1. **移植①（掲載文言→marketing.md）**: §5.2を「Actor別の確定文言リスト」に拡張し、#1と#3の**SEO説明文・タグ候補・推奨カテゴリ**（launch文書に記載の確定値）を移す。以後、#2/#4/#5の掲載文言もここに追記していく（§5.1のSEO名表とセットで「掲載文言の正」を完結させる）。
2. **移植②（decisions.mdへ2行）**: 「#1の残作業はコンソールのみ（PPE $0.079設定・payout・SEO・permissions=limited・dataset-item削除）」「#3の残作業はコンソールのみ（無料枠50/100確定・PPE $0.003・#1へ相互リンク追記→#1再push）」。
3. `docs/launch/` ディレクトリを削除。`docs/research/store-scan-real-estate.md` 内の参照は「（人間タスク・Notionで管理）」に修正。過去日付の文書（decisions/review-2026-07-08/tasks-phase1b）内の言及は履歴としてそのまま残す。
4. AGENTS.mdに運用ルールを1行追加: 「人間向けチェックリストはリポジトリに置かない。各実装の完了報告に『残り（人間タスク）』節を箇条書きで必ず含める（事業主がNotionへ転記する）。掲載文言の正はmarketing.md §5、設定値の正は要件書§7とdecisions.md」。

## 共通仕様（#2/#4/#5すべて・#1/#3の型を完全踏襲）

RunDeps注入のApify非依存コア／billing（freeAllowance・ChargeResult graceful）・attribution・gov-clients/monitoring共用／実応答fixture＋golden＋drift検知をCI必須化／esbuild単一bundle＋createRequireバナー＋CIにbundleステップ追加／README＝マーケ§5.3の7節＋正直明記＋出力サンプルJSON／research文書＋decisions記録／キーはredact済みhttp層のみ経由・fixture混入禁止／**完了報告に「残り（人間タスク）」節を必ず含める**（Step 0-B-4）。

| # | dir | イベント/単価 | 無料枠/run（仮置き） | 上限/run（FR-C7） | 公開ゲート |
|---|---|---|---|---|---|
| 2 | subsidies-grants | record-basic **$0.004** | 50件 | 対象法人500社 or 横断500件（新規定義・decisionsに記録） | なし |
| 4 | company-enrichment | basic **$0.006**／enriched **$0.019仮置き**（実測後R2-2で確定） | 20社 | 1,000社 | **Store公開＝国税庁ID到着後**（実装・push・PPEドラフトは先行可） |
| 5 | laws-structured→**laws-regulationsに改名**（slug整合・#3の前例） | basic **$0.004/条**／translated **$0.029仮置き**（実測後確定） | 20条 | 200条 | なし |

## Actor #2: Japan Subsidies & Grants Data（最初・最軽量）

**Step 0**（`docs/research/gbizinfo-subsidy.md` 新規）:
- (a) **data_origin問題の解消**: v2で補助金レコードからnote（備考）が削除済み（decisions既記録）。`meta-data.source`等でjGrants由来の識別可否を実データで検証。**不可なら`data_origin`フィールドを廃止**し「jGrants由来の識別はv2データでは不可」をREADMEに正直明記＋FR-2からの逸脱をdecisionsに記録。
- (b) 横断検索（法人検索API: `subsidy`/`ministry`/`source=4`）の実仕様（ページング・件数上限・返却形）を確認。

**実装**:
- 入力: `corporate_numbers[]` ／ `company_names[]`（houjinの名称解決。確度モデルはexact/selected/ambiguous/not_found＝#4と共通化） ／ `date_from`+`date_to`+`ministry`（横断）。いずれか必須。
- 出力（basic）: FR-2の項目＋共通メタ。府省名ENは辞書＋ルール（normalize-jp拡張）。**LLM不使用・enriched層は作らない**（要件どおり）。
- 正直明記: ①掲載は各府省の公開許諾分のみ＝悉皆でない ②2025年6月〜2026年1月のデータ凍結期間。
- prefill: 著名法人番号1件（例: トヨタ自動車 1180301018771）で30秒成功。fixtures: 補助金あり／なし法人・横断1ページの実応答。
- FR-C8: 1件失敗は`_error`行で継続。

## Actor #4: Japan Company Data Enrichment（2番目・公開はID待ち）

**Step 0**（`docs/research/houjin-name-search.md` 新規）:
- (a) **柱2未決#3の解消**: `/4/name`の曖昧一致（mode・target）の実挙動を検証環境または実データで確定し、confidence設計に反映。
- (b) gBizINFOの**特許エンドポイント有無**を仕様書で確認。あれば既存クライアントと同型で`patent`を追加（patent_count）、なければ`patent_count`は出力から外しREADME注記＋FR-4軽微逸脱をdecisionsへ。
- (c) `HOUJIN_API_BASE` envで本番／検証環境を切替。**ID未着でも検証環境仕様＋柱3から還元済みのhoujin fixtureで実装を先行**する。

**実装**:
- 入力: FR-4どおり（`corporate_numbers[]` or `company_names[]`・`fields[]`・`enrich`）。
- basic（$0.006）: FR-4項目。**name_enはgBizINFO登録英名（method:"api_native"）or null**（R2-10。basic経路にLLMを入れない）。has_subsidy/has_procurement＝実績件数>0。
- enriched（$0.019仮置き）: LLMで①事業概要EN一行（gBizINFOの事業概要・業種テキストから。**数値禁止プロンプト＋数字列照合フラグ**＝#1と同型）②name_enのローマ字翻字（**逐語照合は原理的に不可のため照合スキップ**とし、`method:"llm"`＋モデル自己評価confidenceで担保＝N-9の生成項目規律）。`enrich=true`×`ANTHROPIC_API_KEY`未設定は実行失敗（#1同型）。
- `scripts/live-enrich.ts`同型（10社実測→平均原価と85%推奨単価をログ。**単価確定は人間タスク**として完了報告へ）。
- 公開ゲート運用: push・PPEドラフトまで実施可。完了報告の人間タスクに「国税庁ID到着→`HOUJIN_APP_ID`投入→検証環境で照合確認→本番切替→公開」を明記。

## Actor #5: Japan Laws & Regulations（最後・最重量）

**Step 0**（`docs/research/laws-api-v2.md` 新規）:
- (a) v2実仕様の確定: Swagger/Redoc＋実応答で、法令検索（名称／法令番号／法令ID）・`asof`（時点指定）・`response_format=json`・条/項/号のJSON構造を確認。
- (b) **未決#5の解消判断**: JSONスキーマの安定性を実応答で確認し、**XMLフォールバックは実装しない**（schema-bufferのドリフト検知で監視）。判断をdecisionsに記録。
- (c) normalize-jpに**漢数字→算用数字の基本変換**（一〜九十九・百・千・万の合成）を追加＋テスト（照合の前処理として必須）。

**実装**:
- dirを`laws-regulations`へ改名（actor name＝`japan-laws-regulations`）。
- クライアント（gov-clients/laws・認証不要）: **全法令ループ取得の禁止を3層で強制**——①クライアントに一覧巡回機能を実装しない ②Actor入力は`law_query`必須 ③READMEでコーパス需要を公式XML一括ダウンロードへ誘導。
- 入力: `law_query`（必須）・`articles[]`（条指定・任意）・`as_of_date`（任意）・`translate`（bool）。
- basic（$0.004/条）: law_id・law_num・title_ja・公布/施行日・条/項/号（ツリー＋フラット両対応）・text_ja＋共通メタ。**title_enはv1ではnull**（api_nativeの英名が存在しないため。FR-5軽微逸脱→decisions記録）。
- translated（$0.029仮置き）: 条単位の英訳＋1文要約。**数値禁止プロンプトは適用不可**（条文の数値は本質）→英訳中の数字列を「漢数字正規化済み原文」との存在照合、不一致は**フラグのみ**（N-9の要約文扱い・null化しない）。`translate=true`時にlaw単位で`title_en`を1回生成し全条アイテムへ複写（条課金に内包）。**JLT参考訳disclaimer（attribution既存定数）を全translatedアイテムとREADMEに**付し、JLTの正直位置づけをREADME第1段落付近に置く。
- prefill: 著名法令（例: 個人情報の保護に関する法律）×最初の5条で30秒成功。
- `scripts/live-translate.ts`（10条実測→平均原価と85%推奨単価をログ。**単価確定は人間タスク**）。

## 完了条件（全体）

Step 0-A/B→#2→#4→#5の順。各Actorごとに: typecheck／lint／format:check／test／全Actorのbundle生成が緑、golden差分は自動採用せず要約を報告、research＋decisions記録、完了報告に「残り（人間タスク）」節。最終: #1/#3含む全テスト緑・CI緑・push。

## やらないこと（絶対規則の再掲＋本フェーズ固有）

全法令のループ取得／#2へのenriched追加／BYOキー入力欄／enrichedへの無料枠適用／basic経路へのLLM混入／launch文書の再作成／Store公開操作（人間の作業）／単価・イベント名の独断変更／goldenの自動上書き。
