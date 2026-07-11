# 要件追加文書 v1.0 — Actor #6: Japan Financial Statements（edinet-financials）

作成日: 2026-07-11 ／ 版: v1.0 ／ 保存先: `docs/requirements-edinet-financials.md`
上位文書: 市場調査レポートv2.0 B-1（2026-07-11確定） ／ 対文書: `docs/requirements.md` v2.0・`docs/handover.md`・`docs/addendum-v1.1.md`

**位置づけ**: 本書は jp-opendata-actors ファミリーに Actor #6 の要件を追加する。既存 `docs/requirements.md` v2.0 の共通原則（FR-C・N系・§7課金枠組み・§8受入基準・§10統廃合規律）を全面継承する。**#6の範囲について既存書と矛盾する場合は本書が優先**。実装設計・検証済み事実は `docs/handover.md`、Store掲載文言は `docs/marketing.md` §5（#6分は追補で追加）に従う。

---

## 1. 背景・目的・位置づけ

XBRL由来の財務諸表（BS/PL/CF主要科目）を正規化した英語財務データとして返すPPE Actorを、既存Actor #1（edinet-filings）の**姉妹Actor**として追加する。v1.0市場調査では独立プロダクト候補だったが、#1と正面衝突するため姉妹Actorとして再定義済み（独立プロダクトとしての復活提案はしない）。別Actorとする理由: (a) PPE単価を#1と独立に設定できる (b) Store内で "Japan financial statements" 系の別キーワード面を取れる (c) 共有packagesの流用で実装は差分のみ。

責務分担: **#1＝書類の発見・提出メタ・ヘッドラインKPI（経営指標等7値）・定性英文サマリの正**。**#6＝財務三表の正規化数値の正**。#1の出力（doc_id）を#6に流し込むパイプラインが主導線。

競合状況: Store競合スキャン（`docs/research/store-scan-edinet.md`・2026-07-07）で、財務諸表の数値そのものを構造化して返す日本特化Actorは**不在**を確認済み。買い手は日本語有報を読めない海外投資家・アナリスト・データチーム（ポートフォリオ中最強の長期モート候補）。

## 2. スコープ／非スコープ

**スコープ**: 有価証券報告書（docTypeCode 120。訂正130は明示指定時のみ）のCSV出力（type=5）に含まれる財務三表ファクトから、BS/PL/CFの主要科目を正規化して返す。当期＋前期（FR6-5）。LLMは使用しない。

**非スコープ（READMEの正直明記対象を含む）**: 半期報告書160（中間財務諸表の要素体系が別。v2拡張候補）／XBRLパッケージ（type=1）のフルパース／注記・セグメント別数値・1株当たり情報／四半期報告書（制度廃止済み）／LLMによる科目マッピングのフォールバック（v2方針としてのみ§4 FR6-7に明記）／#1が提供する定性サマリ（enriched）——#6にenriched層は設けない。

## 3. 継承する共通要件と#6の適用値

FR-C1〜C8・N-1〜N-9を全面継承する。#6の適用値:

| 共通要件 | #6の適用値 |
|---|---|
| FR-C5 prefill | 実在docID 2〜3件（JGAAP個別＋IFRS連結の両系を示す組合せ）で30秒以内に最初の結果 |
| FR-C6 無料枠 | **3書類/実行**（コード実装・freeAllowance。仮置き、公開前に事業主確定） |
| FR-C7 実行上限 | doc_ids指定は500件/run。日付範囲経路は一覧走査31日まで＋マッチ書類500件まで（#1と同一） |
| FR-C8 部分失敗 | 1書類の失敗は`_error`行で継続・非課金。実行失敗は認証エラーまたは失敗率50%超 |

## 4. 機能要件（FR6-x）

### FR6-1 入力

