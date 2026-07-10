# gBizINFO 補助金データ実仕様調査（2026-07-10・Actor#2 Step 0）

一次情報: 実API応答（2026-07-10採取・トークン認証）＋公式OpenAPI定義（`https://api.info.gbiz.go.jp/hojin/v3/api-docs/v2`）＋担当府省コード一覧（`setcodelist.pdf` Ver.1.01 2024-4-19・原本404のためWayback Machine採取）。

## (a) data_origin問題の解消【実データで確定】

**jGrants由来の識別はv2データでは不可 → `data_origin`フィールドは廃止**（FR-2からの逸脱としてdecisionsに記録）。

- v1の識別手段だった`note`（備考）はv2で削除済み（decisions既記録・実応答でも不存在を確認）。
- 代替候補だった`meta-data`（`metadata_flg=true`時）を実応答で検証:
  - `meta-data`は**配列でなくオブジェクト**（`{key_field, data_quality, source, import_frequency, last_acquisition_date, last_update_date}`）。
  - `source`の実値域を417レコード（updateInfo 5ページ＋日立製作所＋株式会社EMCE）でサンプリング: **「中小企業庁」「経済産業省」「厚生労働省」「国税庁」のみ**＝データ提供元府省名。`data_quality`は全件「政府連携データ」。**「jGrants」を示す値は出現しない**。
  - 日立の例: `government_departments=資源エネルギー庁`のレコードで`meta-data.source=経済産業省`（親府省）→ sourceは提供経路であってjGrants識別子ではない。
- 対応: READMEに「Whether a record originally came through the jGrants application system is not distinguishable in the v2 data」を正直明記。

## (b) 横断検索の実仕様【実データで確定】

横断は**法人検索API `GET /v2/hojin`**で行う（updateInfo/subsidyは期間の意味が「データ更新日」であり利用者の意図（採択日）と乖離、かつ2026-02〜04は404・2026-06のみ200という提供状況のため不採用）。

- パラメータ（横断関連）: `subsidy`（補助金名称部分一致）／`subsidy_amount_from/to`／`ministry`（**内部コード**・カンマ区切り可）／`source=4`（補助金）／`page`（**1〜10、11以上は400** `"1以上、10以内で入力してください。"`）／`limit`（0〜5000）。
- 返却形: `{id, errors, message, "hojin-infos": [...]}`。**totalCount/totalPage/pageNumberは無い**（updateInfo系のみ）。hojin-infoは法人プロフィール（`corporate_number/name/name_en/postal_code/location/status/number_of_activity/update_date`）のみで**補助金レコード自体は含まれない**→ 補助金レコードは法人ごとに`/v2/hojin/{num}/subsidy`を追加取得する2段構成が必要。
- 0件は**404**（`{"id":null,"message":"404 - Not Found.","errors":[]}`）。エラーでなく0件として扱う。
- `ministry=26`（資源エネルギー庁）×`source=4`で200を実確認。担当府省コードは1〜49（国税庁=1・経産省=17・中小企業庁=27等。全表は実装の辞書参照）。
- **日付範囲はAPI側で指定不可** → `date_from/to`は取得後に`date_of_approval`でクライアント側フィルタ。

## 補助金レコードの実応答（スキーマ修正が必要な差分）

- **`amount`は文字列**で返る（`"7784000"`・metadata_flgの有無に関わらず）。OpenAPI/spec-based fixtureのnumberと不一致 → スキーマはnumber|string両受け・出力で数値化。（参考: procurementの`amount`はnumberのまま。エンドポイント間で型が揺れる）
- `target`は**真のnull**で返ることがある（文字列`"Null"`でなく）→ stripNullStringsを真のnullにも対応させる。
- `meta-data`はオブジェクト（上記(a)）。
- `date_of_approval`は`YYYY-MM-DD`形式（procurementの`date_of_order`はISO datetime）。
- 補助金0件の法人（例: トヨタ自動車 1180301018771）は200＋`subsidy: []`。**gBizINFO未収載の法人番号は404**。

## prefill用法人の変更

指示書例のトヨタ自動車（1180301018771）は**補助金0件**を実確認 → prefillは**株式会社日立製作所 7010001008844**（補助金5件・資源エネルギー庁×2＋厚生労働省×3・name_en="Hitachi, Ltd."あり）に変更。

## 受給者英名（name_en）

法人検索`/v2/hojin?corporate_number={num}`の応答に`name_en`が含まれる（子API・基本情報APIには無い）→ 受給者名ENはこの1リクエストで取得（api_native）。無ければnull（LLM禁止・R2-10と同思想）。
