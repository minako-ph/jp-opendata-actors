# 法人番号Web-API名称検索・gBizINFO特許/基本情報 実仕様調査（2026-07-10・Actor#4 Step 0）

一次情報: 実gBizINFO API応答（2026-07-10採取）＋法人番号Web-API Ver.4公式仕様（docs/research/houjin-webapi-v4.md）＋公式公開サンプル（fixtures/houjin/）。

## (a) 柱2未決#3（/4/nameの曖昧一致挙動）——**解消済み（2026-07-10・本番ID実データで確定）**

HOUJIN_APP_ID到着（**英数字13桁**。「13桁の数字」という旧仮定は誤りでクライアントのバリデーションを修正）を受け、本番APIの実挙動で以下を確定:

1. **法人格を除いた名称に対して一致する**。法人格込みのクエリは0件になる（実測: `name=株式会社日立製作所`→0件・`name=日立製作所`→28件中に株式会社日立製作所、`name=一般社団法人日本経済団体連合会`→0件・`name=日本経済団体連合会`→1件）。会社系（株式会社等）だけでなく法人系（一般社団法人等）も同様。
2. **全角文字のみ受付**。半角英数を含むクエリはHTTP 400（エラー101「商号又は名称には全角文字をUTF-8でエンコードして設定してください」）。登記名の英字は全角。
3. `target`は**文字水準（あいまい補正の有無）の違いのみ**で、名称全体の完全一致ではない（`日立製作所`でtarget=1と2が同一28件）。`mode=2`（部分一致）は中間一致を含む（29件目に「全日本金屬労働組合東京支部日立製作所亀戸工場分会」）。
4. あいまい補正のかな相互変換を実証（`トヨタ`→「とよた…」名がヒット）。かな入力は漢字名には一致しない（`ひたちせいさくしょ`→0件）。
5. 2,000件以下は1ページで返る（`トヨタ`631件・divideSize=1）。

**resolveCompanyNameの調整（上記に伴う必要最小の3点）**: ①クエリ送出前に法人格を除去（normalize-jpのCORPORATE_SUFFIXES表・前置/後置1回）②クエリを全角化③完全一致判定は「入力が法人格を含む→登記名全体で一致／含まない→双方の法人格を除去して一致」。確度4値（exact/selected/ambiguous/not_found）の設計自体は実挙動と整合し変更なし。実測: `日立製作所`→exact（7010001008844）／`株式会社日立製作所`→exact／`トヨタ`→ambiguous（631候補。法人格除去後の完全一致だけでも株式会社トヨタ×4・有限会社トヨタ×10等16社）／でたらめな名称→not_found。

- 引き続きの調整候補（v1では未使用）: `address`（都道府県絞り込み）併用、`target=3`（英語表記検索）。

## (b) gBizINFO特許エンドポイント【実データで確定＝あり】

- `GET /v2/hojin/{corporate_number}/patent` は**存在し実動する**（OpenAPI定義＋実応答で確認）。
- 実応答（日立製作所）: **19,950レコード・約12MB**。レコードは`{patent_type, registration_number, application_date, classifications[], title, url, meta-data}`。
- `patent_count`は全件応答の件数集計でしか得られない（count専用パラメータなし）→ クライアントはレコード内容を保持せず**件数のみ**返す軽量スキーマ（`patent: z.array(z.unknown())`）で実装。大企業では応答が重い旨をREADMEに注記し、`fields`入力でスキップ可能にする。

## (c) HOUJIN_API_BASE環境変数

- `HoujinClient`は`baseUrl`をコンストラクタで受ける（実装済み）→ main.tsで`HOUJIN_API_BASE`（未設定時は本番URL）を渡す。
- 検証環境のURLはID到着後に問合せフォームで取得（人間タスク）としていたが、**2026-07-10にID到着・本番APIで直接検証済みのため不要になった**。`HOUJIN_API_BASE`の切替機構は温存。

## 追加発見: gBizINFO法人基本情報の実応答はOpenAPI定義より項目が多い

実応答（日立）に**`name_en`（"Hitachi, Ltd."）**・`industry`（JSIC大分類コード配列 例:["E"]）・`founding_year`・`aggregated_year`・`kind`・`process`が存在（OpenAPI定義・spec-based fixtureに無い）→ スキーマへ追加（ドリフト誤検知の防止）。**#4のname_en（api_native）は基本情報1リクエストで取得できる**（法人検索の追加呼び出し不要）。`business_items`の実値は営業品目**コード**（例:"104"）であり名称ではない（spec-based fixtureの想定と異なる）→ 出力はコードのまま`business_item_codes`とし、README注記。

## enriched（LLM）実測の前提

gBizINFOの`business_summary`は短文（日立で76字）。enrichedの入力は`business_summary`＋`industry`＋名称（name/kana）で構成し、①事業概要EN一行（数値禁止プロンプト＋数字列照合フラグ＝#1と同型）②name_enのローマ字翻字（api_native無し時のみ・逐語照合は原理的に不可のため照合スキップ＋モデル自己評価confidence＝N-9の生成項目規律）を1回のtool useで生成する。