- `doc_ids[]`（**主経路**。#1の出力`doc_id`をそのまま渡せる）、または `date_from`/`date_to`（＋任意の`edinet_codes[]`/`sec_codes[]`）。いずれか必須。両方指定時はdoc_idsを優先。
- 日付範囲経路の対象書類は120固定。`include_amendments`(bool)で130を追加。
- 注記: 上位文書B-1の「入力は証券コード/EDINETコード」は、EDINET API v2に企業指定の書類検索が存在しない実態（一覧は日単位のみ）を踏まえ本形へ具体化した（リポジトリ実態が正の原則。decisions.mdに記録）。

### FR6-2 データ源と取得

- 財務値のソースは書類取得API type=5（CSV zip）のみ。doc_ids経路では一覧APIを呼ばない（1書類=1リクエスト）。
- 日付範囲経路は一覧API（type=2）を書類発見にのみ使用する。

### FR6-3 レコード共通部（メタ）

1書類=1レコード。取得経路によらず同一スキーマとし、以下を含む: `doc_id` / `edinet_code` / `sec_code` / `filer_name_ja` / `filer_name_en` / `period_start` / `period_end` / `accounting_standard`（FR6-6） / `basis`（FR6-6） / FR-C2共通メタ。

- `filer_name_en` はデータ源に公式英名が存在する場合のみ（method相当: api_native）、無ければnull。
- メタの導出元（CSV内DEI系要素か一覧APIか）は実fixtureでの実在確認を経て実装が確定し、doc_ids経路で取得不能な項目はnull（推測補完禁止）。

### FR6-4 出力: 財務三表（当期）

`balance_sheet` / `income_statement` / `cash_flow` の3オブジェクト。**以下のフィールド集合がv1のスキーマ契約**。全て円生値のnumber（単位正規化: 円/千円/百万円→JPY生値。#1と同一規約）。書類・会計基準・様式により取れない項目は**null**（FR6-7）。

**balance_sheet（時点値）**

| フィールド | 科目 | 備考 |
|---|---|---|
| cash_and_deposits | 現金及び預金 | IFRSは現金及び現金同等物 |
| current_assets | 流動資産 | |
| property_plant_and_equipment | 有形固定資産 | |
| intangible_assets | 無形固定資産 | |
| investments_and_other_assets | 投資その他の資産 | JGAAPのみ。IFRSはnull |
| non_current_assets | 固定資産（非流動資産） | |
| total_assets | 資産合計 | |
| current_liabilities | 流動負債 | |
| non_current_liabilities | 固定負債（非流動負債） | |
| total_liabilities | 負債合計 | |
| share_capital | 資本金 | |
| retained_earnings | 利益剰余金 | |
| equity_attributable_to_owners_of_parent | 親会社の所有者（株主）に帰属する持分 | 連結のみ |
| net_assets | 純資産（資本）合計 | |

**income_statement（期間値）**

| フィールド | 科目 | 備考 |
|---|---|---|
| net_sales | 売上高 | IFRSの売上収益・営業収益系を候補で吸収 |
| cost_of_sales | 売上原価 | |
| gross_profit | 売上総利益 | |
| selling_general_and_administrative_expenses | 販売費及び一般管理費 | |
| operating_income | 営業利益 | |
| ordinary_income | 経常利益 | JGAAPのみ。IFRSはnull |
| income_before_income_taxes | 税引前当期純利益 | |
| income_taxes | 法人税等 | |
| net_income | 当期純利益 | |
| net_income_attributable_to_owners_of_parent | 親会社株主（所有者）に帰属する当期純利益 | 連結のみ |

**cash_flow（期間値・期末残高）**

| フィールド | 科目 | 備考 |
|---|---|---|
| net_cash_provided_by_operating_activities | 営業活動によるキャッシュ・フロー | |
| net_cash_provided_by_investing_activities | 投資活動によるキャッシュ・フロー | |
| net_cash_provided_by_financing_activities | 財務活動によるキャッシュ・フロー | |
| cash_and_cash_equivalents_end | 現金及び現金同等物の期末残高 | |

