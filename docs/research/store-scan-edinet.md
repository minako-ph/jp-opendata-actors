# Apify Store 競合スキャン: Actor#1 EDINET（2026-07-07・受入基準6）

調査方法: Store公開API（`api.apify.com/v2/store?search=`）で§5.4の#1キーワード＋補助キーワードを検索、Google `site:apify.com` 併用、主要Actorページを個別確認。

## 結論

**EDINET公式APIベースの完全競合が2つ存在する。** ただし全EDINET系Actorのユーザー数は2〜3・評価ゼロ・月間アクティブほぼ0で、市場はまだ誰も取れていない。「財務諸表の数値そのものを構造化して返す」日本特化Actorは**不在**→差別化は3本柱の②（日英構造化＋検証文化）で行い、README第1段落に反映済み。価格競争には応じない（marketing.md §9）。

## 完全競合

1. **Japan Financial Filings Scraper (EDINET)** — `apify.com/rationalistic_counsel/edinet-japan-financial-reports`
   - 公式EDINET API利用。38書類タイプ、社名/証券コード/EDINETコード検索、PDF/XBRL/CSV/英訳版の**DLリンク＋メタデータ**提供。10年分・11,000社超
   - PPE: 起動$0.00005＋1件$0.00001（事実上の底値）。ユーザー2・月間アクティブ0・評価なし。公開2026年2月末頃と推定
2. **Japan EDINET Insider Filings** — `apify.com/nexgendata/japan-edinet-insider-filings`
   - 大量保有・自己株買い・役員取引**特化**（ユーザー自身のAPIキー必要）。$0.20/filing。x402対応。ユーザー2。2026-07-04に価格改定＝活発にメンテ中

## 近接競合（要点）

- gBizINFO系2件（jungle_synthesizer / getascraper）— 登記系プロフィール、財務・開示書類なし → **Actor#2/#4の公開時スキャンで再確認要**
- NexGenDataが日本公共データを体系的に展開中: TDnet（スクレイピング）、法人番号Web-API v4、FSA/SESC、TSEスクリーナー、APAC開示モニタ → **Actor#4の法人番号は完全競合になる見込み**
- rationalistic_counselはe-Stat統計Actorも展開（同型戦略の先行者）

## 差別化の根拠（事実ベース）

- 既存EDINET汎用Actorはメタデータ＋DLリンク中心（実出力の深さは未実走・推測含む）→ 本Actorは財務値を正規化済み構造化フィールドで返す＋逐語照合済み英文サマリ＋golden回帰CI
- 「One of the few English-first sources built directly on the official EDINET API」までの表現に留める（誇大コピー規定）

詳細な生データ: 調査エージェント報告（2026-07-07）に基づく。
