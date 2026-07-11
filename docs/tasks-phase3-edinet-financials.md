# Phase 3 実行指示書 — Actor #6: edinet-financials（Japan Financial Statements）実装（2026-07-11）

保存先: `docs/tasks-phase3-edinet-financials.md` ／ 実施者: Claude Code ／ 実施順: Step 0 → 1 → 2 → 3 → 4 → 5 → 6
目的: 要件追加文書v1.0を満たすActor #6を実装し、「実装＋golden回帰グリーン、残りは人間手作業（apify push・Store公開・PPE単価設定）のみ」の状態にする。
参照の正: 本書 → `docs/requirements-edinet-financials.md`（FR6-x/N6-x。#6範囲の正） → 既存 `docs/requirements.md`（FR-C/N系）／`docs/addendum-v1.1.md`（R2-*）／`docs/handover.md` §13。矛盾時はこの順で優先。

---

## Step 0: 前提確認

- [ ] mainがCI緑（`pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`）を着手前に確認。参考: 2026-07-11に第三者環境でclone→install→236テスト全緑を検証済み。
- [ ] `docs/requirements-edinet-financials.md` が配置済みであることを確認（無ければ中断して事業主へ報告）。
- [ ] `EDINET_API_KEY` がローカル `.env` に設定済みであることを確認（Step 1のライブ採取で必要。未設定なら中断して事業主へ報告）。

## Step 1: fixture再採取（財務諸表本表行を含む形へ）

既存trimmed fixtureは本表行（jppfs/jpigp）を含まない（当期の経営指標等＋jppfs営業利益＋TextBlockのみ）。#6のマッピング確定とN6-2整合検証のため再採取する。

1. [ ] `actors/edinet-filings/scripts/live-verify.ts` を拡張するか#6用スクリプトを新設し、以下3書類のtype=5 CSVを採取（1req/秒直列）:
   - S100YIZC（山口放送・JGAAP個別）／S100YNCJ（MS&AD・IFRS連結の保険持株）: 既存fixtureの原本を再取得
   - 追加1件: **連結JGAAPの一般事業会社**（証券コードあり・非ファンド・docType 120）を2026-06-30前後の一覧から選定。選定理由をresearch文書に記録。
2. [ ] トリミング規律: **jppfs_cor / jpigp_cor の全行＋DEI系（jpdei等）の全行＋既存保持行（経営指標等・TextBlock）を残し、その他を削除**。行削除のみで値の改変禁止・キー混入禁止。当期＋前期（Prior1Year系）コンテキストの本表行が残っていることを確認。
3. [ ] 配置は「既存fixtureの同名差し替え」を基本とし、**#1のテスト・goldenが変更ゼロで緑のまま**であることを確認。差分が出る場合のみ#6専用の別名fixtureに切り替える（判断をdecisions.mdに1行）。`fixtures/edinet/README.md` を更新。
4. [ ] **DEI系メタの実在確認（要件 未決#4の解消）**: CSV内にEDINETコード・証券コード・提出者名（日/英）・会計基準・当期開始/終了日に相当するDEI要素が存在するかを実データで確認する。
   - 存在すればFR6-3のメタは**CSV由来（経路非依存）で確定**。DEI行が `jpcrp*.csv` 以外のファイル（jpdei*等）にある場合は `parseEdinetCsvZip` の対象パターンを拡張する（gov-clients変更→完了報告に柱3再同期の要否を明記。edinetは柱3未使用のため「不要」の明記で可）。
   - CSVに無い項目は「日付範囲経路=一覧API由来／doc_ids経路=null」で確定し、READMEに正直明記。
5. [ ] 様式判定手段の確認: `jpcrp*` CSVファイル名（`-asr-` 等）またはDEI要素から「有報かどうか」を判定できるかを実データで確認（Step 3-6の安全弁の根拠。**確認できない判定ロジックを推測で書かない**）。
6. [ ] 調査結果を `docs/research/edinet-financial-statements.md` に記録: 本表行の実在コンテキスト一覧／DEI確認結果／様式判定手段／追加fixture選定理由。

## Step 2: 要素IDマッピング表の確定（実データのみ）

