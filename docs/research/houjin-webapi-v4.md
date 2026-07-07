# 国税庁 法人番号Web-API Ver.4 検証環境・仕様調査（2026-07-07）

一次情報: 公式仕様書PDF（第一編4.9版・第二編1.2版・第六編1.2版・リソース定義書4.1版・サンプルデータ説明1.1版）。

## 検証環境

- 検証環境URLは非公開。**アプリケーションIDが必須（仮ID・共通IDなし、本番と同一ID）**。ID取得後に問合せフォームから申請→約1週間で利用案内メール（利用期間3ヶ月以内）。
- **ID到着前に検証環境へ接続する手段はない**。ただし公開サンプルデータZIP（Ver.4のnum/diff/name×CSV(SJIS)/CSV(Unicode)/XMLの実応答ファイル）でfixture整備とクライアント実装を先行できる → `packages/gov-clients/fixtures/houjin/` に採取済み。
- 2026-06-20に検証環境のTLS設定変更あり（古いTLSでは接続不可）。

## リクエスト仕様（3系統・REST/GET・appId13桁）

- `4/num`: `id`, `number`（13桁・カンマ区切り最大10件）, `type`, `history`(0/1)
- `4/diff`: `id`, `type`, `from`/`to`（YYYY-MM-DD、from≥2015-12-01、**最大50日**）, `address`(都道府県2桁 or +市区町村5桁), `kind`(01/02/03/04), `divide`（2,000件超で分割、divideSizeまで増分取得）
- `4/name`: `id`, `type`, `name`（UTF-8 URLエンコード・単一）, `mode`(1=前方一致・既定/2=部分一致), `target`(1=JIS1-2水準あいまい・既定/2=JIS1-4水準完全一致/3=英語表記), `address`, `kind`, `change`(0/1), `close`(0/1・既定1), `from`/`to`（番号指定年月日、from≥2015-10-05）, `divide`

あいまい検索(target=1)の補正: ひらがな→カタカナ、英小文字→大文字、中点・全角スペース削除。target=3: 小文字→大文字、カンマ・半角スペース削除。

## レスポンス

- `type`: 01=CSV/Shift_JIS、02=CSV/Unicode、12=XML/Unicode。JSONなし。
- CSV: 1行目にヘッダー4項目「最終更新年月日,総件数,分割番号,分割数」、2行目以降が法人データ30項目（項目名行なし、`"`囲み・`""`エスケープ）。
- XML: `<corporations>` 直下に lastUpdateDate/count/divideNumber/divideSize、以降 `<corporation>` 繰り返し（sequenceNumber, corporateNumber, process, correct, updateDate, changeDate, name, ..., enName, ..., furigana, **hihyoji**←Ver.4追加）。エラー時はHTTP 400等＋CSV形式のエラーコード。

## 実装メモ

- fast-xml-parser＋iconv-lite（Shift_JIS）の方針は妥当（引継書§3.2どおり）。
- 名称検索の曖昧一致挙動（未決#3）は仕様上は上記のとおり確定。実データでの精度確認は検証環境接続後。

主要URL:

- https://www.houjin-bangou.nta.go.jp/webapi/index.html
- 第一編: https://www.houjin-bangou.nta.go.jp/pc/webapi/images/k-web-api-tetuduki.pdf
- 第二編: https://www.houjin-bangou.nta.go.jp/pc/webapi/images/k-web-api-kinou-gaiyo.pdf
- 第六編(Ver.4): https://www.houjin-bangou.nta.go.jp/documents/k-web-api-kinou-ver4.pdf
- サンプル: https://www.houjin-bangou.nta.go.jp/pc/download/images/k-sample-dl-r0404.zip
