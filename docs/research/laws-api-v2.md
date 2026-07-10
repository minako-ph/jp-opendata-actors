# 法令API v2 実仕様調査（2026-07-10・Actor#5 Step 0）

一次情報: 実API応答（2026-07-10採取・認証不要）。ベースURL `https://laws.e-gov.go.jp/api/2`。

## (a) v2実仕様【実応答で確定】

- **法令検索** `GET /laws?law_title={部分一致}&law_num={完全一致}&response_format=json`
  → `{total_count, count, laws: [{law_info, revision_info, current_revision_info}]}`。
  「個人情報の保護」で18件・`law_num=平成十五年法律第五十七号`で1件を実確認。
- **法令本文** `GET /law_data/{law_id | law_num}?asof=YYYY-MM-DD&response_format=json`
  → `{law_info, revision_info, law_full_text, attached_files_info}`。law_id（`415AC0000000057`）・
  law_num（URLエンコードした漢数字表記）の両方で同一応答を実確認（個人情報保護法・約546KB）。
- **時点指定** `asof=2020-01-01` で当時の版（`415AC0000000057_20170530_...`・施行2017-05-30）が返ることを実確認。
- **0件/不存在は404**＋`{"code":"404004","message":"指定のパラメータで取得できる法令本文ファイルは存在しません。"}`（JSONボディ付き）。エラーでなく不存在として扱う。
- `law_info.promulgation_date`（公布日）・`revision_info.amendment_enforcement_date`（当該版の施行日）・`law_revision_id`（版ID）が版の来歴を示す。

## 条/項/号のJSON構造【実応答で確定】

`law_full_text`は法令標準XMLの直訳ツリー `{tag, attr, children}`（childrenは要素またはテキスト文字列の配列）:

```
Law > LawBody > MainProvision > (Part/Chapter/Section)* > Article
Article(attr.Num="1") > ArticleCaption("（目的）") / ArticleTitle("第一条") / Paragraph*
Paragraph(attr.Num) > ParagraphNum / ParagraphSentence > Sentence*(テキスト) / Item*
Item(attr.Num) > ItemTitle / ItemSentence > Sentence*
```

- `Article.attr.Num`は算用数字文字列（枝番は`"2_2"`形式＝「第二条の二」）。
- 表・ルビ等の特殊要素（TableStruct/Ruby等）はテキスト連結時に再帰的に文字列のみ抽出する方針。

## (b) 未決#5の解消判断: XMLフォールバックは実装しない

- `response_format=json`の応答は上記の決定的な木構造で安定（同一法令の再取得で同一構造・
  asof版でも同構造を確認）。JSONはXMLの機械的直訳であり、独自スキーマの変動リスクは
  XML本体と同等＝フォールバックを持つ意味がない。
- 監視はschema-bufferのドリフト検知（law_info/revision_infoの既知フィールド）＋
  条抽出0件の実行時警告で行う。**XMLフォールバックは実装しない**（decisions記録）。

## 全法令ループ取得の禁止（提供元禁止事項）を3層で強制

1. クライアント（gov-clients/laws）に一覧巡回・ページングAPIを実装しない（検索は法令名/法令番号の条件付きのみ）。
2. Actor入力は`law_query`必須（無条件実行が構造的に不可能）。
3. READMEでコーパス需要を公式XML一括ダウンロード（https://laws.e-gov.go.jp/bulkdownload/）へ誘導。

## (c) normalize-jpへの漢数字→算用数字変換

照合の前処理として`kanjiToNumber`（一〜九十九・百・千・万の合成）と
`convertKanjiNumerals`（文中の漢数字列を算用数字へ置換）を追加＋テスト。
translated照合は「英訳中の数字列が漢数字正規化済み原文に存在するか」の存在照合・不一致はフラグのみ（N-9の要約文扱い）。

## その他

- レート: 明示上限なし→1req/秒直列（引継書§4.5どおり）。
- title_enに相当するapi_nativeフィールドは存在しない→**basicのtitle_enはv1でnull**
  （FR-5軽微逸脱・decisions記録）。translate=true時はlaw単位で1回LLM生成し全条へ複写。