1. [ ] fixture 3系統のjppfs/jpigp行を科目名で突合し、要件FR6-4の28フィールドそれぞれに**優先順の候補要素ID**を確定する（#1 `financials.ts` のFIELD_SPECSと同型の候補リスト方式）。**fixtureで実在確認できないIDは登録しない**（推測登録禁止＝FR6-7-2）。
2. [ ] 実在確認できず候補ゼロのフィールドは**null固定**とし、READMEカバレッジ表の「未対応」とresearch文書に記録（スキーマからは落とさない）。
3. [ ] 保険（S100YNCJ）のPL系が特殊様式によりnullになる場合はそれで正（安全側）。無理に拾わない。
4. [ ] マッピング表全体（フィールド→候補ID列・系統別の取得可否）をresearch文書に転記（第三者レビューの照合対象）。

## Step 3: Actor実装（`actors/edinet-financials` 新規）

構成・型は#1を完全踏襲: RunDeps注入のApify非依存コア／billing（freeAllowance・ChargeResult graceful）・attribution・gov-clients/monitoring共用／esbuild単一bundle＋createRequireバナー。

1. [ ] 雛形: `.actor/actor.json`（name `japan-edinet-financials`・title `Japan Financial Statements (EDINET Official)`・descriptionは本書「掲載文言」節の通常説明文）／`input_schema.json`／Dockerfile／`package.json`（`@jp-opendata/actor-edinet-financials`）／`package.docker.json`。**enrichパッケージへの依存を追加しない**（LLM不使用）。
2. [ ] 入力（FR6-1）: `doc_ids[]`（主経路）／`date_from`+`date_to`＋任意の`edinet_codes[]`/`sec_codes[]`（副経路・対象書類は120固定＋`include_amendments`で130）。いずれか必須・両方指定時はdoc_ids優先。prefillはfixture採取済みdocIDからJGAAP＋IFRSの両系を示す2〜3件（30秒以内に最初の結果）。
3. [ ] `src/statements.ts`: `extractStatements(rows)` — 当期＋前期のcontextId**完全一致**表（#1のCONTEXT_BASISの拡張形: CurrentYear/Prior1Year × Duration/Instant × 連結/個別）、Step 2の候補リスト、単位正規化（円/千円/百万円→JPY生値・#1と同一）、**連結優先・基礎混在禁止**、`element_map`と`coverage`の生成（FR6-8）。
4. [ ] `src/transform.ts`: FR6-3メタ（Step 1-4の確定に従う）＋FR-C2共通メタ＋`schema_version: "0.1.0"`。`source_url`は書類取得の公開URL（キーなし・経路非依存）。
5. [ ] `src/run.ts`: FR-C7（doc_ids 500件／日付範囲は31日＋マッチ500書類）・FR-C8（`_error`行で継続・非課金。認証エラー/失敗率50%超で実行失敗）・R2-6 graceful終了・`billing.charge('record-basic')`×freeAllowance 3件/実行。**前期値（FR6-5）を含めて実装する**——実装が週末ゲートを脅かす場合のみ`prior_year`を後送しdecisions.mdに1行（READMEに予告は書かない）。
6. [ ] 非有報docIDの安全弁: Step 1-5で確認した判定手段で有報以外と判定できる場合は `_error`（非課金）でスキップ。判定手段が確認できなかった場合は全null＋coverage 0で出力し、READMEに「doc_idsは有価証券報告書のdocIDを渡すこと」を明記＋TODOコメント。
7. [ ] `scripts/live-e2e.ts`: prefill入力での実機確認（30秒以内に最初の結果・課金ログは `ACTOR_TEST_PAY_PER_EVENT=1`）。

## Step 4: テスト・golden

1. [ ] unit: statements抽出（JGAAP/IFRS両系・前期値含む）／単位正規化／基礎混在禁止／非対象様式・空CSV・CSVなし書類。
2. [ ] golden: fixture 3系統に対する `run.*.json`（doc_ids経路で決定的に生成）。**候補生成は`GOLDEN_UPDATE=1`、diffは自動コミットせず要約を報告して事業主レビューを仰ぐ**。
3. [ ] N6-2整合テスト: golden内の全非null財務値について、`element_map`の要素IDがfixture CSV内に実在し値が一致することを機械検証。
4. [ ] 既存#1〜#5の全テスト・goldenが**変更ゼロ**で緑（特に#1: fixture差し替えの影響確認）。

