# #4 README第1段落 差別化文言の強化（公開前・競合スキャン反映）2026-07-15

## 背景
公開前のStore競合スキャン（`japan company data` / `houjin`）を実施。完全競合を確認:
- **NexGenData「Japan Houjin-Bangou Corporate Registry」**: 法人番号レジストリをラップ。KYC/コンプライアンス志向・クロスActor結合キー戦略。英語名はNTA英語表記登録の約5万社のみ、他はnull。**polite-bot UA + 1.2秒スロットリング方式**。
- **jungle_synthesizer「gBizINFO Scraper」**: 自称「gBizINFOをラップする唯一のActor」。27フィールド。価格 $0.10/run + $0.001/社（当社$0.006より安い）。**gBizINFO検索APIのページネーション＝scraper方式**。

両社の共通弱点＝当社の差別化余地:
1. どちらも **scraper方式**（polite-bot礼儀・pagination依存）→ 当社の「公式API直叩き・no scraping」で壊れにくさを主張。
2. 英語名は競合も機械生成しない（null）が、当社は **HOUJIN名前解決＋houjin /4/num フォールバック**（gBizINFO未収録法人の基本3情報補完）を実装済み＝名前解決の深さで差。
3. **per-field golden検証**（frozen dataset）は競合が言語化していない品質保証。

価格は当社$0.006がjungle_synthesizerの$0.001より高いが、enrich（LLM英語要約）込みの価値＋名前解決の深さで正当化。価格競争に乗らない（marketing.md「安さで勝たない」方針）。

## FIX-1: README第1段落の差別化強化
対象: `actors/company-enrichment/README.md` の第1段落（タイトル直後の説明パラグラフ）。

**方針**: 全面書き換えではなく、既存の骨子（official gBizINFO API + NTA registry / capital・employees等の列挙 / no scraping / frozen datasets）を保持しつつ、以下3点を第1段落内に明示的に織り込む:
1. **not a scraper**（polite-bot throttling / pagination fragility が無いことを明示）
2. **name resolution の深さ**（NTA registry での名前解決＋フォールバックが、英語名null止まりの競合より踏み込んでいること。ただし「英語名を捏造しない」正直さは維持）
3. **per-field golden verification**（frozen dataset を per-field で検証していること）

**変更後の第1段落（推奨文面。既存の事実と矛盾しない範囲で調整可）**:
```
Corporate number lookup and firmographics for Japanese companies, in English. This Actor calls the **official gBizINFO API** (経済産業省 Gビズインフォ) and the **National Tax Agency corporate number registry** (法人番号 / houjin bangou) directly — **not a scraper**. There is no page-by-page crawling, no polite-bot throttling, and no HTML parsing to break when a portal changes. It returns japan company registry data — capital, employees, establishment date, industry, subsidies, procurement and patent counts — as clean, snake_case JSON. English company names come from the official registry (`name_en_method: api_native`) and, when a company is not in gBizINFO, are resolved via the NTA registry with a documented fallback — **never invented**; rows that cannot be resolved are reported honestly rather than machine-translated. The optional LLM enrichment is clearly labeled and verified against the source. Every release is tested against frozen datasets with per-field golden verification.
```

## 完了条件
1. `actors/company-enrichment/README.md` 第1段落が上記方針を反映（既存のHitachi実例・What you get以降は変更しない）。
2. 事実整合性の確認: `name_en_method` の実値（`api_native` 等）とフォールバックの実装がREADME記述と一致していること（憶測で機能を書かない。実装に無い機能は書かない）。
3. `docs/decisions.md` 先頭に1行: 「- 2026-07-15 #4公開前 競合スキャン（NexGenData/jungle_synthesizer=gBizINFO scraper系）反映。README第1段落を『not a scraper・name resolution・per-field golden』の3差別化で強化（review-2026-07-15-actor4-readme FIX-1）」
4. CI green（README変更のみなのでテストへの影響は無いはずだが念のため確認）・push。

## やらないこと
- 第1段落以外（Hitachi実例・What you get・Pricing等）を変更しない。
- 実装に無い機能・持っていない性能を書かない（競合比較で誇張しない。当社が本当に持つ差別化のみ記述）。
- 価格・PPEイベント・スキーマを変更しない。
- 競合の固有名（NexGenData等）をREADMEに書かない（比較広告は避け、自社の性質のみ述べる）。
