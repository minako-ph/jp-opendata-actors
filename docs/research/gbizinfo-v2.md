# gBizINFO REST API v2 仕様調査（2026-07-07・未決#1）

一次情報: 公式OpenAPI定義 `https://api.info.gbiz.go.jp/hojin/v3/api-docs/v2`（Swagger UI: `https://api.info.gbiz.go.jp/hojin/swagger-ui/index.html?urls.primaryName=v2`）、公式ヘルプセンター各記事。

## エンドポイント【事実】

- ベースURL: `https://api.info.gbiz.go.jp/hojin`（v2は `/v2/hojin~~` の1系統。**URL末尾スラッシュは500エラー**）
- 法人検索: `GET /v2/hojin`（`page`上限10・`limit`上限5000/頁）
- 法人基本情報: `GET /v2/hojin/{corporate_number}`
- 補助金: `GET /v2/hojin/{corporate_number}/subsidy`（法人番号指定。期間・府省指定は不可）
- 補助金（期間取得）: `GET /v2/hojin/updateInfo/subsidy`（`from`/`to`=yyyyMMdd必須、`page`。法人番号・府省絞り込み不可）
- 他に certification / commendation / finance / patent / procurement / workplace の同型、および `/v2/hojin/{corporate_number}/corporation`（事業所情報・v2新設）
- 補助金条件での法人絞り込みは法人検索側: `subsidy`（名称部分一致）、`subsidy_amount_from/to`、`ministry`（府省内部コード・カンマ区切り: https://help.info.gbiz.go.jp/hc/ja/articles/4640606537886 ）、`source`（4=補助金）

## 認証【事実】

v1と同じ **ヘッダ `X-hojinInfo-api-token`**（全エンドポイントrequired）。トークンは利用申請フォームで取得、申告目的の範囲内で利用。

## レスポンス【事実】

- 共通ラッパー `{ id, message, errors, "hojin-infos": [...] }`。期間取得系は `pageNumber`/`totalCount`/`totalPage`（string型）付き。
- 補助金レコード `SubsidyInfoV2`: `title` / `amount` / `date_of_approval` / `government_departments` / `target` / `meta-data`（`metadata_flg=true`時: key_field, data_quality, source, import_frequency, last_acquisition_date, last_update_date）。出力順は認定日降順。
- **v1との差**: `joint_signatures`・`note`・`subsidy_resource` は削除。**値が無い項目も `"Null"` という文字列で出力される**（v1は項目ごと省略）→パースで要注意。子APIから法人基本属性約20項目が削除（残るのは法人番号・法人名・所在地＋対象情報）。
- ⚠️ 引継書§4.2の「補助金のjGrants由来識別は備考で可能」は**v2ではnote削除により不成立の可能性**。`meta-data.source` で代替できるか実データで要確認（FR-2 `data_origin` 設計に影響）。

## 制約【事実】

- レート数値は未公表。「一定の上限を設けることがある」「過度なアクセスはトークン停止」→2req/秒仮置き継続。
- `/v2/hojin/updateInfo`（基本情報）は**2025-12-06より前の期間指定不可**。`updateInfo/subsidy` が同制限かは未確認。過去分はデータダウンロード機能へ誘導。
- エラー: 400/401/404（データなし）/500（末尾スラッシュ等）。

## v1終了時期【重要・未確認】

「v1は2026年9月終了」は一次情報で確認できず。公式FAQ（2026-01-26更新）は「**v1は引き続き利用可能・サービス終了は時期未定**」。→v2実装の方針は維持するが、READMEやコード内で終了時期を断定しない。

主要URL:

- 変更点PDF: https://help.info.gbiz.go.jp/hc/ja/articles/5022310105886
- 利用規約: https://help.info.gbiz.go.jp/hc/ja/articles/4999421139102
- v1継続利用FAQ: https://help.info.gbiz.go.jp/hc/ja/articles/5022271048606
- 期間制限告知: https://help.info.gbiz.go.jp/hc/ja/articles/5414495539870
