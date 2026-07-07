# Actor#1 edinet-filings ローンチチェックリスト消化状況（marketing.md §11）

最終更新: 2026-07-07。リポジトリ内で準備できるものは消化済み。「要実施」は公開直前に事業主のコンソール作業・実機確認が必要な項目。

| # | 項目 | 状態 | 内容 |
|---|---|---|---|
| 1 | 競合スキャン | **済** | 完全競合2件あり（docs/research/store-scan-edinet.md）。差別化文言（柱②: 構造化財務値＋逐語検証）をREADME第1段落に反映済み。価格競争には応じない |
| 2 | 名前・スラッグ・説明文 | **準備済／一部要実施** | actor.jsonに name=`japan-edinet-filings`・title・通常説明文(143字)を設定済み。**SEO名/SEO説明文はコンソール専用項目**→公開時に下記の確定文言を設定 |
| 3 | README | **準備済** | §5.3テンプレ7節・490語・出力サンプルJSON・正直明記節・"Tested against frozen datasets"（actors/edinet-filings/README.md） |
| 4 | input prefill実機確認 | **実装済・実機確認待ち** | Actor main実装済み（run.ts/main.ts、テスト51件green）。EDINET_API_KEY設定後に「Startだけで30秒以内に結果」を実機確認し、prefillの日付を公開日直近に更新すること |
| 5 | カテゴリ・タグ・PPE設定 | **要実施（コンソール）** | 推奨カテゴリ: Finance／Business。PPE: actor-start $0.02・record-basic $0.005・record-enriched $0.049（要件書§7）。無料枠20書類/月→**コンソールに無料枠設定が無い場合はコード側graceful制御に切替**（docs/research/apify-ppe.md） |
| 6 | ファミリー相互リンク | **済（現時点分）** | READMEに`## More Japan data Actors`節あり。#1が初公開のため追記先なし。#2以降の公開時に#1のREADMEへリンク追記。プロフィールbio: "Official-API-based Japan data actors. TypeScript, golden-tested." |
| 7 | 記事リンク | **対象外** | 記事AはPhase 2完了時（#1〜#3公開後）。#1単独では該当なし |
| 8 | 公開後1週間の毎日確認 | **公開後** | 実行ログとIssuesを1日1回・1週間。以降はN-4通常監視へ |

## 公開時にコンソールへ設定する確定文言

- **SEO名**: EDINET API — Japan Company Filings Data in English
- **SEO説明文**: EDINET API in English. Structured annual & semi-annual filings of Japanese listed companies: revenue, income, employees. Official FSA data, JSON output.
- **タグ候補**: japan, edinet, financial-data, filings, official-api（公開時の現行タグ体系で確定）

## 公開ゲート（チェックリスト外の残作業）

1. ~~Actor main実装~~ **済**（2026-07-07: 日ループ・FR-C7/C8・billing・N-4集計・財務値CSV(type=5)パース）
2. EDINET_API_KEYで実応答fixture採取→golden差し替え＋財務値の要素IDマップ検証（decisions.md記録済みTODO）
3. **enrich（LLM英文サマリ）の扱いを決める**: 現状はenrich=trueで警告のみ（basic出力）。公開前に (a)enrich実装を完了する か (b)入力スキーマ・README・PPEからenriched記述を一旦外してbasicのみでv1公開する か選択（正直明記の原則上、未実装機能を掲載したまま公開しない）
4. デプロイ手順: `pnpm --filter @jp-opendata/actor-edinet-filings build` → `apify push`（.actor/Dockerfileがdist/main.jsを使用。手動、CIに含めない）
