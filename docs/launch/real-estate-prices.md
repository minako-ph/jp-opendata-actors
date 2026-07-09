# Actor#3 real-estate-prices ローンチチェックリスト（marketing.md §11）

最終更新: 2026-07-09。リポジトリ内で準備できるものは消化済み。「要実施」は公開直前の事業主のコンソール作業・確認。

| # | 項目 | 状態 | 内容 |
|---|---|---|---|
| 1 | 競合スキャン | **済（実装前）／公開直前に最終再スキャン要** | reinfolib直系はBYOキー設計1件のみ・旧API系1件（docs/research/store-scan-real-estate.md）。差別化＝ゼロ設定・両価格区分・集計同梱・二言語をREADME第1段落に反映済み。**受入基準6の最終スキャンは公開直前に人間が実施** |
| 2 | 名前・スラッグ・説明文 | **準備済／一部要実施** | actor.json: name=`japan-real-estate-prices`・title・通常説明文(139字)設定済み。コンソールで **SEO名: Japan Real Estate Price Data API (Official MLIT)** / **SEO説明文**: Japan real estate transaction prices API in English. Official MLIT data: quarterly actual & contract prices, all 47 prefectures, JSON output. No scraping. |
| 3 | README | **準備済** | §5.3テンプレ7節・実データ出力サンプル・正直明記節（悉皆でない/取引vs成約の性質差/丸め・区分値null/0件=404仕様/station v1コードのみ/REINSではない/上流停止リスク） |
| 4 | prefill実機確認 | **済（ローカルE2E 2026-07-09）** | prefill（Tokyo/Chiyoda/2024）で実API E2E確認済み（結果はdecisions.md）。Apify上の最終確認はpush後に実施 |
| 5 | カテゴリ・タグ・PPE設定 | **要実施（コンソール）** | 推奨カテゴリ: Real estate（無ければBusiness）。タグ候補: japan, real-estate, property-prices, mlit, official-api。**PPE: 合成apify-actor-start=$0.02／record-basic=$0.003・Primary指定／組み込みapify-default-dataset-item削除（二重課金防止）**。無料枠は実行単位・先頭50件でコード実装済み（**50件は仮置き・事業主が確定**。変更時はREADME/入力スキーマ/main.tsのFREE_RECORDS_PER_RUNを同時更新）。permissionsはlimited。価格はドラフト保存でテスト→公開 |
| 6 | ファミリー相互リンク | **一部済／要実施** | 本READMEに#1への言及あり。**#1（edinet-filings）README末尾のMore Japan data Actors節に本Actorへのリンクを追記して再push**（人間タスク）。プロフィールページ更新 |
| 7 | 記事リンク | **対象外（Phase 2完了時に記事A）** | #1〜#3公開後にdev.to記事Aを執筆し相互リンク |
| 8 | 公開後1週間の毎日確認 | **公開後** | 実行ログとIssuesを1日1回・1週間 → 以降N-4通常監視 |

## シークレット（Apify Secrets）

- `REINFOLIB_API_KEY`（必須。オペレータのキー。**規約第9条によりキーの共有・配布は不可**＝Secretsのみで保持）
- `ALERT_WEBHOOK_URL`（任意。未設定ならログのみ）

## デプロイ手順

1. `pnpm --filter @jp-opendata/actor-real-estate-prices build` → `apify push`（手動。CIはbundle生成まで）
2. コンソール: 上記#5のPPE・permissions・SEO設定 → プレビューで入力prefill実行（30秒以内に結果）→ 公開
3. 公開日: ____年__月__日（記入欄）

## 公開前の残り人間タスク（まとめ）

- [ ] 受入基準6: Store競合の最終スキャン（キーワード: marketing.md §5.4 #3）
- [ ] 無料枠50件の確定（変更するなら3箇所同時更新）
- [ ] コンソールPPE設定（$0.02 / $0.003 / dataset-item削除 / primary=record-basic）
- [ ] #1 READMEへ相互リンク追記→#1再push
- [ ] Apify上でprefill最終確認・公開日記入
