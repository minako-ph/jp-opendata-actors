# 柱2 Claude Code引継書 v1.0 — jp-opendata-actors 実装ハンドオーバー

作成日: 2026-07-07 ／ 対文書: **柱2_要件定義書v2.0（要件の正はあちら。矛盾時は要件書優先）**
本書の目的: これまでの戦略検討・調査で確定した方針・検証済み事実・禁止事項を欠落なく引き継ぎ、実装者（Claude Code）が文脈を再質問せずに完成まで到達できるようにする。

---

## 0. 読み方

§1〜2が「なぜこう作るか」、§3〜10が「どう作るか」、§11〜13が「どの順で・何をもって完了とするか」。**§13のDo/Don'tは絶対規則**。判断に迷ったら「要件書 → 本書Do/Don't → 本書該当節」の順で参照し、それでも未定義なら実装を止めずに最小実装＋TODOコメントで前進し、`docs/decisions.md`に判断ログを1行残すこと。

## 1. プロジェクト文脈（戦略・制約の完全再現）

- 事業主はソロ開発者。制約: **初期投資5万円以内／運用は週1時間未満／能動マーケなし（SNS運用・広告・営業をしない）／受託はしない**。開発工数はClaude Code任せで実質無制限。
- 戦略の核: 即金性・継続性・無人性のトリレンマで「継続×無人」を選択済み。1〜3ヶ月の収益ほぼゼロ（Jカーブ）は設計として受容済み。焦って方針を曲げない。
- 本ファミリー（柱2）はポートフォリオの一部。**柱1＝入札Actor（別リポジトリ・出荷最優先）**、柱3＝Google Sheetsアドオン「会社リストクリーナー」、柱4＝Zenn本。柱2の役割は「面で稼ぐ」($30〜80/月×5本が12ヶ月中央値の想定)。ホームラン狙いの機能肥大はしない。
- 意思決定様式: **撤退基準を先に固定し、閾値で機械的に統廃合する**（要件書§10）。統廃合は収益効率と同時に「週1h保守」を守る唯一の構造装置。
- 為替換算は1USD≒155円を既定（環境変数化、§5）。
- 原則「**検討より出荷**」。新規アイデアで完成間近の出荷を遅らせない。仕様の追加提案はしてよいが、v1スコープに入れずTODO化する。

## 2. 継承する設計原則（柱1・入札Actorプロジェクト由来）

1. **データ源は公式APIのみ。DOMスクレイピングを書かない**（保守の主因を構造的に排除するため）。
2. **凍結データセット回帰（golden）**: 実APIレスポンスのスナップショットに対するパース結果をgoldenとしてCIで固定。
3. **LLM品質規律**: 逐語照合／非存在項目はnull／生成物にconfidence・method付与（要件書N-9）。
4. **正直README**: できないこと・非保証を先に書く。誇大コピー禁止。制約の明記は信頼マーケを兼ねる。
5. 監視通知（N-4）と原価再計測（N-2）は入札Actorの同名要件の移植。

## 3. 確定済みアーキテクチャ

### 3.1 リポジトリ（新規作成: `jp-opendata-actors`）

```
jp-opendata-actors/
├── actors/
│   ├── edinet-filings/          # #1
│   ├── subsidies-grants/        # #2
│   ├── real-estate-tx/          # #3
│   ├── company-enrichment/      # #4
│   └── laws-structured/         # #5
├── packages/
│   ├── gov-clients/     # 源別クライアント edinet/gbizinfo/reinfolib/houjin/laws
│   ├── schema-buffer/   # Zod境界スキーマ＋未知フィールド保全(passthrough)＋ドリフト検知
│   ├── enrich/          # LLMパイプライン（§6）
│   ├── normalize-jp/    # 和暦→ISO、全角半角、住所EN、法人格サフィックス表、波ダッシュ/カンマ数値正規化
│   ├── billing/         # Actor.chargeラッパ（§7）
│   ├── attribution/     # 出典文言定数と自動挿入（§4.6）
│   └── testing/         # fixtureローダ＋goldenランナー
├── docs/decisions.md    # 実装中の判断ログ（1行/件）
└── .github/workflows/ci.yml
```

依存方向は `actors → packages` の一方向のみ。packages間は `gov-clients → schema-buffer/normalize-jp` を許可、逆流禁止。**`gov-clients/houjin`と`gov-clients/gbizinfo`は将来、柱3リポジトリから参照される前提**（§14）なので、相対パス依存を作らずパッケージ公開面（index.ts）を明確に保つ。