### FR6-5 前期値（should）

同一CSV内の前期コンテキスト（Prior1Year系）から、FR6-4と同一フィールド構成の `prior_year` オブジェクト（3表）を併記する。前期値は「当期報告書に記載された前期値（遡及修正後）」である旨をREADMEに明記する。**実装が週末ゲート（受入基準＋golden全緑）を脅かす場合に限りv1.1へ後送可**——後送時はdecisions.mdに1行記録し、READMEには予告を書かない（約束しない）。

### FR6-6 基礎と会計基準の判定

- `basis`: consolidated / non_consolidated。判定は当期contextIdの**完全一致**（#1 financials.tsで実証済みの方式）。連結値が1つでもあれば連結のみ、無ければ個別のみを採用し、基礎の混在を禁止する。
- `accounting_standard`: "jgaap" | "ifrs" | null。採用した本表要素のタクソノミ系（jppfs系→jgaap／jpigp系→ifrs）またはデータ源の会計基準表記から決定的に導出する。判定不能（US GAAP等）はnull＋READMEカバレッジ注記。

### FR6-7 マッピング規律（本Actorの品質核）

1. 科目マッピングは**決定的な候補リスト方式のみ**（#1 financials.tsと同型: フィールドごとに優先順の要素ID候補、最初に値が取れた候補を採用）。
2. 候補IDは**実fixtureで実在確認できた要素のみ登録**する（推測登録禁止。elementId推測禁止の既存教訓の適用）。
3. **v1はLLMを一切使用しない**。「根拠のない値は返さない」——財務数値でこれを破ると信頼が即死するため、マッピング外・未知様式・単位不明はすべてnullに落とす（安全側）。
4. 将来方針（v2・本書では方針のみ）: LLMは非標準・注記系科目のフォールバックに限定し、導入時は別イベント（enriched系）とする。basic経路にLLMを混入させない（R2-10と同思想）。

### FR6-8 検算可能性

- 非nullの各財務値について、採用した要素IDを `element_map` で併記する（例: `"balance_sheet.total_assets": "jppfs_cor:Assets"`）。利用者・エージェントが出所を機械検証できること（柱1の逐語エビデンス思想の決定的マッピング版）。
- マッピング成立状況を機械可読で併記する（例: `coverage: { mapped_fields: N, target_fields: 28 }`。当期基準）。

### FR6-9 正直明記（README。FR-C4の#6適用）

①type=5 CSVに含まれるファクトの範囲であり、XBRLパッケージのフルパースではない ②業種別特殊様式（銀行・証券・保険等）は主要項目がnullになりうる（判明済みカバレッジを表で明記） ③ファンド開示は対象外の値（null）になる ④半期報告書は未対応（v1） ⑤前期値は当期報告書記載の遡及修正後の値 ⑥投資助言ではない。

### FR6-10 #1との責務分担・相互参照

- #6 README第1段落に「書類の発見・メタ・要約は#1、三表の正規化数値は本Actor」の分担と、#1→#6のdoc_idパイプ手順を明記する。
- #1側READMEの `More Japan data Actors` 節へ#6リンクを追記する（#1再pushは既存の#3起因の再pushとバッチ化。人間タスク）。
- 両READMEで相互に価格の重複購入を招かない説明とする（#1のfinancials 7値と#6の三表は別物であることを明記）。

## 5. 非機能要件（継承＋#6固有）

- N-1〜N-9を継承。#6はLLM不使用のためN-9①（逐語照合）は非適用だが、N-9②（原文に無い項目はnull・推測禁止）を**決定的マッピングの登録規律として適用**する（FR6-7）。N-2（LLM原価再計測）は対象イベントなし。
- **N6-1 golden 2系統以上**: JGAAP個別・IFRS連結の2系統以上の実応答fixtureに対するgolden回帰をCI必須とする（N-3の適用形）。fixtureは本表行を含む形で採取する（既存trimmed fixtureは本表行を含まないため再採取が前提）。
- **N6-2 element_map整合テスト**: golden内の全非null値について、element_mapの要素IDがfixture CSV内に実在し値が一致することを機械検証する。

