# 柱2 マーケティング戦略書 v1.0 —「日本公的データ×英語構造化」Actorファミリー

作成日: 2026-07-07 ／ 対文書: 柱2_要件定義書v2.0（KPI・受入基準の正）／柱2_ClaudeCode引継書v1.0（README必須節・Store名の初出）
本書の位置づけ: **Store掲載文言・リスティング構成・コンテンツ計画の正**。引継書§10はここに従属する。

---

## 1. 前提と原則（4つ。全節がこれに従う）

1. **能動マーケなし**: SNS常時運用・広告・コールドアウトリーチをしない。許容されるのは「一回性の投資」（記事の執筆・掲載文言の作成）のみ。書いた後に運用しない。
2. **正直マーケ**: できないことを先に書く。誇大コピー禁止（入札Actorでの教訓——「唯一」「only」「best」は根拠と限定修飾なしに使わない）。制約の明記自体が信頼シグナルであり転換装置。
3. **束ね原則**: 柱2単独の発信チャネルを持たない。日本語コンテンツは柱1（入札）の記事群・柱4（Zenn本）に相乗りする。
4. **改修1回ルール**: KPI未達時のリスティング/価格の改修は1回だけ（要件書§10）。マーケの試行錯誤に時間を溶かさない。改修で直らなければ統廃合で対応する。

## 2. 買い手と「検索の瞬間」

マーケの仕事は需要創出ではなく、**既に検索している人・エージェントの前に正しい言葉で立つこと**（能動マーケなし制約の帰結）。

| Actor | 買い手 | 検索の瞬間（トリガー） |
|---|---|---|
| #1 EDINET | 海外投資リサーチ・データベンダー・クオンツ | 「日本株のファンダデータをAPIで」「EDINETに英語版はないのか」 |
| #2 補助金 | 海外market intel／国内の営業・調査 | 「日本の補助金採択企業リスト」「which Japanese companies got subsidies」 |
| #3 不動産 | 海外不動産投資家・PropTech | 「japan property price data」「東京 取引価格 API」 |
| #4 法人 | セールスインテリジェンス・軽量KYC | 「japan company registry english」「corporate number lookup」 |
| #5 法令 | リーガルテック・外資法務 | 「japanese law api english」「JLTに載っていない法令の英訳」 |
| エージェント | AIエージェント（MCP経由） | タスク遂行中の自律的ツール検索（`search-actors`） |

## 3. チャネル構造と優先度

| 優先 | チャネル | 性質 | 施策 |
|---|---|---|---|
| 1 | Apify Store内検索 | ストック型・購買意思が最も近い | §5（リスティング仕様） |
| 2 | Google → Store掲載ページ | ストック型・「コールド」流入 | §5（SEO description・README）＋§7（被リンク） |
| 3 | エージェント（Apify MCP） | 新興・自律選定 | §6（agentic SEO） |
| 4 | 技術記事（dev.to / Zenn束ね） | 一回性・主目的は被リンク | §7 |
| 内部 | ファミリー内クロスセル＋柱1相互 | 無料・確実 | §8 |

裏付け: Store内検索のマッチングは「**Actor名（最重量）→説明→README→カテゴリ→タグ**」の5フィールド、これに実行数・成功率・**更新の新しさ**・評価が加味される。掲載ページはGoogleにも通常のWebページとして索引され、**dev.to等からの被リンク3〜5本でGoogle 3ページ目→1ページ目に動いた実例**が報告されている。ニッチページほど少ない被リンクで動く——本ファミリーはまさにニッチであり、この構造は追い風。

## 4. ポジショニング

**ファミリー統一メッセージ（全READMEの第1段落に変奏して使用）**:
> Official Japanese government data, structured for English-speaking developers and AI agents. Built on official APIs only — no scraping, no broken selectors.

**差別化の3本柱**（競合が模倣しにくい順）:
1. **公式APIのみ＝壊れない**: DOM依存ゼロ。「動き続けること」自体を売る（Store上の放置Actorとの最大差別化。メンテナンスフラグはランキングを抑制するため、これは検索順位戦略でもある）。
2. **日英構造化＋検証文化**: snake_case英語フィールド＋`*_ja`原文併記、golden回帰CIで品質固定。READMEに "Tested against frozen datasets on every release" と書けるのは実装がそうなっているから。
3. **正直な制約明記**: 悉皆でない範囲、更新頻度、非保証を先に書く。#5はJLT（法務省公式英訳DB）の存在を自ら案内し「JLT未収録・最新改正のギャップを埋める」と位置づける。#1はファンド開示混在を明記。誠実さを疑われた瞬間にニッチデータ商売は終わるため、これは倫理であると同時に防衛戦略。

