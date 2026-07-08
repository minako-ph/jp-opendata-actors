# 柱2 追補 v1.1（正誤表・確定事項）— jp-opendata-actors

作成日: 2026-07-07 ／ 保存先: `docs/addendum-v1.1.md` ／ **本追補は要件定義書v2.0・引継書v1.0・マーケ戦略書v1.0の該当節を上書きする**（矛盾時は本追補が最新・優先）。
背景: 実装前の最終レビューで発見した誤り・欠落の修正。R2-1〜R2-4は実装不能・設計矛盾に直結する重大修正。

---

## R2-1【重大】LLM呼び出し方式: Batch API → 同期Messages API

- 対象: 引継書§6「Anthropic Batch API既定」
- 修正: enrichmentは**同期Messages API**（temperature 0・tool useでJSONスキーマ固定・**prompt cachingでシステムプロンプトをキャッシュ**）に変更。Batch APIは使わない。
- 理由: Batchは非同期処理（完了まで最長24時間）であり、オンデマンド実行のActorおよびマーケ戦略書§6「既定入力で30秒以内」目標と根本的に非両立。入札プロジェクトのパイプライン移植時の設計ミス。
- 影響: 環境変数`ENRICH_PRICE_IN/OUT`には同期単価を設定する。

## R2-2【重大】enriched単価の確定ルール（R2-1の帰結）

- 対象: 要件書§7の単価表「#1 $0.049（実測後$0.049〜0.059で確定）」ほか
- 修正: enriched系単価（#1・#4・#5のLLMを伴うイベント）は**「実測原価でマージン85%以上」の制約を優先して確定**する。$0.049〜0.059というレンジ上限は撤廃（同期単価では原価が約2倍になり、このレンジでは85%を満たさない可能性が高い。目安$0.05〜0.10）。85%を満たせない場合は値上げの前に入力トークン削減（要約対象セクションの絞り込み・prompt caching）を1回試す。
- basic系・actor-start・#3の単価は変更なし。

## R2-3【重大】無料枠の実装主体: プラットフォーム設定 → コード実装＋実行単位へ変更

- 対象: 要件書FR-C6「月間の無料利用枠」／引継書§7「無料枠はApifyのPPE設定側で構成し、コードでは制御しない」
- 修正:
  1. 引継書§7の記述は**誤りにつき撤回**。Apify PPEにプラットフォーム管理の「ユーザー別・月間無料枠」機構は存在しない。公式ガイドラインは「無料制限はActor側で実装し、READMEと入力スキーマに事前明記、超過時はクラッシュでなく状態メッセージ付きでgracefulに終了せよ」と定める。
  2. FR-C6を**実行単位の無料枠**に変更: 各実行の最初のN件は`Actor.charge`を呼ばない（billingラッパの`freeAllowance`オプションで実装）。仮置き値: #1=3書類／#2=50件／#3=100件／#4=20社／#5=20条（各Actor公開前に確定し、READMEのPricing節・入力スキーマ説明に明記）。
  3. マーケ戦略書§9の「月間無料枠」記述も「実行単位」に読み替える。位置づけ（試せるが業務には足りない水準）は不変。

## R2-4【重大】ビルド・デプロイ方式の確定（monorepo × apify push問題）

- 対象: 引継書§3.2・§11（未定義だった）
- 修正: `apify push`はActorディレクトリのみをアップロードするため、pnpm workspaceのpackages依存はそのままでは解決されない。**各Actorはesbuildで単一bundle（`dist/main.js`）＋最小package.jsonに事前ビルドしてからpush**する（workspace依存はビルド時に解決・同梱）。Dockerfileはbundle前提の薄い構成。CIの責務はbundle生成の成功まで、pushは人間が手動実行（自動デプロイは組まない方針どおり）。
- Phase 0のDoDに「edinet-filingsのbundle生成がCIで成功」を追加。

## R2-5【中】PPEイベント名: `actor-start` → 合成イベント `apify-actor-start`

