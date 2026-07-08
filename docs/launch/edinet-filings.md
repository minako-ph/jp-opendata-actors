# Actor#1 edinet-filings ローンチチェックリスト消化状況（marketing.md §11）

最終更新: 2026-07-07。リポジトリ内で準備できるものは消化済み。「要実施」は公開直前に事業主のコンソール作業・実機確認が必要な項目。

| # | 項目 | 状態 | 内容 |
|---|---|---|---|
| 1 | 競合スキャン | **済** | 完全競合2件あり（docs/research/store-scan-edinet.md）。差別化文言（柱②: 構造化財務値＋逐語検証）をREADME第1段落に反映済み。価格競争には応じない |
| 2 | 名前・スラッグ・説明文 | **準備済／一部要実施** | actor.jsonに name=`japan-edinet-filings`・title・通常説明文(143字)を設定済み。**SEO名/SEO説明文はコンソール専用項目**→公開時に下記の確定文言を設定 |
| 3 | README | **準備済** | §5.3テンプレ7節・490語・出力サンプルJSON・正直明記節・"Tested against frozen datasets"（actors/edinet-filings/README.md） |
| 4 | input prefill実機確認 | **済（ローカルE2E）** | 2026-07-08実機確認: 実APIに対しprefill相当入力で**最初の結果まで1.46秒**（目標30秒）。`scripts/live-e2e.ts`で再現可。Apify上での最終確認とprefill日付の更新はpush後に実施 |
| 5 | カテゴリ・タグ・PPE設定 | **要実施（コンソール）** | 推奨カテゴリ: Finance／Business。PPE（追補v1.1準拠）: 合成イベント**apify-actor-start**に$0.02（独自actor-startは定義しない・R2-5）、record-basic $0.005、record-enrichedは**実測原価でマージン85%以上を満たす額に確定**（目安$0.05〜0.10・R2-2）。実測初期値（2026-07-08・claude-haiku-4-5同期・edinet-summary-v1数値禁止プロンプト・有報10件）: **平均$0.0048/doc → 85%マージン推奨単価$0.0320**（$0.05設定なら約90%マージン）。最終確定は事業主が `scripts/live-enrich.ts` とrunサマリの `enrich_cost_usd_avg` で実施（上記ゲート3の残作業①〜④）。**primary eventはrecord-basicに指定**。無料枠は実行単位でコード実装済み（最初の3書類・R2-3）につきコンソール設定不要。**permissionsはlimitedにする**（R2-7）。**組み込み`apify-default-dataset-item`イベントは削除する**（dataset書き込み毎に課金され`record-basic`と二重課金になるため・F-7）。価格はドラフト保存でテスト→公開（重要変更は14日周知＋月1回まで・イベント削除不可につきカタログは公開前確定・R2-8） |
| 6 | ファミリー相互リンク | **済（現時点分）** | READMEに`## More Japan data Actors`節あり。#1が初公開のため追記先なし。#2以降の公開時に#1のREADMEへリンク追記。プロフィールbio: "Official-API-based Japan data actors. TypeScript, golden-tested." |
| 7 | 記事リンク | **対象外** | 記事AはPhase 2完了時（#1〜#3公開後）。#1単独では該当なし |
| 8 | 公開後1週間の毎日確認 | **公開後** | 実行ログとIssuesを1日1回・1週間。以降はN-4通常監視へ |

## 公開時にコンソールへ設定する確定文言

- **SEO名**: EDINET API — Japan Company Filings Data in English
- **SEO説明文**: EDINET API in English. Structured annual & semi-annual filings of Japanese listed companies: revenue, income, employees. Official FSA data, JSON output.
- **タグ候補**: japan, edinet, financial-data, filings, official-api（公開時の現行タグ体系で確定）

## 公開ゲート（チェックリスト外の残作業）

1. ~~Actor main実装~~ **済**（2026-07-07: 日ループ・FR-C7/C8・billing・N-4集計・財務値CSV(type=5)パース）
2. ~~実応答fixture採取→golden差し替え＋財務値要素IDマップ検証~~ **済**（2026-07-08: 実データで抽出仕様を確定、fixture/golden実データ化。goldenのdiffレビューは事業主）
3. ~~enrich（LLM英文サマリ）の扱いを決める~~ **(a)で解消済み（2026-07-08・Phase 1b）**: 同期Messages API＋tool use（emit_summary）＋prompt caching、数値禁止の定性サマリ＋数字列照合（フラグのみ）、LLM失敗はbasicフォールバック。**残作業**: ①事業主が `scripts/live-enrich.ts` で平均原価を実測 → ②record-enriched単価を確定（85%マージン＝avg/0.15） → ③READMEのPricing実額反映（`$0.0XX`プレースホルダを差し替え）→再push → ④コンソールのPPEに同額設定
4. デプロイ手順: `pnpm --filter @jp-opendata/actor-edinet-filings build` → `apify push`（.actor/Dockerfileがdist/main.jsを使用。手動。CIはbundle生成の成功までを担保・R2-4）
5. **Apify Consoleのbilling & payment details（payout先）を完了する**（収益化ウィザードの前提・人間作業・R2-9）