**誇大コピー規定**: 「the only English source」系は禁止。使うなら「One of the few English-first sources built directly on {official API}」まで。比較優位は事実（公式API・二言語・検証CI）でのみ主張する。

## 5. Apify Store リスティング仕様（実装の正）

### 5.1 命名（最重要のランキング要因）

Actor名＝URLスラッグ＝ページtitleタグ。**検索される語を名前に含めない限り、内部検索でもGoogleでも出ない**。方針: `Japan + ドメイン名詞 + (Data|Prices|Filings...)`。"Scraper"の語は検索ボリュームが大きいが、本ファミリーは非スクレイピングが売りのため**通常名には使わず、SEO名（Google向け・別設定可）でのみ「API」を前置**して検索意図を拾う。

| # | Store名（通常） | スラッグ | SEO名（Google向け） |
|---|---|---|---|
| 1 | Japan Company Filings (EDINET Official) | japan-edinet-filings | EDINET API — Japan Company Filings Data in English |
| 2 | Japan Subsidies & Grants Data (Official) | japan-subsidies-grants | Japan Government Subsidies Data (gBizINFO / jGrants) |
| 3 | Japan Real Estate Transaction Prices (MLIT Official) | japan-real-estate-prices | Japan Real Estate Price Data API (Official MLIT) |
| 4 | Japan Company Data Enrichment (Official Registry) | japan-company-enrichment | Japan Corporate Number Lookup & Company Data API |
| 5 | Japan Laws & Regulations (e-Gov Official) | japan-laws-regulations | Japanese Law API — Full Text & English Summaries |

### 5.2 説明文（2種を使い分け）＋Actor別の確定文言リスト

- 通常description（Store内・「温かい」訪問者向け）: 機能を平叙で。**120〜160字が最もCTRが高い**（4.2%）ためこの範囲で書く。
- SEO description（Google・「冷たい」訪問者向け）: 検索語のバリエーションを含める。

**Actor別の確定文言リスト**（§5.1のSEO名表とセットで「掲載文言の正」。#2/#4/#5の公開準備時もここに追記する）:

| # | SEO説明文（確定） | タグ候補 | 推奨カテゴリ |
|---|---|---|---|
| 1 | EDINET API in English. Structured annual & semi-annual filings of Japanese listed companies: revenue, income, employees. Official FSA data, JSON output. | japan, edinet, financial-data, filings, official-api（公開時の現行タグ体系で確定） | Finance／Business |
| 2 | Japan government subsidies data API. Official gBizINFO records: which Japanese companies received which subsidies, amounts in JPY, ministry names in English. JSON output. | japan, subsidies, grants, gbizinfo, official-api | Business |
| 3 | Japan real estate transaction prices API in English. Official MLIT data: quarterly actual & contract prices, all 47 prefectures, JSON output. No scraping. | japan, real-estate, property-prices, mlit, official-api | Real estate（無ければBusiness） |
| 4 | Japan corporate number lookup & company data API. Official gBizINFO registry: capital, employees, industry, subsidies, procurement, patents. English JSON output. | japan, company-data, corporate-number, gbizinfo, kyc, official-api | Business |

### 5.3 READMEテンプレ（引継書§10の必須節を包含・SEO構造化）

1. 第1段落: 最重要キーワードを含む2〜3文＋「Official API based — no scraping」（Googleは第1段落とH2を重く見る）
2. `## What you get`（出力サンプルJSONを必ず貼る——エージェントとGoogle両方への最強コンテンツ）
3. `## How to use`（input prefillで30秒で初回成功する導線）
4. `## What this does NOT do`（正直明記節。要件書FR-C4）
5. `## Pricing`（PPE単価と無料枠を明文化。透明性＝転換装置）
6. `## Data source & attribution`（出典指定文言・提供元サイトへの外部リンク——公式SEOガイドが推奨）
7. `## More Japan data Actors`（ファミリー相互リンク。§8）
- 300語以上・H2にキーワード・キーワード詰め込み禁止（ペナルティ対象）。

### 5.4 検索キーワードマップ（README・説明文に自然に散らす）

