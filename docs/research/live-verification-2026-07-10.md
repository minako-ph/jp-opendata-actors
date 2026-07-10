# ライブ検証 2026-07-10 — HOUJIN_APP_ID到着後の統合版（#2 / #4 / #5）

実施日: 2026-07-10 ／ 前提: Step A実装済み（コミット 85de4e4・f0806cb・69666bb、CI緑=typecheck/lint/236テスト/bundle生成）。
実行方法: 各Actorのesbuildバンドル（`dist/main.js`）をローカルNode 22で実行（実API・実キー）。課金検証は `ACTOR_TEST_PAY_PER_EVENT=1`＋`ACTOR_USE_CHARGING_LOG_DATASET=1`（充電ログdatasetの生成には**両方**が必要——R2-6記載のフラグ単独ではログが出ない点は本検証での発見）。
制約の遵守: 不合格時も修正せず報告のみ（結果: 不合格なし）／golden・fixtureの自動上書きなし（既存golden 5ファイルは全Actor回帰で変更ゼロ。新規fixture `num.7010001008844.2026-07-10.xml` はStep A指示によるもの・redact済みhttp層経由・ID非含有検査済み）／`apify push` は人間タスク。

## 判定サマリ

| シナリオ | 内容 | 結果 | 合否 |
|---|---|---|---|
| #2-a (numbers) | corporate_numbers=[日立] | 補助金5件・golden一致・2秒 | **合格** |
| #2-a (names・追加正系) | company_names=["日立製作所"] | exact解決・**7010001008844に一致**・同5件 | **合格** |
| #2-b (ネガ・APP_ID unset) | company_names入力 | 明確なエラーで実行失敗・キー漏出なし | **合格** |
| #4-a (正系フル) | 日立＋中小exact＋トヨタ＋未収録見込み1社 | 下記詳細のとおり全経路期待どおり | **合格**（注1） |
| #4-b (enrichスモーク) | 日立・enrich=true | enriched生成・record-enriched課金証跡 | **合格** |
| #4-c (ネガ・APP_ID unset) | company_names入力 | 明確なエラーで実行失敗・キー漏出なし | **合格** |
| #5-a (スモーク) | 個情法・第1〜5条 | 185条中5条抽出・出典文言正・3秒 | **合格** |

注1: 「gBizINFO未収録法人での/4/numフォールバック（データ付き行）」のみライブでは発動対象が存在しなかった（後述）。フォールバック経路自体（gBiz 404→/4/numライブ呼び出し）はライブで通過し、データ付き行の内容は実応答fixtureの回帰テストで担保。

## #2 Japan Subsidies & Grants Data

### #2-a 正系
- `{"corporate_numbers":["7010001008844"]}` → 5件・exit 0・2秒。1件目は golden `run.hitachi.json` と全フィールド一致（retrieved_at除く）: 資エ庁「令和４年度固定価格買取制度等の…」¥76,846,429、`recipient_name: "Hitachi, Ltd."`、`attribution: 出典：経済産業省 Gビズインフォ`。
- **追加正系** `{"company_names":["日立製作所"]}` → `names_resolved:1`、全5行に `name_resolution: {"input_name":"日立製作所","confidence":"exact"}`、`recipient_corporate_number: "7010001008844"` = **指示の期待値に一致**。
- 課金: 5件は無料枠内（`free_used:5, records_charged:0`）＝実行単位無料枠50件の設計どおり。

### #2-b ネガ系（HOUJIN_APP_IDを一時unsetした環境で実施）
- exit 1・`ERROR [Status message]: company_names requires the National Tax Agency corporate number API. Set the HOUJIN_APP_ID secret, or use corporate_numbers instead.`
- キー漏出なし: 全実行ディレクトリ（ログ・dataset・KVS）をアプリケーションID実値でgrepし0件。

## #4 Japan Company Data Enrichment（合格基準「フル」）

### #4-a 正系フル
入力: `{"corporate_numbers":["7010001008844","9999999999999"],"company_names":["とよたメディカルラボ","トヨタ"]}` → exit 0・7秒・出力4行:

1. **日立（番号指定）**: フル行。`name_en:"Hitachi, Ltd."(api_native)`・`subsidy_count:5`・`patent_count:19950`（実ライブ値）・`capital_stock_jpy:466666000000`・`source:"gbizinfo"`。
2. **とよたメディカルラボ（中小・exact）**: `name_resolution:{confidence:"exact"}` → 8250001014801「とよたメディカルラボ株式会社」（山口県）。`subsidy_count:0, patent_count:0`。
3. **トヨタ（ambiguous）**: `_error: "Ambiguous name: 631 candidates. Use corporate_numbers to disambiguate."`＋WARN。**自動確定しない**ことを確認（法人格除去後の完全一致だけでも「株式会社トヨタ」×4・「有限会社トヨタ」×10等16社が実在するため、ambiguousが正しい）。
4. **9999999999999（未収録見込み枠）**: gBizINFO 404 → **フォールバックが/4/numをライブ呼び出し** → レジストリにも不在 → 非課金の明示行 `_error: "Not covered by gBizINFO (approx. 4M corporations). Not found in the NTA corporate number registry either."`（summary: `companies_not_found:1, houjin_fallbacks:0`）。

**未収録法人（データ付きフォールバック）の探索結果**: 実在法人でのgBizINFO 404は現時点で再現不可だった。前日（2026-07-09）設立の新規法人・閉鎖済み法人・労働組合支部・地方公共団体・国機関の計20社超を実プローブし**すべてgBizINFOに収録済み（200）**。gBizINFOは法人番号レジストリをほぼ当日〜翌日で完全ミラーしており、「約400万法人」の公称より実カバレッジは広い。→ フォールバックの発動は実運用では稀（gBiz取り込みラグの瞬間のみ）。**source整合（source:"houjin"・法人番号システムの出典文言・/4/numのsource_url・gBiz由来フィールド全null・record-basic課金）は実応答fixture `num.7010001008844.2026-07-10.xml` を用いた回帰テスト（run.test.ts）で担保**。

### #4-b enrichスモーク
- `{"corporate_numbers":["7010001008844"],"enrich":true}` → exit 0・6秒。`enriched.business_summary_en`（数値なし・confidence 0.95・method:"llm"）、`name_en.value:null`（api_native英名が存在するため生成せず＝R2-10どおり）。実測原価 $0.0008965/社（Phase 2実測avg $0.000805と同水準）。
- 課金証跡（charging_log dataset）: `record-enriched ×1` のみ発火。record-basicは無料枠20件内で非発火＝設計どおり（`eventPriceUsd:1/Unknown event` はローカルでイベントカタログを持たないための表示で正常）。

### #4-c ネガ系（HOUJIN_APP_IDを一時unsetした環境で実施）
- exit 1・#2-bと同一の明確なエラー・キー漏出なし（同grep検査）。

## #5 Japan Laws & Regulations（スモーク）

- `{"law_query":"個人情報の保護に関する法律","articles":["1","2","3","4","5"]}` → exit 0・3秒。`law_revision_id: 415AC0000000057_20260624_508AC0000000046`（2026-06-24施行版）・185条中5条抽出・`attribution: 出典：e-Gov法令検索（デジタル庁）`・失敗0・ドリフト0。

## Step Aで確定した実挙動（詳細は docs/research/houjin-name-search.md）

1. アプリケーションIDは**英数字13桁**（「数字13桁」の旧仮定でクライアントが実IDを弾く事故をライブ前に修正）。
2. `/4/name` は**法人格を除いた名称に一致**（法人格込みクエリは0件）・**全角のみ受付**（半角英数はHTTP 400エラー101）→ resolveCompanyNameへ最小調整（クエリの法人格除去＋全角化・比較の法人格対応）。この調整なしでは #2-a names / #4-a の exact 解決は成立しなかった。
3. エラーURLのredaction（`?[query redacted]`）が実エラーでも機能しキー漏出なしを確認。

## 残り（人間タスク）

- Apifyコンソール: HOUJIN_APP_ID をActor #2・#4 のSecretに設定 → `apify push`（#2/#4は今回変更あり。#5は変更なしだが未pushなら合わせて）→ PPE設定・単価確定（#4 enriched実測は$0.0009/社水準で変わらず）。
- #4公開ゲート（国税庁ID）は**解除**。公開前Store競合スキャン（decisions 2026-07-07: NexGenData完全競合見込み→差別化文言の最終確認）。
- 柱3（company-list-cleaner）: gov-clients/houjin（client.ts/resolve.ts・fixture追加）に変更が入ったため**subtree再syncが必要**。