- 対象: 要件書§7・引継書§7のイベント名
- 修正: Apifyは新規ActorにStartイベント **`apify-actor-start`** を自動追加する（≤1GB RAMで1回課金、+1GBごとに追加課金、無料の5秒コンピュート付き）。独自の`actor-start`を重複定義せず、この合成イベントに$0.02を設定する。あわせてコンソールの**primary event（詳細ページで強調される主イベント）を`record-basic`に指定**する。

## R2-6【中】課金上限の尊重とローカル検証

- 対象: 引継書§7（billingラッパ仕様の欠落）
- 追加: billingラッパはSDKの`ChargeResult`を確認し、`eventChargeLimitReached`（ユーザーが設定した最大課金額への到達）を検知したら**部分結果＋状態メッセージでgracefulに終了**する（FR-C8と同思想。上限到達をエラー扱いしない）。ローカル検証は環境変数`ACTOR_TEST_PAY_PER_EVENT=1`（課金ログは`storage/datasets/charging-log/`）で行う——testing節（引継書§8）に追加。

## R2-7【中】agentic適格の追加条件: limited permissions

- 対象: 要件書N-8・引継書§13
- 追加: `allowsAgenticUsers=true`の実在は確認済み（正しい）。ただし適格条件として **(a) PPEモデルであること (b) Actorが「limited permissions」で実行されること** が必要。全Actorのpermission設定をlimitedにする（full permissionsを要求する実装を書かない）。本ファミリーはfile system外・環境変数のみで動くためlimitedで十分。

## R2-8【中】価格変更の運用制約

- 対象: 要件書§7・引継書§7への注記追加
- 追加: 重要な価格変更は**14日の事前周知＋月1回まで**。イベントの後付け追加は可能だが**削除は実行中の課金を壊すため不可**（$0化→後日削除の手順）。したがって**イベントカタログ（4種）は各Actor公開前に確定**させる。価格設定はドラフト保存でテストしてから公開する（周知期間はドラフトでは起動しない）。

## R2-9【小】W0タスク追加: 収益化の前提設定

- 引継書§12（実装初日）に追加: Apify Consoleで**billing & payment details（payout先）を完了**する（収益化ウィザードの前提。人間作業）。

## R2-10【小】FR-4のname_en仕様の厳密化

- 対象: 要件書FR-4
- 修正: **basic出力のname_enはgBizINFO登録英名がある場合のみ**（`method="api_native"`）、無ければnull。LLM翻字（`method="llm"`＋confidence）は**enriched限定**に移す（basic経路にLLM原価を混入させない）。

## R2-11【小】EDINET type=5の形式注記

- 引継書§4.1に追加: `type=5`のレスポンスは**ZIPアーカイブ（内部にCSV群）**。展開→対象CSV選択→パースの前処理を前提にfixtureを作る。

## R2-12【小】jp-corp-core実装時期の明確化（柱3との整合）

- 対象: 引継書§11 Phase 3の記述
- 修正: `gov-clients/houjin`・`gov-clients/gbizinfo`は**柱3のP1（M2）で必要になった時点で、正典であるこのリポジトリに先行実装し、柱3へsubtree取込みする**。柱2側のActor #4公開（Phase 3）を待たない。実装順が入れ替わるだけで、Actor #4の公開ゲート（国税庁ID）は不変。

---

## 変更なしを確認した事項（レビュー済み・修正不要）

`allowsAgenticUsers`フラグの実在／PPE 80%配分・rental廃止スケジュール／Store SEO仕様（名前最重量・2種description・README構造）／出典指定文言／各データ源のエンドポイント・認証・罠（法人番号XML/CSV・Shift_JIS、不動産404＝0件、法令の全件ループ禁止、gBizINFO v2移行）／KPI・統廃合閾値／N-1〜N-9の枠組み。

## AGENTS.mdへの追記（1行）

`docs/addendum-v1.1.md は既存3文書の該当節を上書きする正誤表。作業前に必ず読むこと。`