- #1: edinet api / edinet english / japan financial filings / japanese listed companies financials / yuho annual report
- #2: japan subsidies data / japanese government grants / gbizinfo english / jgrants / subsidy recipients japan
- #3: japan real estate data / japan property transaction prices / mlit api / reinfolib / tokyo housing prices dataset
- #4: japan corporate number / houjin bangou api / japan company registry english / japan kyc data / enrich japanese companies
- #5: japan law api / japanese laws in english / e-gov api / japanese regulations translation / japan legal database

### 5.5 その他のランキング入力

- カテゴリ・タグ: 各Actorで最も近い既存カテゴリを選択（公開時に現行カテゴリ一覧から。受入基準6の競合スキャンと同時に確定）。
- **更新の新しさ**: 依存更新・fixture更新のパッチリリースを月1目安で自然に出す（N-5の保守作業をリリースとして刻む）。**空更新でrecencyを稼ぐことは禁止**（原則2に反する）。
- 成功率: FR-C8（部分失敗の許容）が実行成功率を守る＝ランキング防衛。
- Issues応答: メンテナンスフラグはランキングを**能動的に抑制**するため、48h以内一次返信のSLA（運用要件）はマーケ要件でもある。

## 6. エージェント経路（agentic SEO）

Apify MCPサーバー経由でエージェントは `search-actors`（無料）→ `fetch-actor-details`（README要約・入力スキーマ・価格・**推論された出力スキーマ**を取得）→ 実行、という順で選定する。x402/Skyfireにより**トークンなしの自律決済**も既に可能（プリペイド方式）。つまりエージェントに「選ばれる」条件は人間向けSEOとほぼ同型で、以下が追加要件になる:

1. **狭い入力**: 設定項目が多いActorはツール呼び出しで敬遠される。必須最小・prefill（FR-C5と整合）。
2. **小さく構造化された出力**: JSONの少数フィールドが理想。本ファミリーは設計がそのまま適合。
3. **速い実行**: 既定入力で30秒以内に最初の結果が返る形（FR-C7の上限が防護を兼ねる）。
4. **説明文は平叙・機械可読**: 絵文字装飾より「何を入れると何が返るか」を1文目に。
5. 価格の予見可能性: PPE単価をREADMEに明記（エージェントは価格情報を読んで選定する）。

x402は有効化のみ・追加開発禁止（引継書§13）。単月$200超で初めて拡張検討という閾値も維持。

## 7. コンテンツ計画（一回性・被リンク目的）

| 記事 | 言語/媒体 | タイミング | 内容と目的 |
|---|---|---|---|
| A: ファミリーローンチ | EN / dev.to | Phase 2完了時（3本公開後） | "Japan's official open-data APIs in English: notes from building 5 Apify Actors"。5本すべてに被リンク（Google順位の起爆。3〜5本の質の良い被リンクで動く実例に基づく） |
| B: 技術深掘り | EN / dev.to | Phase 3完了後 | "Shift_JIS, wareki dates, and XML-only registries: parsing Japan's government APIs"。開発者の共感を取る技術譚＋被リンク |
| C: 日本語 | JA / Zenn | 柱1記事に相乗り | 柱1（入札）のZenn記事群に「公的データActorファミリー」の1節を追加するのみ。柱4のZenn本と素材共有 |
| 任意 | LinkedIn個人投稿 | A公開時に1回 | 一回性投稿は原則1の範囲内。運用はしない |

全記事は**書き捨て**（公開後に更新・返信運用をしない）。目的の優先順位は ①被リンク ②ロングテール検索の受け皿 ③信頼の証跡、の順であり、記事自体のバズは狙わない。

## 8. クロスセル・ファミリー設計

- 全READMEの末尾に `## More Japan data Actors` 固定節（attributionパッケージの自動挿入と整合）。**新Actor公開時に既存Actor側のREADMEにもリンクを追記する**（公式ガイドが明示的に推奨する内部リンク施策）。
- **#2補助金 ↔ 柱1入札は同一買い手**（日本の公共セクター市場を見る人）。相互READMEで明示的に言及し、#2のREADMEには日本語の1節を置く（国内買い手向け。ファミリーで唯一の例外）。
- Apify開発者プロフィールを整備: bio（"Official-API-based Japan data actors. TypeScript, golden-tested."）＋全Actor一覧が1画面で見える状態を維持。プロフィールページ自体がファミリーのランディングページを兼ねる。
- 柱3アドオン（日本語市場）とのクロスは#4のみ薄く（README相互リンク程度。市場が異なるため深追いしない）。

## 9. 価格のマーケ機能