### 3.2 技術スタック（確定）

- TypeScript（strict）／Node 20＋／pnpm workspaces
- Apify SDK v3。HTTP取得はfetchベースで良い（Crawleeのブラウザ機能は使わない）
- Zod（schema-buffer）／vitest／eslint＋prettier
- XML/CSV: `fast-xml-parser` ＋ `iconv-lite`（法人番号APIのShift_JIS対応）
- LLM: Anthropic SDK、既定 `claude-haiku-4-5` の **Batch API**
- コミット: Conventional Commits。trunk-based（mainに小さくマージ）。Actorのデプロイは `apify push` を手動実行（自動デプロイCIは組まない）

## 4. 検証済みデータ源ファクト集（2026-07-07時点・全て裏取り済み）

### 4.1 EDINET API v2（キー取得済み）
- 一覧: `GET https://api.edinet-fsa.go.jp/api/v2/documents.json?date=YYYY-MM-DD&type=2`（**日単位**。期間指定は日でループ）
- 取得: `GET .../api/v2/documents/{docID}?type=1|2|5`（1=XBRL zip, 2=PDF, **5=CSV←v1の財務値ソース**）
- 認証: クエリ `Subscription-Key`。過去10年分。docTypeCode: 120=有報, 130=訂正有報, 160=半期（四半期報告制度は廃止済み。コード表は実装時に別紙様式コードリストで再確認）
- レート: **未公表**。1req/秒仮置き→実測（未決#2）。一覧レスポンスの `results` は書類ゼロの日で空配列。

### 4.2 gBizINFO（トークン取得済み・v2必須）
- **v1（`https://info.gbiz.go.jp/hojin/v1/...`、ヘッダ `X-hojinInfo-api-token`）は2026年9月終了**。次期gBizINFO（2026年1月切替済み）の**v2で実装**。v2の正式パス・ヘッダ名は次期サイトの仕様書で初日に確認（未決#1）。
- データ: 法人基本・補助金・届出認定・調達・特許・財務・職場。約400万法人。**2025年6月〜2026年1月にデータ収集凍結期間あり**（READMEに明記）。
- 補助金にはjGrants由来データが混在し備考で識別可能→`data_origin`フィールド化。
- 規約: 政府標準利用規約2.0（商用・加工・二次配布可、出典明記必須）。アクセス制限は「通常なし・遮断権留保」→2req/秒仮置き。

### 4.3 不動産情報ライブラリ（キー審査中〜5営業日）
- 取引価格: `GET https://www.reinfolib.mlit.go.jp/ex-api/external/XIT001?year=&area=&city=...`／市区町村一覧: `XIT002`
- 認証: ヘッダ `Ocp-Apim-Subscription-Key`。**ブラウザからの直接リクエスト禁止（CORS）**→サーバ実行のActorはOK、READMEに「キーの直叩き転用不可」を注記。
- **XIT001の応答は日英両フィールドを最初から含む**（Prefecture/Municipality/FloorPlan等）→ #3はLLM完全不要・限界費用ほぼゼロ。
- XIT001/XIT002はデータなしで**404**を返す（タイル系APIは200＋空配列）。404はエラーでなく0件として扱う。
- レート: 明示上限なし・「間隔を空ける」要請→1req/秒＋直列。成約価格系エンドポイントの範囲差は未決#4。

### 4.4 国税庁 法人番号Web-API Ver.4（ID審査中1〜1.5ヶ月＝#4公開ゲート）
- 例: `https://api.houjin-bangou.nta.go.jp/4/num?id={appId}&number={法人番号}&type=12&history=0`。機能は「番号指定」「期間指定（差分）」「名称指定」の3系統。
- **応答はCSV(Shift_JIS=01/Unicode=02)またはXML(12)のみ。JSONなし**→fast-xml-parser＋iconv-lite必須。
- **検証環境あり**（架空法人データ）→ID到着前でも検証環境仕様でクライアント実装とfixture整備を先行できる。名称検索の曖昧一致挙動は未決#3。
- 1req/秒仮置き。

### 4.5 法令API v2（登録不要）
- ベース: `https://laws.e-gov.go.jp/api/2`（2025-03-19正式リリース）。`law_data/{law_id|law_num}` ほか。`response_format=json` でJSON（**XMLと相互変換前提の仕様で変動余地→XMLフォールバックを実装**、未決#5）。時点指定（as_of）対応。Swagger UI/Redocあり。
- **禁止事項: 全法令をループして順次取得**。バルク需要は公式XML一括ダウンロードに誘導（Actorでは受けない）。1req/秒。
- 法令本文は著作権法13条により権利対象外。ただし英訳は「参考訳・法的助言でない」disclaimer必須。法務省JLT（公式英訳DB）の存在をREADMEで正直に案内し、本Actorは「JLT未収録・最新改正のギャップ埋め」と位置づける。