## 6. 課金要件（PPE）

既存§7の枠組み（pay-per-event・取り分80%）を継承。#6のイベントカタログは公開前に確定（R2-8）:

| イベント | 単価 | 対象 |
|---|---|---|
| apify-actor-start（合成） | $0.02 | R2-5準拠・primary event=record-basic |
| record-basic | **$0.03（仮置き）** | 1社×1書類=1レコード。前期値を含んでも1課金 |

- enriched系イベントは設けない（v1）。LLM原価ゼロのためマージン85%制約（R2-2）は非適用。単価はvalue-based（#1 basic $0.005とenriched $0.079の間・競合不在面）で、**最終確定は公開時のコンソール設定＝人間タスク**。
- 無料枠: record-basicの最初の3件/実行（FR-C6適用値。README Pricing節・入力スキーマに事前明記）。

## 7. 受入基準（公開条件。既存§8の読み替え＋#6固有）

1. FR-C1〜C8（§3適用値）およびFR6-1〜FR6-10を満たす（FR6-5は後送時、decisions.md記録があれば充足扱い）。
2. N6-1のgolden（2系統以上）とN6-2の整合テストがCIでgreen。CIに#6のbundle生成ステップが追加されている。
3. README: マーケ§5.3の7節構成＋FR6-9の正直明記＋出典文言（出典：金融庁 EDINET）＋問い合わせ窓口。
4. PPEイベント・無料枠が§6どおり（単価は仮置きのまま人間タスクへ引き渡し可）。
5. 入力スキーマ: prefill付き（FR-C5適用値）・説明は英語・必須最小。
6. 公開直前のStore競合スキャン再確認（"japan financial statements" 系キーワード）と差別化文言の反映。

## 8. KPI・統廃合基準（既存§10へ#6を追加）

| 対象 | 閾値 | 未達時アクション |
|---|---|---|
| #6（公開後3ヶ月） | 粗利$100/月 | リスティング/価格の改修1回のみ→なお未達で**凍結（既定）**。#1が好調な場合に限り「#1へのオプション統合」を検討肢とする（独立単価の利点が消えるため既定にしない） |
| ファミリー合算（6ヶ月$200） | #6も算入 | 既存§10どおり |
| 保守 | 月1h以内 | 2ヶ月連続超過で統廃合起票（N-5） |

## 9. リリース位置づけ

既存Phase 1〜4とは独立の**週末トラック**。公開ゲートは受入基準のみ（EDINETキー取得済み・外部承認ゲートなし）。制約: **既存5本の週明けコンソール作業（#1〜#5）を#6がブロックしない**。優先順位: 柱1 ＞ 既存Actorの出荷残作業 ＞ #6。週末ゴールは「実装＋golden回帰グリーン、残りは人間手作業（apify push・Store公開・PPE単価設定）のみ」。

## 10. 未決事項

1. record-basic単価（$0.03仮置き）と無料枠（3書類/実行）の最終確定——公開時のコンソール設定・人間タスク。
2. 業種別特殊様式（銀行・証券・保険等）のカバレッジ実態——fixture拡充で判明した範囲をREADMEカバレッジ表へ反映。
3. 半期報告書160対応の要否——v2判断（中間財務諸表の要素体系の実データ確認が前提）。
4. レコードメタの導出元（CSV内DEI系要素の実在有無）——実装Step 0のfixture再採取で確定（FR6-3）。

---
*改訂トリガー: 未決事項の解消、§8のKPI抵触、既存requirements.mdの改訂。本書の確定内容は次回の要件書全面改訂時に本体へ統合（昇格）する。*