- 無料枠（FR-C6）は「試せるが業務には足りない」水準——トライアル装置であって集客装置ではない。
- actor-start $0.02は空実行の下限課金であると同時に「価格が明示されている」という信頼シグナル。
- **価格競争に応じない**（引継書§13）。後発が安値で来ても、防衛は価格でなく「壊れない・検証済み・正直」の3本柱で行う。値下げはN-2の原価再計測に基づく場合のみ。

## 10. 信頼・レビュー運用

- Issues一次返信48h SLA（メンテナンスフラグ回避＝ランキング防衛を兼ねる）。
- 初期レビューは自然発生のみ。**レビュー依頼スパム・相互レビュー・自作自演は禁止**（発覚時の信頼毀損はニッチ商売では致命傷）。READMEの正直明記が期待値を正しく設定し、低評価の主因（期待とのギャップ）を予防する。
- "Tested against frozen datasets" "Official API only" をREADMEの信頼文言として統一使用。

## 11. ローンチ手順（Actor 1本ごとのチェックリスト）

1. 競合スキャン: §5.4のキーワードでStore上位10件を確認（要件書・受入基準6）。完全競合がいれば差別化文言（3本柱のどれで勝つか）をREADME第1段落に反映。
2. 名前・スラッグ・通常/SEO説明文を§5.1〜5.2どおり設定。
3. README: §5.3テンプレ準拠・300語以上・出力サンプルJSON・正直明記節。
4. input prefill: 実行ボタンを押すだけで30秒以内に意味のある結果が返ることを実機確認。
5. カテゴリ・タグ設定。PPE単価・無料枠を要件書§7どおり設定し、READMEのPricing節と一致させる。
6. 既存ファミリーActorのREADMEに新Actorへのリンクを追記。プロフィールページ更新。
7. （該当時）記事A/Bへのリンク挿入・柱1側READMEとの相互リンク（#2のみ）。
8. 公開後1週間は毎日1回だけ実行ログと最初のIssuesを確認（以降は通常監視N-4へ）。

Phase連動: Phase 1（#1）→チェックリストのみ／Phase 2完了（#1〜3公開）→**記事A執筆・掲載**／Phase 3完了（#4公開）→**記事B**／Phase 4（#5公開）→チェックリスト＋プロフィール最終整備。

## 12. マーケKPIと改修規律

- 観測指標（Apifyアナリティクスで取れる範囲のみ）: ①Store表示→実行の転換 ②無料実行→有料イベントの転換 ③流入元（可視な範囲）。ダッシュボード作り込みはしない（テレメトリは要件書§10の統廃合判定用が主目的）。
- 判断は要件書§10に完全委譲: 3ヶ月$100未達→**リスティング/価格の改修は1回だけ**→なお未達で統合・廃止。マーケ改善の無限ループを構造的に禁止する。
- 成功の先行指標: 公開2週間での「検索経由の初実行」の有無（ゼロなら名前とキーワードの選定ミスを疑い、1回だけの改修をここに使う）。

## 13. やらないこと

SNSアカウント常時運用／広告出稿／コールドDM・営業メール／レビュー依頼・相互レビュー／ディスカウント合戦・期間限定セール／誇大コピー（"only" "best" "#1"）／キーワード詰め込み／空アップデートによるrecency稼ぎ／記事の継続運用・シリーズ化（束ね原則の範囲外）／Product Huntローンチ（工数対効果が不明なため任意・優先度最下位。やるとしても記事Aの転載程度）。

## 14. リスクと正直な限界

- **検索量の上限**: 「Japan × データ」の英語検索は絶対量が小さい。これは弱点であると同時に、被リンク数本で1ページ目に立てる理由でもある。月$30〜80/本という控えめな中央値想定（戦略レポートv2.0）はこの上限を織り込んだ数字であり、マーケで覆す前提を置かない。
- Store側のアルゴリズム・カテゴリ体系の変更: 依存は名前とREADMEという可搬資産に集中させているため、被害は限定的。変更検知時のみ§5を改訂。
- 模倣者: 先行の実行数・評価・更新履歴がそのまま堀になる（ランキング要因のため）。価格では戦わない（§9）。
- 1〜3ヶ月はほぼゼロ（Jカーブ）を再確認。公開直後の静けさは失敗のシグナルではなく、選んだチャネルの構造。判断は§12の閾値でのみ行う。

---
*改訂トリガー: 受入基準6の競合スキャンで重大な発見があったとき／Storeのランキング仕様・カテゴリ体系の変更を検知したとき／要件書§10のKPI抵触時。*