### 4.6 出典文言（verbatim定数として `attribution` パッケージに実装）
- 法人番号: 「このサービスは、国税庁法人番号システムのWeb-API機能を利用して取得した情報をもとに作成しているが、サービスの内容は国税庁によって保証されたものではない」
- 不動産: 「このサービスは、国土交通省不動産情報ライブラリのAPI機能を使用していますが、提供情報の最新性、正確性、完全性等が保証されたものではありません。」
- gBizINFO: 「出典：経済産業省 Gビズインフォ」／EDINET: 「出典：金融庁 EDINET」／法令: 「出典：e-Gov法令検索（デジタル庁）」＋参考訳disclaimer

## 5. シークレット・環境変数（Apify Secretsで管理。コード・fixtureに含めない）

`EDINET_API_KEY` / `GBIZINFO_API_TOKEN` / `REINFOLIB_API_KEY` / `HOUJIN_APP_ID` / `ANTHROPIC_API_KEY` / `ENRICH_MODEL`(既定 claude-haiku-4-5) / `ENRICH_PRICE_IN`・`ENRICH_PRICE_OUT`(USD/Mtok) / `FX_JPY_PER_USD`(既定155) / `ALERT_WEBHOOK_URL`（通知先。未設定時はApify通知のみ）

## 6. LLM enrichmentパイプライン（packages/enrich）

- 呼び出し: Anthropic **Batch API**既定・temperature 0・出力はtool useでJSONスキーマ固定。プロンプトは `packages/enrich/prompts/` にバージョン管理。
- **逐語照合の実装**: LLM出力JSONから固有名詞・数値候補を抽出→normalize-jp（全半角・波ダッシュ・カンマ数値）で正規化した原文に部分一致検証→不一致は数値・固有名詞フィールドをnull化＋`verification_failed: true`、要約文はフラグのみ付与して残す。
- 非存在項目はnull（プロンプトとスキーマ両方で強制）。生成項目に`confidence`(0-1)と`method`("api_native"|"rule"|"llm")。
- 原価ログ: 実行ごとにtokens×単価env→ログ出力（N-2再計測の入力）。マージン85%を割る単価変動を検知したら警告通知。

## 7. 課金（PPE）の実装

- 単価・無料枠の**数値は要件書§7が正**。Apifyコンソール側のPPE定義とコード側のイベント発火名を一致させる: `actor-start` / `record-basic` / `record-enriched` / `article-translated`。
- コードは `billing.charge(event, count)` ラッパ経由でのみ発火（テストでモック可能に）。無料枠はApifyのPPE設定側で構成し、コードでは制御しない。
- x402/agenticは`actor.json`のフラグ設定のみ。**追加開発禁止**（四半期$0なら放置、単月$200超で初めて拡張検討——それまで工数を使わない）。

## 8. テスト戦略（golden運用）

- fixture: 実API応答のサニタイズ済みスナップショット（キー除去・小サイズ・取得日付をファイル名に）。`packages/gov-clients/*/fixtures/`。法人番号は検証環境から取得可。
- golden: `actors/*/test/golden/` にパース・変換後の期待出力。`pnpm golden:update`で候補生成→**人間（事業主）がdiffレビューしてコミット**（自動更新禁止）。
- ドリフト検知: schema-bufferで未知フィールド出現・既知フィールド消失を検知→CI failおよび実行時は警告ログ＋続行（N-4通知対象）。
- CI（GitHub Actions）: typecheck / lint / vitest（golden含む）/ ドリフトチェック。デプロイは含めない。

## 9. 監視・通知（N-4実装）

実行終端で集計: 失敗率>20%、429/403発生、ドリフト検知のいずれかで `ALERT_WEBHOOK_URL` へ要約POST（未設定ならログのみ）＋Apifyの実行失敗通知を有効化。バックオフ: 指数（1s→4s→16s）、3回で当該実行を中断しアラート。

## 10. Store掲載・README規約

