# 法人番号Web-API名称検索・gBizINFO特許/基本情報 実仕様調査（2026-07-10・Actor#4 Step 0）

一次情報: 実gBizINFO API応答（2026-07-10採取）＋法人番号Web-API Ver.4公式仕様（docs/research/houjin-webapi-v4.md）＋公式公開サンプル（fixtures/houjin/）。

## (a) 柱2未決#3（/4/nameの曖昧一致挙動）の解消状況

**アプリケーションID未着のため実データ・検証環境での実挙動確定は不可**（検証環境は本番と同一IDが必須・URL非公開。decisions 2026-07-07）。v1のconfidence設計は仕様書ベースで確定し、実データ精度確認は**ID到着後の人間タスク**へ:

- 検索は`mode=1`（前方一致）×`target=1`（あいまい）＝API既定。あいまい補正（ひらがな→カタカナ・英小文字→大文字・中点/全角スペース削除）はAPI側仕様。
- 比較側も同等の正規化（`normalizeCompanyNameForMatch`: 全半角・大文字化・中点/スペース除去・半角カタカナ→全角・ひらがな→カタカナ）を行い、確度4値で判定する——**#2で実装済みの共有モジュール `resolveCompanyName`（gov-clients/houjin/resolve.ts）をそのまま使う**: exact（正規化完全一致1社）/ selected（完全一致なし・候補1社）/ ambiguous（完全一致複数 or 候補多数→採用しない）/ not_found。閉鎖済み（closeDateあり）・非表示（hihyoji=1）は候補から除外。
- ID到着後の調整候補: `address`（都道府県絞り込み）併用、`target=3`（英語表記検索）の活用。

## (b) gBizINFO特許エンドポイント【実データで確定＝あり】

- `GET /v2/hojin/{corporate_number}/patent` は**存在し実動する**（OpenAPI定義＋実応答で確認）。
- 実応答（日立製作所）: **19,950レコード・約12MB**。レコードは`{patent_type, registration_number, application_date, classifications[], title, url, meta-data}`。
- `patent_count`は全件応答の件数集計でしか得られない（count専用パラメータなし）→ クライアントはレコード内容を保持せず**件数のみ**返す軽量スキーマ（`patent: z.array(z.unknown())`）で実装。大企業では応答が重い旨をREADMEに注記し、`fields`入力でスキップ可能にする。

## (c) HOUJIN_API_BASE環境変数

- `HoujinClient`は`baseUrl`をコンストラクタで受ける（実装済み）→ main.tsで`HOUJIN_API_BASE`（未設定時は本番URL）を渡す。
- 検証環境のURLはID到着後に問合せフォームで取得（人間タスク）。取得後は`HOUJIN_API_BASE`に設定するだけで切替可能。

## 追加発見: gBizINFO法人基本情報の実応答はOpenAPI定義より項目が多い

実応答（日立）に**`name_en`（"Hitachi, Ltd."）**・`industry`（JSIC大分類コード配列 例:["E"]）・`founding_year`・`aggregated_year`・`kind`・`process`が存在（OpenAPI定義・spec-based fixtureに無い）→ スキーマへ追加（ドリフト誤検知の防止）。**#4のname_en（api_native）は基本情報1リクエストで取得できる**（法人検索の追加呼び出し不要）。`business_items`の実値は営業品目**コード**（例:"104"）であり名称ではない（spec-based fixtureの想定と異なる）→ 出力はコードのまま`business_item_codes`とし、README注記。

## enriched（LLM）実測の前提

gBizINFOの`business_summary`は短文（日立で76字）。enrichedの入力は`business_summary`＋`industry`＋名称（name/kana）で構成し、①事業概要EN一行（数値禁止プロンプト＋数字列照合フラグ＝#1と同型）②name_enのローマ字翻字（api_native無し時のみ・逐語照合は原理的に不可のため照合スキップ＋モデル自己評価confidence＝N-9の生成項目規律）を1回のtool useで生成する。
