# 第三者レビュー 2026-07-13 — Actor #7: calendar-business-days（Phase 4実装）

レビュアー: チャット側Claude ／ 対象commit: `a3d3a92`（feat(calendar-business-days): add Actor #7） ／ 方法: fresh clone（--depth 5）→ 第三者環境で依存インストール→全CI項目実行→**実装前クローン（6650e3b時点）との全ファイルdiff**→移植元 jp-business-api との忠実性照合→golden実データ照合

## 判定: **承認（FIX事項ゼロ）**

## 検証結果（全17項目）

**変更範囲の機械検証（最重要）**
- V-1 ✅ 新旧クローンの `diff -rq`: 変更は ci.yml／.prettierignore／AGENTS.md（＋symlink CLAUDE.md）／ルートREADME／decisions.md／marketing.md／packages/attribution のみ＋新規（actors/calendar-business-days・要件書・tasks-phase4）。**既存#1〜#6のactors/・golden・fixture・他packagesへの変更ゼロ**を機械確認
- V-2 ✅ attribution差分は純追加のみ: `SourceKey` に `cao_holidays` 追加＋文言 `出典：内閣府「国民の祝日」`（CR7-1と一字一句一致）。柱3非参照パッケージ＝再同期不要の主張と整合

**CI・ビルド（第三者環境）**
- V-3 ✅ `pnpm install --frozen-lockfile` → typecheck／lint／format:check 全緑
- V-4 ✅ **test 346件全緑**（38ファイル。既存259＋新規87の主張と一致）。テストに `.only`/`.skip` なし
- V-5 ✅ bundle **7本すべて生成成功**（#7は86KB＝gov-clients/enrich非依存の主張と整合）

**移植の忠実性**
- V-6 ✅ snapshot CSV: 移植元と **md5一致**（733fabb6…）
- V-7 ✅ 生成物 holidays-data.ts: **バイト同一**（b8281a97…。.prettierignore登録も確認）
- V-8 ✅ コア4ファイルdiff: era.ts・holidays.ts は**差分ゼロ**、date-utils.ts・business-days.ts は**prettier改行のみ**（意味的変更なし）。「無改変移植・調整はprettier整形のみ」の主張どおり
- V-9 ✅ normalize-jp: 移植元subtreeと正典の全ファイル差分ゼロ（decisions記録と一致）

**要件適合（FR7/N7/CR7）**
- V-10 ✅ N7-1: src内にランタイムデータ取得なし。main.tsの唯一のfetchは `ALERT_WEBHOOK_URL` へのアラートPOST（N-4パターン・送信失敗でも実行を落とさない実装を目視）＝データ依存ではない
- V-11 ✅ N7-2: `FRESHNESS_GUARD_DAYS=90`・COVERED_TO−90日で警告＋webhook通知・手動パイプラインへの誘導メッセージ実装
- V-12 ✅ 課金: `FREE_RECORDS_PER_RUN=50`（freeAllowance実配線・R2-3/FR-C6コメント付き）／`_error`非課金（FR-C8）／`MAX_ITEMS_PER_RUN=1000`（FR-C7）／charge_limit graceful。ローカル課金ログ検証（58有効中50無料・8課金・範囲外1900非課金）はdecisions記録と整合
- V-13 ✅ input_schema: 6 operations完全一致・prefill=date_info×[2019-04-30, 2019-05-01, 2026-05-06, 2026-07-13]（**2026-05-06はsnapshotに「休日」として実在を確認**）・MCP向けdescriptionに和暦3表記の具体例
- V-14 ✅ actor.json: name `japan-business-days-calendar`・title・descriptionが掲載文言（tasks-phase4の正）と一字一句一致

**golden・同値性（実データ照合）**
- V-15 ✅ prefill golden: 2019-04-30=平成31・休日／2019-05-01=令和元（is_first_year=true）・休日（祝日扱い）＝**施行日境界が正**。2026-07-13=monday・営業日・FY2026（実カレンダーと一致）。全レコードに attribution＋schema_version 0.1.0
- V-16 ✅ 移植元同値性スポット照合: 移植元golden fixtures.json（35件・実在確認）の `/v1/date/2019-05-01` とActor側goldenを**フィールド単位で突合し共有フィールド完全一致**。差分は許容宣言どおり（operation・note・FR-C2メタの追加のみ）。2019年祝日22件も生成データで一致
- V-17 ✅ README: §5.3の7節H2構成・866語・CR7-2（参考訳）/CR7-3（**Nager.Date系無料代替の正直明記あり・良質**）/CR7-4（五輪前例・SLA非約束）/CR7-5（1873下限）すべて実装。誇大表現なし。#1入札とのクロスは**リンクなし太字規約**遵守＋「締切→残営業日」の連続ワークフローを用途例として記載。Pricing節はコンソール設定値（$0.003／start $0.02／無料50）と一致

## 所見（修正不要・情報のみ）

- I-1: 出力の `retrieved_at` は実行時刻であり、snapshot（ビルド時同梱）の鮮度とは意味が異なる。FR-C2共通メタの家族仕様どおりであり、READMEのデータ源節で手動パイプライン更新が明記されているため誤読リスクは低いと判断。対応不要。
- I-2: 完了報告の「気づき」（休日→"Public Holiday"の同名問題）への不対応判断（等価移植維持）は妥当。CSV仕様由来であり、改変はFR7-2の同値性契約に反する。

## 記録依頼（Claude Codeへコピペ可）

```
docs/decisions.mdの先頭に1行追記してpush: 「- 2026-07-13 #7第三者レビュー承認（review-2026-07-13-actor7・対象a3d3a92・FIX事項ゼロ）: 実装前クローンとの全ファイルdiffで既存#1〜#6変更ゼロを機械確認・第三者環境で346テスト/bundle7本/typecheck/lint/format全緑・snapshot md5一致/生成物バイト同一/コアdiff=prettierのみ・移植元golden 2019-05-01をフィールド単位照合し完全一致・prefill 4日付のsnapshot実在確認済み」
```