- README必須節: ①冒頭「Official API based — no scraping」 ②What you get ③**What this does NOT do**（カバレッジ・更新頻度・非保証） ④Pricing ⑤Attribution（§4.6文言） ⑥Contact。
- 確定Store名/タグライン:
  - #1 "Japan Company Filings (EDINET Official)" — Structured financial filings of listed Japanese companies, in English.
  - #2 "Japan Subsidies & Grants Data (Official)" — Which Japanese companies received which government subsidies.
  - #3 "Japan Real Estate Transaction Prices (MLIT Official)" — Actual quarterly transaction prices across Japan, bilingual.
  - #4 "Japan Company Data Enrichment (Official Registry)" — Corporate number lookup + firmographics, English output.
  - #5 "Japan Laws & Regulations (e-Gov Official)" — Full text of Japanese laws as structured JSON with English summaries.
- 公開直前にStore競合スキャン（"Japan filings/subsidy/real estate/company data/laws"）→完全競合がいれば差別化文言を追記（受入基準6）。

## 11. 実装フェーズとDefinition of Done

| Phase | 内容 | DoD |
|---|---|---|
| 0 (W3-4) | packages最小: gov-clients(edinet)・schema-buffer・testing・billing・attribution | edinet fixtureでgolden green、chargeモックテスト通過 |
| 1 (W4-M2前) | **#1 EDINET公開** | 要件書§8の受入基準全達成＋`apify push`済み＋PPE設定 |
| 2 (M2) | #2・#3公開 | 同上。#2はgBizINFO v2スキーマ安定確認後、#3はキー到着後 |
| 3 (M2後-M3) | jp-corp-core（houjin＋gbizinfoクライアント完成）→ **#4公開** | 国税庁ID到着がゲート。ID待ちの間は検証環境で先行実装 |
| 4 (M3) | **#5公開** | #1〜#3の保守実績が月1h/本以内 |

各Actorの完了＝受入基準（要件書§8）。**柱1（別リポジトリ）の出荷作業と競合したら常に柱1優先。**

## 12. 実装初日のタスク（この順で）

1. gBizINFO次期サイトでv2仕様書を取得し、エンドポイント・ヘッダ・補助金検索パラメータを`docs/decisions.md`に記録（未決#1）。
2. リポジトリ雛形＋CI＋packages/testing・schema-buffer骨格。
3. EDINETクライアント＋実応答fixture採取（1req/秒で数日分）→golden初版。
4. Apify PPEの現行仕様（単価下限・無料枠設定方法）をコンソールで確認（未決#6）。
5. 法人番号は検証環境仕様の確認とfixture採取（IDなしで可能な範囲）。

## 13. Do / Don't（絶対規則）

**Do**: 公式APIのみ／直列＋源別間隔（§4）／部分失敗は継続（FR-C8）／実行上限で打ち切り（FR-C7）／出典文言を全アイテムに／未定義事項は最小実装＋TODO＋decisions.md。
**Don't**:
- DOMスクレイピング・ヘッドレスブラウザを書かない。
- レインズ／J-PlatPat／TDnetをデータ源にしない。
- **インボイスWeb-APIをActorに組み込まない**（柱3専用。国税庁承認が「登録番号照会のみ・逆検索なし・非保存」の条件付きで、Actor形態はこの条件を満たせないため。§14）。
- 法令の全件ループ取得を実装しない（提供元禁止事項）。
- goldenの自動上書き・fixtureへのシークレット混入をしない。
- 課金イベント名・単価を要件書§7から独断で変えない。x402まわりの追加開発をしない。
- v1スコープ外の機能追加（XBRLフルパース等）を提案なしに実装しない。誇大な英文コピーを書かない。

## 14. 柱3との共用境界（重要な文脈）

柱3「会社リストクリーナー for Google Sheets」は、**国税庁に承認申請中のインボイスWeb-API利用**（条件: 登録番号=T+13桁による照会のみ／氏名・名称等からの逆検索機能なし／取得データを申請者側サーバに保存しない）を核とするアドオン。柱2の`gov-clients/houjin`・`gov-clients/gbizinfo`は柱3から再利用される。したがって: ①この2クライアントは副作用なし・依存最小のピュアなパッケージに保つ ②インボイスAPIクライアントは本リポジトリに置かない ③破壊的変更時はdecisions.mdに柱3影響を記載。

## 15. 要件↔実装対応の要点

FR-C1/C2→schema-buffer＋normalize-jp出力層／FR-C3・N-7→attribution／FR-C7/C8→actors共通ランナー／N-1・N-4→gov-clients共通HTTP層＋監視／N-3→testing＋CI／N-9→enrich／§7→billing。迷ったらこの対応で配置する。

---
*本書はv1.0。更新は「未決事項の解消」「要件書の改訂」「decisions.mdに蓄積した判断の昇格」の3トリガーで行う。*
