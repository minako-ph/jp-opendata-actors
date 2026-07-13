# 要件追加文書 v1.0 — Actor #7: Japan Business Days & Calendar（calendar-business-days）

作成日: 2026-07-13 ／ 版: v1.0 ／ 保存先: `docs/requirements-calendar-business-days.md`
上位文書: jp-business-api統合の意思決定（2026-07-13・事業主決定） ／ 対文書: `docs/requirements.md` v2.0・`docs/handover.md`・`docs/addendum-v1.1.md`・移植元 `jp-business-api/docs/requirements.md` v1.0

**位置づけ**: 本書は jp-opendata-actors ファミリーに Actor #7 の要件を追加する。既存 `docs/requirements.md` v2.0 の共通原則（FR-C・N系・§7課金枠組み・§8受入基準・§10統廃合規律）を全面継承する。**#7の範囲について既存書と矛盾する場合は本書が優先**。Store掲載文言は `docs/marketing.md` §5（#7分は tasks-phase4「掲載文言」節が正）に従う。

---

## 1. 背景・目的・位置づけ

RapidAPI向けに実装完了済みの jp-business-api（日本の暦・営業日変換API）を、**Actor #7 として本ファミリーへ統合する**（2026-07-13 事業主決定）。

**統合の根拠**: (a) RapidAPIはNokia買収（2024-11）時点でアクティブ利用者数千人・掲載API数百本規模への縮小が報道済みで、買収後の注力は通信キャリア向けネットワークAPI——発見チャネルとして機能する見込みが立たない。(b) Apifyは単月$1Mのクリエイター支払い・前年比5倍の成長チャネルで、payout（Wise）・monorepo共有資産（billing/attribution/testing）・PPE運用の既存レールにそのまま乗る。(c) `allowsAgenticUsers` 適格（PPE・limited permissions・Standby無効）によりMCP/agentic露出が追加工数ゼロで付く。**本統合は収益改善策ではなくチャネル・レール整理であり、期待収益が小さいことを前提に受入れる**（§8）。

**競合状況とポジショニング**: Store競合スキャン（2026-07-13・チャット側Claude）で、Nager.Date系の汎用祝日Actor（100ヶ国以上・日本含む）が**複数実在**することを確認。祝日一覧単体はコモディティである。一方、**和暦の双方向変換（表記ゆれパース含む）と、独自休業日込みの営業日check/add/countを行うActorは不在**。リスティングの主語は「Japan business days ＋ wareki」に置き、祝日はその基礎データとして扱う。買い手仮説: 日本の期日計算を必要とするアプリ開発者、および営業日演算・改元境界を決定論ツールに委譲したいAIエージェント（#1入札Actorの締切→残営業日計算が家族内の代表ワークフロー）。

**設計方針**: 移植元のコア（`src/core/`: date-utils / era / holidays / business-days）は第三者レビュー済み（jp-business-api `docs/review-2026-07-11.md`）・golden固定済みであり、**ロジックを改変せず移植する**。normalize-jpは正典（本リポジトリ）からのsubtree・無改変（jp-business-api `SYNC.md`）のため、monorepoの `@jp-opendata/normalize-jp` を直接importに戻すだけでよい。

## 2. スコープ／非スコープ

**スコープ**: 移植元の8エンドポイントを6つのバッチoperationとして提供する（FR7-1）。日付情報（和暦・祝日・営業日判定・年度・閏年）／和暦文字列→西暦パース／年別祝日一覧／次回祝日／営業日加算／営業日カウント。LLMは使用しない。

**非スコープ（READMEの正直明記対象を含む）**: 六曜・二十四節気等の暦注／企業・法人データ（法人番号・インボイス等は#4・柱3の責務）／利用者企業の独自休業日の推定（`extra_holidays` で受け取るのみ）／1873-01-01より前の日付（グレゴリオ暦採用前）／収録範囲外の祝日判定（明示エラー。推測回答禁止）／HTTPリアルタイムAPIとしての提供（Standby無効を維持。同期利用は Apify `run-sync-get-dataset-items` 経由）。

## 3. 継承する共通要件と#7の適用値

FR-C1〜C8・N-1〜N-9を全面継承する。#7の適用値:

| 共通要件 | #7の適用値 |
|---|---|
| FR-C5 prefill | `operation: date_info`・固定4日付（改元境界 2019-04-30／2019-05-01・振替休日1件・平日1件。**祝日行の実在を実snapshotで確認して確定**）。30秒以内に最初の結果 |
| FR-C6 無料枠 | **50レコード/実行**（コード実装・freeAllowance。#2・#3と同値） |
| FR-C7 実行上限 | 入力項目は全operation合計1,000件/run。移植元の項目単位上限（MAX_ADD_DAYS=5000・MAX_COUNT_PERIOD_DAYS=36525・MAX_EXTRA_HOLIDAYS=100）を継承 |
| FR-C8 部分失敗 | 不正日付・パース不能・収録範囲外は項目単位の `_error` レコードで継続・**非課金**。実行失敗は入力全項目が不正な場合のみ |

## 4. 機能要件（FR7-x）

### FR7-1 operations（入力）

`operation` enum ＋ operation別フィールド。1入力項目=1出力レコード（`holidays` のみ1祝日=1レコード）。

| operation | 主入力 | 対応する移植元エンドポイント |
|---|---|---|
| `date_info` | `dates[]`（ISO） | `/v1/date/{date}` ＋ `/v1/business-days/check` ＋ `/v1/wareki/from-western` を包含 |
| `wareki_to_western` | `wareki_strings[]`（令和8年7月11日／R8.7.11／reiwa 8 等の表記ゆれ対応） | `/v1/wareki/to-western` |
| `holidays` | `years[]` | `/v1/holidays/{year}` |
| `holidays_next` | `from_date`（省略時 today JST） | `/v1/holidays/next` |
| `business_days_add` | `items[]`（`{date, days}`） | `/v1/business-days/add` |
| `business_days_count` | `ranges[]`（`{from, to}`） | `/v1/business-days/count` |

共通オプション（`date_info`・`business_days_*` に適用）: `weekend_days`（既定 土日）／`include_national_holidays`（既定 true）／`extra_holidays[]`（ISO日付・上限100）。非営業日理由の判定順は移植元どおり weekend → national_holiday → extra_holiday。

### FR7-2 レコード仕様（出力）

**スキーマ契約は移植元エンドポイントの返却フィールドとの同値性**（snake_case維持・値の意味を変えない）＋ 家族共通部（FR-C2メタ・`attribution`・`schema_version: "0.1.0"`・`operation`）。代表例（date_info）: `date` / `weekday` / `wareki {era, era_ja, year, is_first_year, formatted_ja}` / `is_holiday` / `holiday_name_ja` / `holiday_name_en` / `is_business_day` / `non_business_reason` / `fiscal_year`（4月始まり） / `is_leap_year` / `notes[]`（未来日の元号注記等）。**本書で新規フィールドを発明しない**——移植時にfixture・移植元goldenと突合して確定し、確定形をREADME出力サンプルに反映する。

### FR7-3 収録範囲の扱い

祝日データの収録範囲（COVERED_FROM/COVERED_TO・実CSVから機械決定）の外に触れる判定・演算は、`include_national_holidays: false` でも一貫して項目単位エラー（移植元FR-10の設計をそのまま継承。「根拠のない値は返さない」）。エラーメッセージに covered_from / covered_to を含める。

## 5. 非機能要件（N7-x）

- **N7-1 決定論・実行時外部依存ゼロ**: 祝日データはビルド時同梱snapshot（`data/syukujitsu-snapshot.csv` → 生成物）のみを根拠とする。**ランタイムでの内閣府CSV取得は行わない**（移植元N-1の継承。CSV URLは2023-02に変更実績があり、実行時依存はファミリーが排除してきた保守要因そのもの。年次更新は手動パイプライン＋golden差分レビュー）。
- **N7-2 snapshot鮮度ガード**: 実行時に `today > COVERED_TO − 90日` の場合、実行サマリに警告を出し `ALERT_WEBHOOK_URL` へ通知する（年次更新の前倒しシグナル。N-4監視枠の適用）。
- **N7-3 性能・原価**: prefillで30秒以内に最初の結果。LLM・プロキシ・外部API呼び出しなし（原価≈コンピュートのみ・マージン96%超）。
- **N7-4 golden**: 6 operation系統＋境界ケース（改元境界2019-04-30/05-01・振替休日・extra_holidays・収録範囲外`_error`・和暦表記ゆれ）を凍結。`holidays_next` のgoldenは `from_date` 明示で決定化。

## 6. 課金（PPE・確定値）