## Step 5: README・掲載文言・CI

1. [ ] README: マーケ§5.3の7節構成・300語以上・実golden由来の出力サンプルJSON・FR6-9の正直明記6点・#1相互参照（第1段落: 書類の発見とメタ・サマリは#1、そのdoc_idsを本Actorへ——重複購入を招かない説明）・Pricing（$0.03仮置き・無料枠3件/実行）・出典「出典：金融庁 EDINET」・Contact（48h一次返信）。
2. [ ] `docs/marketing.md` 更新: §5.1表・§5.2確定文言リスト・§5.4キーワードマップに#6行を追加（**文言は本書「掲載文言」節が正。一字一句そのまま転記**）。
3. [ ] #1のREADME `More Japan data Actors` 節に#6へのリンクを追記（#1の再pushは人間タスク）。
4. [ ] `.github/workflows/ci.yml` に `pnpm --filter @jp-opendata/actor-edinet-financials build` を追加。

## Step 6: 記録・完了報告

1. [ ] `docs/decisions.md` に記録（1行/件・新しいものを上）: ①入力設計の具体化（上位文書B-1の企業コード入力→doc_ids主経路＋日付範囲副経路。EDINET API v2に企業指定検索が存在しないため。FR6-1） ②fixture配置方式とDEI確認結果（未決#4解消） ③マッピング確定サマリ（成立フィールド数/28・系統別） ④前期値の実装有無 ⑤単価$0.03・無料枠3は仮置き（確定は人間タスク）。
2. [ ] コミット例: `feat(edinet-financials): add Actor #6 — normalized BS/PL/CF from EDINET filings (FR6)`
3. [ ] 完了報告に必ず含める: golden diff要約（3系統）／カバレッジ実績（系統別 mapped/28）／柱3再同期の要否／**「残り（人間タスク）」節**（apify push・PPE設定・単価確定・Store公開・#1再push。Notionのチェックリストと対応）。

## 完了条件（全体）

typecheck／lint／format:check／test（既存全Actor含む）／bundle生成**6本すべて**が緑。golden差分は自動採用せず要約を報告。research＋decisions記録。完了報告に「残り（人間タスク）」節。

## 掲載文言（この節が#6掲載コピーの正。marketing.md §5へそのまま転記）

- Store名（通常）: `Japan Financial Statements (EDINET Official)` ／ スラッグ: `japan-edinet-financials`
- SEO名（Google向け）: `Japan Financial Statements API — BS, P&L & Cash Flow in English (EDINET)`
- 通常説明文（actor.json description兼用）: `Normalized balance sheet, P&L and cash-flow figures of Japanese listed companies from the official EDINET API. English JSON with source element IDs.`
- SEO説明文: `Japan financial statements API in English. Normalized balance sheet, income statement & cash flow of Japanese listed companies from official EDINET annual reports. JSON output, no scraping.`
- タグ候補: japan, edinet, financial-statements, balance-sheet, fundamentals, official-api（公開時の現行タグ体系で確定） ／ 推奨カテゴリ: Finance／Business
- §5.4キーワード: japan financial statements / japanese company financials api / edinet xbrl english / japan balance sheet data / japan fundamentals api

## やらないこと（絶対規則の再掲＋本フェーズ固有）

LLM使用・enrich依存の追加（v1はLLM完全不使用。FR6-7）／XBRLパッケージ（type=1）のパース／半期報告書160対応／全上場企業の一括巡回・インデックス構築機能／goldenの自動上書き／#1既存テスト・goldenの破壊的変更／単価・課金イベント名の独断変更（$0.03は仮置きとしてREADME記載可・確定はコンソール＝人間）／apify push・Store公開操作（人間の作業）／Batch API／誇大コピー（"the only"等）／READMEへの未実装機能の予告（後送時のcoming soon禁止）。
