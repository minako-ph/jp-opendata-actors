# 全7 Actor README 相互リンクのURL実化（一括）2026-07-15

## 背景
柱2ファミリー全7本がApify Store公開完了（2026-07-14〜15）。各READMEの「## More Japan data Actors」節は
Actor名が**太字テキスト**のままで、公開URLへのリンクになっていない。7本すべてのURLが確定したので、
太字Actor名を Markdown リンク化する（ファミリー内クロスセルの動線を完成させる）。

## 確定URL対応表（表示名 → URL）
| 表示名 | URL |
| --- | --- |
| Japan Company Filings (EDINET Official) | https://apify.com/minako-ph/japan-edinet-filings |
| Japan Real Estate Transaction Prices (MLIT Official) | https://apify.com/minako-ph/japan-real-estate-prices |
| Japan Subsidies & Grants Data (Official) | https://apify.com/minako-ph/japan-subsidies-grants |
| Japan Company Data Enrichment (Official Registry) | https://apify.com/minako-ph/japan-company-enrichment |
| Japan Laws & Regulations (e-Gov Official) | https://apify.com/minako-ph/japan-laws-regulations |
| Japan Financial Statements (EDINET Official) | https://apify.com/minako-ph/japan-edinet-financials |
| Japan Business Days & Calendar (Cabinet Office Official) | https://apify.com/minako-ph/japan-business-days-calendar |

柱1（別リポジトリ・既公開）への言及がA7にある。これもURL化する:
| Japan Government Tenders Scraper + AI Extraction | https://apify.com/minako-ph/japan-tender-scraper |

## FIX-1: 各 actors/<dir>/README.md の「## More Japan data Actors」節で太字Actor名をリンク化

対象は全7本:
- actors/edinet-filings/README.md
- actors/real-estate-prices/README.md
- actors/subsidies-grants/README.md
- actors/company-enrichment/README.md
- actors/laws-regulations/README.md
- actors/edinet-financials/README.md
- actors/calendar-business-days/README.md

### 方針（重要）
- **文面は変えない。** 既存の説明文（#1↔A6の「discover→doc_id」連携、A7の「tender deadline→残営業日」ワークフロー等）はそのまま保持。
- **太字 `**Japan XXX (...)**` を `[**Japan XXX (...)**](URL)` に変えるだけ**（太字の中身は変えず、リンクで囲む）。
- 自分自身への言及があってもリンク化しない（各READMEで「this Actor」は対象外。他Actorの名前のみリンク化）。
- 上記対応表に無い名前（存在しない兄弟）は作らない。**実在7本＋柱1のみ**。
- 「See the developer profile for the full list」等の一般文はそのまま残す（プロフィールページ https://apify.com/minako-ph への言及として有効）。

### 各ファイルの具体的な変更点
1. **edinet-filings**: `**Japan Financial Statements (EDINET Official)**` をリンク化。
2. **real-estate-prices**: `**Japan Company Filings (EDINET Official)**` をリンク化。
3. **subsidies-grants**: `**Japan Company Filings (EDINET Official)**` と `**Japan Real Estate Transaction Prices (MLIT Official)**` をリンク化。
4. **company-enrichment**: `**Japan Company Filings (EDINET Official)**`・`**Japan Subsidies & Grants Data (Official)**`・`**Japan Real Estate Transaction Prices (MLIT Official)**` をリンク化。
5. **laws-regulations**: `**Japan Company Filings (EDINET Official)**`・`**Japan Subsidies & Grants Data (Official)**`・`**Japan Real Estate Transaction Prices (MLIT Official)**`・`**Japan Company Data Enrichment (Official Registry)**` をリンク化。
6. **edinet-financials**: `**Japan Company Filings (EDINET Official)**` をリンク化。
7. **calendar-business-days**: `**Japan Government Tenders Scraper + AI Extraction**`（柱1）と `**Japan Company Filings (EDINET Official)**` をリンク化。

### 任意の改善（判断はClaude Codeに委ねる・やらなくてもよい）
現状、各Actorが言及する兄弟の数がバラバラ（#1は1本、A5は4本など）。もし各READMEの末尾一般文
「Part of a family of official-API-based Japan data Actors (subsidies & grants, real estate...)」の
括弧内で挙げている分野名も、対応する実在Actorがあれば軽くリンク化してよい。ただし**文面を大きく書き換えない**こと。
無理に全兄弟を列挙する必要はない。既存の自然な文面を優先。

## 完了条件
1. 全7本の「More Japan data Actors」節で、他Actorの太字名がすべて正しいURLのMarkdownリンクになっている。
2. リンク先URLが上記対応表と完全一致（タイポ・技術名間違いがないこと。特に japan-business-days-calendar はディレクトリ名 calendar-business-days と順序が違うので注意）。
3. 文面（説明文）は変更していない。リンク化以外の実質的な変更がないこと（diffがリンク化に限定される）。
4. 自ActorへのリンクやCONTACT等、対象外部分は変更していない。
5. `docs/decisions.md` 先頭に1行: 「- 2026-07-15 全7Actor README の相互リンクをURL実化（ファミリー内クロスセル動線を完成。7本+柱1のStore URLへMarkdownリンク化・文面は不変。review-2026-07-15-crosslinks FIX-1）」
6. CI green（README変更のみ・テスト影響なしのはず）・push。

## 重要: 反映には各Actorの再pushが必要
READMEのStore掲載への反映は `apify push` 時に行われる。このFIX-1でREADMEを更新・pushしても、
**Apify Store上の各Actorページに反映されるのは、人間が各Actorを再push（`apify push`）したとき**。
→ Claude Codeはリポジトリの更新（README編集・git push）まで。Apifyへの再push 7本は human task（コンソール権限保持者）。
完了報告に「Store反映には各Actorの再pushが必要（7本）」と明記すること。

## やらないこと
- 説明文の書き換え・要約・再構成をしない（リンク化のみ）。
- 存在しないActorや未公開Actorへのリンクを作らない（実在7本＋柱1japan-tender-scraperのみ）。
- 価格・PPE・スキーマ・第1段落・What you get等、相互リンク節以外を変更しない。
- CNAMEやweb/には触れない（それは別タスク）。