| イベント | 単価 | 備考 |
|---|---|---|
| `apify-actor-start` | $0.02 | 家族標準（合成イベント・削除しない） |
| `record-basic` | **$0.003（確定・2026-07-13チャット側Claude承認）** | **Primary event**。1有効レコード=1課金。根拠: LLM不使用でマージン96%超・祝日一覧には無料代替が存在するため高め始値原則より#3同額の家族内整合を優先 |
| enriched系 | 作らない | LLM不使用 |

課金対象は**有効結果レコードのみ**。`_error` レコードは非課金（FR-C8）。組み込み `apify-default-dataset-item` は削除（家族標準）。無料枠50レコード/実行はコード実装（freeAllowance）。

## 7. 法務・正直明記（CR7-x）

- **CR7-1 出典明記**: 全レコードの `attribution` に「出典：内閣府「国民の祝日」」を含める（政府標準利用規約2.0準拠・FR-C2の枠組み）。READMEに出典節＋内閣府ページへの外部リンク。
- **CR7-2 参考訳の明示**: 祝日英語名は公式英語名が存在しないため**本Actorの参考訳**である旨をREADME・フィールド説明に明記（移植元FR-4の継承）。
- **CR7-3 誇大禁止＋代替の正直明記**: 「唯一」系は使用しない。**祝日一覧だけが必要なら無料の代替（Nager.Date系Actor・オープンデータ）が存在する**事実をREADME「What this does NOT do」節に明記し、本Actorの価値は営業日演算・和暦パース・独自休業日対応にあると正直に位置づける。
- **CR7-4 変更可能性**: 祝日は法改正で変更されうる（五輪振替の前例）。データは公式ソース追従である旨を明記。SLA・稼働率の数値保証は書かない（N-5）。
- **CR7-5 範囲外の扱い**: 1873-01-01より前は非対応・収録範囲外は明示エラー。推測で答えない。

## 8. KPI・統廃合規律の特例（公開前確定）

計測は家族標準どおり（公開日起点・90日で3ヶ月$100粗利を計測）。ただし本Actorは統合の性質（保守≈0・収益期待小をチャネル整理として受入れ済み）を踏まえ、以下を**公開前に**確定する:

1. 3ヶ月$100未達でも「リスティング/価格1回改修→統合・廃止」サイクルを**適用しない**。追加投資なしの凍結・掲載継続とする（取り下げても回収する保守時間が存在しないため）。
2. 退場を検討するのは**保守実績が月0.5時間超を2ヶ月連続**で記録した場合のみ。
3. ファミリー6ヶ月合算$200 KPI（既存6本で判定）の**分母に#7を含めない**（判定を甘くする方向の歪みを避ける）。
4. 本特例は公開前に `decisions.md` へ1行記録する（事後の例外設定を禁止する運用の維持）。

## 9. 移管に伴う処置

1. **RapidAPI公開作業は全面中止**（PayPal口座開設・リスティング作成を含む）。
2. jp-business-api リポジトリは移植期間中**読み取り参照のみ・変更禁止**。#7公開確認後にGitHubアーカイブ（人間タスク）。旧repoのdocs（requirements/marketing/handover）は改訂しない（アーカイブされる文書に投資しない）。
3. jp-business-api のLP（静的HTML）は#7の公開URLへ再ポイント（人間タスク）。
4. Cloudflare Workersの公開デプロイは行わない。x402直接対応は既存方針どおり保険のまま（四半期$0なら何もしない）。

## 10. 受入基準

(a) 7本すべてのbundle生成＋typecheck/lint/format:check/test 全緑・**既存#1〜#6のテスト・goldenは変更ゼロ**
(b) golden 6系統＋境界ケースが事業主レビュー承認済み（自動上書き採用禁止）
(c) prefill実機30秒以内・全レコードに `attribution`／`schema_version` 付与
(d) 課金恒等: 有効レコード数=charge数・`_error` 非課金・無料枠50の実配線をローカル課金ログ（`ACTOR_TEST_PAY_PER_EVENT=1`）で確認
(e) README がマーケ§5.3の7節構成・出力サンプルは実golden由来・CR7-2〜7-5の正直明記を含む
(f) `docs/marketing.md` §5.1/5.2/5.4 に#7行が転記済み（文言は tasks-phase4「掲載文言」節が正）
(g) `docs/decisions.md` に統合決定・単価承認・KPI特例の記録
