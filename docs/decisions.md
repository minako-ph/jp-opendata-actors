# decisions.md — 実装中の判断ログ（1行/件、新しいものを上に）

- 2026-07-15 #4公開前 競合スキャン（NexGenData/jungle_synthesizer=gBizINFO scraper系）反映。README第1段落を『not a scraper・name resolution・per-field golden』の3差別化で強化（review-2026-07-15-actor4-readme FIX-1）

- 2026-07-14 #3公開（japan-real-estate-prices）: record-basic $0.003（Primary）・actor-start $0.02・無料枠50/run・enrichedイベントなし（LLM不使用）で確定。Categories=Real estate+Developer tools+Agents。公開URL=apify.com/minako-ph/japan-real-estate-prices。公開日=2026-07-14（90日KPI起点=2026-10-12）
- 2026-07-14 #1公開（japan-edinet-filings）: record-basic $0.005（Primary）・record-enriched $0.079・actor-start $0.02・無料枠3書類/runで確定。Store公開URL=apify.com/minako-ph/japan-edinet-filings。公開日=2026-07-14（90日KPI起点=2026-10-12）。.actorignore（!dist/）で全7Actorのpush時dist除外問題を解決済み

- 2026-07-13 apify push が .gitignore の dist/ を除外しビルド失敗 → 全7Actorに .actorignore（!dist/）追加で解決（Apify CLI公式の force-include 方式）。第三者レビュー実証済み

- 2026-07-13 #7第三者レビュー承認（review-2026-07-13-actor7・対象a3d3a92・FIX事項ゼロ）: 実装前クローンとの全ファイルdiffで既存#1〜#6変更ゼロを機械確認・第三者環境で346テスト/bundle7本/typecheck/lint/format全緑・snapshot md5一致/生成物バイト同一/コアdiff=prettierのみ・移植元golden 2019-05-01をフィールド単位照合し完全一致・prefill 4日付のsnapshot実在確認済み

- 2026-07-13 #7移植元goldenとの同値性確認: 移植元 jp-business-api の golden fixtures.json **全35件を機械照合し diffs=0**（照合スクリプトで各エンドポイント期待値↔Actor変換結果を突合。許容差分=FR-C2共通メタ・`operation`追加・エラーのHTTP形式→`_error`レコード化・収録範囲外メッセージ末尾のルート誘導文をoperation名へ置換のみ）。なお `date_info` は移植元 /v1/date に /wareki/from-western の `note`（未来日の元号注記）を追加包含（要件書FR7-1の包含関係どおり。フィールド名は移植元 from-western の `note` を踏襲＝新規フィールド発明なし）
- 2026-07-13 #7 normalize-jp差分ゼロ確認: 移植元 `packages/normalize-jp/src` と本リポジトリ正典を全ファイルdiffし**内容同一**（SYNC.md読み取り専用規律どおり）。柱3再同期は不要（normalize-jp・gov-clients無変更。attributionに `cao_holidays` キーを追加したが柱3非参照パッケージ）
- 2026-07-13 #7 KPI特例を公開前に確定（要件書§8の4点）: ①3ヶ月$100未達でも改修→統廃合サイクルを適用せず凍結・掲載継続 ②退場検討は保守実績が月0.5時間超×2ヶ月連続の場合のみ ③ファミリー6ヶ月合算$200 KPIの分母に#7を含めない ④本行をもって公開前記録とする
- 2026-07-13 #7課金確定: `record-basic` **$0.003**・無料枠**50レコード/実行**（コード実装freeAllowance）・`apify-actor-start` $0.02（2026-07-13チャット側Claude承認。LLM不使用でマージン96%超・祝日一覧に無料代替が存在するため高め始値原則より#3同額の家族内整合を優先）。課金は有効レコードのみ・`_error`非課金。ローカル実機確認=`ACTOR_TEST_PAY_PER_EVENT=1`＋`ACTOR_USE_CHARGING_LOG_DATASET=1`でholidays 4年分（2024/2025/2026＋範囲外1900）実行→dataset 59行（有効58＋`_error`1）・charging_logに`record-basic chargedCount=1`×8のみ・summary `records_pushed=58 / free_used=50 / records_charged=8`（**freeAllowance=50の実配線を確認**・1900年は非課金`_error`）
- 2026-07-13 #7統合決定: jp-business-api（日本の暦・営業日API・実装完了済み）を**Actor #7 japan-business-days-calendarとして本ファミリーへ統合**し、RapidAPI公開は全面中止（Nokia買収後の市場縮小・チャネル整理として。収益改善策でなくレール整理であり期待収益小を受容済み。詳細は要件追加文書 docs/requirements-calendar-business-days.md §1・§9）。コアは無改変移植（ロジック・定数・判定順・エラーメッセージ不変＝移植テスト71件全緑で担保）・移植元リポジトリは変更ゼロ（アーカイブは公開確認後の人間タスク）

- 2026-07-12 最終監査FIX-3〜5適用（review-2026-07-12-final-audit.md）: ①FIX-3=ルートREADMEの「5本」2箇所を6本へ（requirements/handoverの5本前提は追補パターンで次回全面改訂まで据え置き）②FIX-4=AGENTS.md読み順に#6要件書の1行追加（CLAUDE.mdはsymlinkのため同時反映）③FIX-5=**#6課金ログのローカル実機確認**＝`ACTOR_TEST_PAY_PER_EVENT=1`＋`ACTOR_USE_CHARGING_LOG_DATASET=1`で5書類（有報4＋半期1）実行→charging_logに`record-basic chargedCount=1`のみ・summary `records_pushed=4 / records_charged=1 / free_used=3`（**freeAllowance=3の実配線を確認**・ログと一致）・非有報S100YNG2は`_error`行で**非課金**スキップ（skipped_non_annual=1。**半期報告書のDocumentTypeDEI=「第五号様式」を実データで確認**＝安全弁の判定値が実証に格上げ）。golden/fixture変更ゼロ

- 2026-07-11 レビューFIX-1/2適用（review-2026-07-11-actor6.md）: ①#6 READMEの#1相互リンク2箇所をリンクなし太字へ（未公開Actorへの言及はリンクなし規約。実URL化は両Actor公開後の人間タスク＝Notion A6）②live-e2e.tsに`--from/--to/--max`を追加し**date_range副経路を実機疎通**（2026-06-30単日・maxDocuments=5上書き: days_scanned=1・documents_planned=5(documents_truncated=true)・records_pushed=5・エラー0・非有報スキップ0・最初の結果1,430ms/全体5.9s。S100YN9EはStep 6のdoc_ids経路golden値と一致を確認）
- 2026-07-11 #6の新規golden `run.doc-ids.json`（fixture4系統・N6-2で192値を機械検証）を第三者レビューで承認（review-2026-07-11-actor6.md・対象コミット5ce0e35。既存#1〜#5のgolden/fixture/テストへの変更ゼロ）

- 2026-07-11 #6実装（edinet-financials・週末トラック・FR6）: ①**FR6-1入力の具体化**＝doc_ids主経路（#1のdoc_idをそのまま受ける・一覧API非使用）＋日付範囲副経路（120固定＋include_amendmentsで130・**ファンドは除外**=FR6-9③。上位文書B-1の「企業コード入力」はEDINET API v2に企業指定の書類検索が存在しないため本形へ具体化）②**fixture配置は#6専用別名** `*.csv.statements.zip` 4系統（S100YIZC山口放送=JGAAP個別/S100YN9Eネポン=JGAAP連結/S100YN95コンヴァノ=IFRS標準/S100YNCJ MS&AD=IFRS保険）——同名差し替えは#1のunitテスト（fixture行順前提）を壊すことを実測し#1側は完全無変更。指示書の3書類に**S100YN95を追加**（保険のS100YNCJだけではIFRS標準本表要素=売上収益・流動/非流動区分の実在確認ができず、FR6-7-2の推測登録禁止の下でIFRS候補が登録不能になるため）③**未決#4解消＝DEI系はjpcrp*.csv内に実在**（27行: EDINETコード・証券コード・提出者名日/英・会計基準・当期開始/終了・DocumentType等）→FR6-3メタは全項目CSV由来・経路非依存・parseEdinetCsvZip拡張不要（gov-clients無変更）④**マッピング確定=28フィールド全てに実在候補あり**・系統別カバレッジ: JGAAP個別26/JGAAP連結27/IFRS標準26/IFRS保険17（保険のPL上段・無区分BSはnull=安全側。jpigp_cor:NonCurrentLabilitiesIFRSはタクソノミ側の綴りで実在確認済み。セグメント注記のRevenue2IFRSは本表PL行でないため不採用）⑤**前期値FR6-5は実装済み・後送なし**（同一CSVのPrior1Year文脈・element_mapにprior_year.*キーも併記）⑥非有報安全弁=DocumentTypeDEI（有報=「第三号様式」を実データ確認）≠第三号様式は_error非課金スキップ・DEI無しは全null＋coverage 0で出力⑦N6-2整合テスト=golden×fixtureの**192値の機械検証**をCIに追加⑧単価$0.03・無料枠3書類/実行は仮置き（**最終確定はコンソール＝人間タスク**）。E2E実測: prefill 2書類で最初の結果414ms・全体3.1s。詳細: docs/research/edinet-financial-statements.md

- 2026-07-10 HOUJIN_APP_ID到着に伴う解放実装: ①**未決#3を実データで最終解消**＝/4/nameは法人格を除いた名称に一致（法人格込みクエリは0件・会社系/法人系とも）・**全角のみ受付**（半角英数はHTTP 400エラー101）・target=1/2は文字水準差のみで名称全体の完全一致ではない→resolveCompanyNameを必要最小調整（クエリの法人格除去＝CORPORATE_SUFFIXES表＋全角化、完全一致判定は入力の法人格有無で登記名全体/除去名を使い分け。確度4値の設計は不変。実測: 日立製作所→exact 7010001008844／トヨタ→ambiguous 631候補）②**アプリケーションIDは英数字13桁**（「数字13桁」の旧仮定は誤り・実IDで判明）→HoujinClientバリデーション修正③#4のgBizINFO未収載（404/空プロフィール）は**houjin /4/numフォールバック**＝基本3情報のみ・gBiz由来フィールドnull・source=houjin・**record-basic課金**（レジストリにも無い/houjin未設定は従来の非課金_error行）。実応答fixture num.7010001008844.2026-07-10.xml で回帰・既存golden変更ゼロ④#2 company_namesのTEMPORARILY UNAVAILABLE注記を除去（8127e71巻き戻し）⑤なお実在法人でのgBiz 404は現時点で再現不可（新設前日分まで収録済みを実証）→フォールバック発動は実運用では稀。**柱3影響: gov-clients/houjin（client.ts/resolve.ts）に変更・fixture追加→柱3のsubtree再syncが必要**。詳細: docs/research/houjin-name-search.md

- 2026-07-10 #2のREADME「What this does NOT do」とinput_schemaのcompany_names説明に「HOUJIN_APP_ID到着まで一時的に利用不可・corporate_numbersを使用」の正直明記を追加（FR-C4。実行時エラーは実装済み。**ID到着後に両方を除去**——READMEのTODOコメント参照）
- 2026-07-10 Phase 2の新規golden 3ファイル（#2 run.hitachi.json／#4 run.hitachi.json／#5 run.appi-first5.json）を事業主がdiffレビューし承認（既存golden #1/#3への変更はゼロ。値は2026-07-10採取の実応答fixture由来・改変なし）
- 2026-07-10 #5実装（Step 0解消含む）: ①**未決#5解消＝XMLフォールバックは実装しない**（response_format=jsonは法令標準XMLの決定的な直訳ツリーで安定・asof版でも同構造を実確認。監視はschema-bufferドリフト＋条抽出0件警告）②全法令ループ禁止を3層で強制（クライアントに巡回機能なし・law_query必須・READMEで公式一括DLへ誘導）③dirをlaws-regulationsへ改名（laws-structured廃止・slug=japan-laws-regulations）④**title_enはv1でnull**（api_native英名が存在しないため。FR-5軽微逸脱。translate時の題名訳はlaw単位1回生成→全条translatedへ複写・条課金に内包）⑤本則（MainProvision）の条のみ抽出・附則はv1対象外（README明記）⑥normalize-jpに漢数字→算用数字（kanjiToNumber/convertKanjiNumerals）を追加し、translatedの数値は存在照合・不一致フラグのみ⑦実LLMは長条で要約省略・max_tokens切れが起きる（実測）→アダプタにstop_reason=max_tokens検知（**#1にも適用＝切れた出力を正常出力として流さない改善**）・summary_en省略は許容（null/confidence 0）⑧translate実測10条: **平均$0.001716/条→85%マージン下限$0.0114**（仮置き$0.029なら約94%）・**単価確定は人間タスク**。E2E実測: 個情法185条抽出・最初の結果2,276ms。詳細: docs/research/laws-api-v2.md
- 2026-07-10 #4実装（Step 0解消含む）: ①未決#3（/4/name曖昧一致）はID未着で実挙動確定不可→仕様書ベースで#2共有のresolveCompanyName（前方一致×あいまい＋比較側同等正規化）を採用し、**実データ精度確認はID到着後の人間タスク**②特許EPは実在（/patent・日立19,950件・約12MB実測）→件数のみの軽量スキーマでpatent_count実装、fieldsでスキップ可③HOUJIN_API_BASE envで本番/検証環境切替（検証環境URL取得は人間タスク）④基本情報実応答はOpenAPIより項目が多い（**name_en**・industry・founding_year等）→スキーマ追加、name_en(api_native)は基本情報1リクエストで取得⑤business_itemsは営業品目コードのためbusiness_item_codesとして保全・industryはJSIC大分類→EN辞書（normalize-jp）・住所ENは都道府県まで（47表・市区町村ローマ字表は見送り）⑥gBizINFO未収載404は非課金_error行で明示（houjin /4/numフォールバックはID到着後TODO）⑦実LLMはtool_choice強制でも稀にstring省略形を返す（実測）→confidence=0.5で受容⑧enrich実測10社: **平均$0.000805/社→85%マージン下限$0.0054**（仮置き$0.019なら約96%）・**単価確定は人間タスク**。E2E実測: 日立・全ブロックで2,650ms。詳細: docs/research/houjin-name-search.md
- 2026-07-10 #2実装（Step 0解消含む）: ①**data_origin廃止**＝jGrants由来識別はv2データで不可（meta-data.sourceは提供元府省名のみ・417レコード実証→FR-2からの逸脱。README正直明記）②横断検索は法人検索API（source=4×ministry内部コード1〜49・page上限10）→法人ごと/subsidyの2段構成、日付はdate_of_approvalクライアント側フィルタ・**v1はministry必須**③FR-C7新規定義＝対象法人500社 or 横断500件④補助金amountは実応答が文字列→スキーマ両受け・出力で数値化、meta-dataはオブジェクト、真のnullも出現→stripNullStringsで"Null"文字列と共にundefined化（**柱3影響: GbizSubsidy.amountの型がnumber|stringに拡大**）⑤prefillはトヨタ（補助金0件を実証）から日立製作所7010001008844へ変更⑥補助金名の英語化はv1非対応（LLM不使用の要件優先・title_jaのみ）⑦名称解決は/4/nameの共有モジュール（exact/selected/ambiguous/not_found・#4と共通）でHOUJIN_APP_ID未設定時はcompany_names入力を実行失敗に。E2E実測: 日立5件・最初の結果958ms。詳細: docs/research/gbizinfo-subsidy.md
- 2026-07-10 docs/launch/を廃止（内容はmarketing.md §5.2／要件書§7・追補・decisions／Notion人間タスクと全面重複のため。ユニーク情報は移植済み）。#1の残作業はコンソールのみ（PPE $0.079設定・payout・SEO・permissions=limited・dataset-item削除）
- 2026-07-10 #3の残作業はコンソールのみ（無料枠50/100確定・PPE $0.003・#1へ相互リンク追記→#1再push）
- 2026-07-10 #3実装は第三者レビュー承認済み（review-2026-07-09-actor3.md・121テスト/実機起動検証済み）
- 2026-07-09 ESMバンドルにcreateRequireバナーを追加（両Actor）: gov-clientsバレルがhoujin経由でCJSのiconv-liteを含むようになり`Dynamic require of "buffer"`で実行時クラッシュ→バナーで解消。**#1の潜在ランタイム障害の修正を含む**（push前に発見）。
- 2026-07-09 #3共通化（Step 5）: billing(freeAllowance/charge_limit)・attribution挿入・バックオフはPhase 0設計で既に共有パッケージ（両Actorが参照）。監視アラートPOSTを`gov-clients/src/monitoring.ts`へ抽出し#1/#3両mainで共用（§15のN-4→gov-clients監視に整合。#1のテスト・golden全緑維持）。実行サマリ／ランナー本体の共通化はActor間で形が異なり#1リスクが勝るため見送り（複製＋TODO、#2着手時に再考）。
- 2026-07-09 #3設計確定: 無料枠は実行単位・先頭50件仮置き（確定は事業主。R2-3の仮置き100件から50件へ変更——いずれも仮置き。最終確定は公開時の事業主判断＝Notionの人間タスク）／stationはv1で6桁コードのみ受付（名称解決なし・README明記）／集計はrecord_type="aggregate"で同一datasetに追記（transaction行と区別・非課金・「取得済みレコードからの集計」をREADME明記・課金上限打ち切り時はミスリード防止のため出力しない）／FR-C7は都道府県×年の組合せ12（ja/en二重取得で最大24req・直列1req/秒）。placeholderの`actors/real-estate-tx`はスラッグ準拠の`actors/real-estate-prices`に置換。E2E実測: prefill（Tokyo/Chiyoda/2024）で最初の結果3.8秒・549件+集計4件・結合不一致0。
- 2026-07-09 reinfolib Step 0解消: ①未決#4=priceClassification（01=取引価格のみ/02=成約価格のみ/省略=両方。公式マニュアル＋実証一致）②language=ja/enは**値のみ翻訳・フィールド名固定・件数と順序一致**→同一クエリのja/en二重取得をindex結合（TradePrice/MunicipalityCodeサニティ・不一致はjoin_mismatches計上し*_ja=null）③成約価格の追加クレジット指定は規約に存在せず、API規約第7条の共通文言=引継書§4.6の既存attributionで確定（RMI側規約は未確認としてREADMEに由来明記）④第三者提供はPDL1.0＋API規約第7/8条によりオペレータキーで可→**BYOキー入力欄なし**・第9条によりキーの共有配布はしない⑤quarterはマニュアル上必須表記だが実挙動は省略可（通年返却）→Actorでは任意。詳細: docs/research/reinfolib.md / store-scan-real-estate.md

- 2026-07-08 柱3 R3-3ゲート(G1)対応で gov-clients に houjin(/4/num・/4/name)・gbizinfo(v2 基本情報/補助金/調達)クライアントを実装。houjinは XML(fast-xml-parser・isArray:corporation で単一/複数/0件を吸収)＋CSV(Shift_JIS=iconv-lite/Unicode=UTF-8)を共通Corporation30項目へ正規化、appIdはコンストラクタ受領でpublicUrl/エラーに漏らさない（F-1維持）。gbizinfoはヘッダ認証・末尾スラッシュ除去(500回避)・値なし"Null"文字列をstripNullStringsでundefined化(0は保全)。**procurementはFR-6「補助金受給・国等との調達実績」が調達も要するためsubsidyと同型で追加**（スコープ外の他エンドポイントは非実装）。gbizinfo fixtureは公式OpenAPI準拠のspec-based（"Null"含む・実応答差し替え手順をREADMEに明記）。

- 2026-07-08 enriched単価$0.079確定（実測avg $0.0048/doc・10件・照合フラグ0。有料利用の大型有報偏重で実効原価$0.012〜0.017想定＋値下げ即時/値上げ14日の非対称性から高め始値。実運用avgが$0.005近辺なら$0.049へ値下げ検討）

- 2026-07-08 レビューF-6を撤回: pnpm 11.10実測で`approve-builds`は`allowBuilds`（マップ形式）を生成し`onlyBuiltDependencies`は無視される（柱3のCIでERR_PNPM_IGNORED_BUILDS実発生→allowBuildsで解消）。pnpm-workspace.yamlはallowBuilds単独に整理。機能影響ゼロ（esbuildはoptionalDependenciesのバイナリで動作）。

- 2026-07-08 Phase 1b（docs/tasks-phase1b.md準拠に改修）: enrichは同期API＋caching、**数値禁止プロンプト＋数字列照合（要約文はフラグのみ・null化しない）**、出力は`enriched`ネスト（model/prompt_version付き）、原文はtextblocks.ts（business3000/risks6000/segments3000字・truncatedフラグ）、原価集計と推奨単価ログ（avg/0.15）。fixtureにTextBlock行を追加（保存済み生zipから・追加APIコールなし）。ゲート3を(a)で解消、実測10件 avg$0.0048/doc→推奨$0.0320、**単価確定は事業主タスク**（launch①〜④）。

- 2026-07-08 enrich（FR-1 enriched）実装で公開ゲート3を(a)解消: 同期Messages API＋tool use＋temperature0＋prompt caching（R2-1）、入力は既取得CSVのTextBlock 3節（HTML除去・~8k字切詰め・追加APIコールなし）、N-9はLLMに原文termsを出させ英文中数値と共にverifyVerbatim（不一致はnull＋verification_failed）、LLM失敗はbasicフォールバック（FR-C8・enriched課金なし）、原価はサマリ集計＋終端平均ログ（R2-2入力）。実LLM確認: $0.0043/doc→$0.05でマージン約91%見込み。プロンプトはprompts/edinet-summary-v1.md正典＋埋め込み定数（同期テストで担保）。schema_version 0.2.0へ。

- 2026-07-08 レビュー修正: F-1キー漏洩サニタイズ（redactUrlForErrorを両エラークラスのコンストラクタ内部で適用、回帰テスト2本追加）ほかF-2〜F-7対応（enrichにComing soon注記／陳腐化コメント2件／Dockerのapifyを3.7.2に完全固定／pnpm-workspace調整／launch文書にapify-default-dataset-item削除を明記）。F-6はpnpm 11.10が`allowBuilds`を正式キーとするため`onlyBuiltDependencies`併記の形に調整（installは警告なし）。

- 2026-07-08 追補v1.1対応（矛盾修正）: R2-1/2 enrichは同期Messages API＋prompt cachingに変更し.envの単価をclaude-haiku-4-5同期定価($1/$5)へ／R2-3 無料枠を実行単位のコード実装に変更（billingのfreeAllowance、#1=最初の3書類・仮置き）しREADME/入力スキーマの表記も更新／R2-5 独自actor-startイベントを廃止（合成apify-actor-startに$0.02設定・primary=record-basic、コードからの発火なし）／R2-6 ChargeResultのeventChargeLimitReachedで部分結果graceful終了（summary.charge_limit_reached）／R2-4 CIにbundle生成ステップ追加。R2-4のバンドル方式・R2-11のZIP前提は実装済みで整合、R2-7〜9はコンソール作業としてlaunch文書に反映。

- 2026-07-08 動作検証: 不動産ライブラリ実疎通OK（**キー到着済み**＝#3ゲート解除。XIT001=549件/千代田区2024、応答はgzip、データなしは404を確認）。Anthropicキー・claude-haiku-4-5も有効（count_tokensで確認）。
- 2026-07-08 gBizINFO v2実疎通OK（法人基本・補助金・法人検索）。補助金レコードは`{title,amount,date_of_approval,government_departments,target}`で**note列なしを実データで確定**→FR-2のdata_origin(jGrants識別)は`metadata_flg=true`の`meta-data.source`で要検証（Phase 2）。
- 2026-07-08 EDINETレート簡易実測（未決#2進捗): 1req/秒直列で一覧＋書類取得×計10req超、429/403なし・一覧0.7s・zip1-2s。仮置き1req/秒を維持し、本格実測は数日分採取時に実施。
- 2026-07-08 ファンド開示（投信有報等）は経営指標のタクソノミが異なり財務値は全null（is_fund=trueで利用者が絞り込める。READMEの正直明記と整合）。
- 2026-07-08 財務値抽出の仕様を実CSV（S100YIZC個別JGAAP・S100YNCJ連結IFRS保険）で確定: ①連結/個別は「連結・個別」列でなく**contextId完全一致**で判定（サマリ行は「その他」のため）②時点項目の相対年度は「当期末」③要素IDは候補リスト方式（IFRS変種・個別のNetIncomeLoss・jppfs営業利益フォールバック）④連結があれば連結のみ採用し基礎の混在を防ぐ（financials_basisで明示）。業種別様式（銀行・証券等）はカバレッジ拡大TODO。
- 2026-07-08 EDINET実応答fixture採取完了→合成fixtureを削除しfixture/goldenを実データへ差し替え（一覧は代表4件・CSVは当期行にトリミング。値の改変なし）。E2E実機確認: 最初の結果まで1.46秒（§11-4の30秒以内クリア）。

- 2026-07-07 モノレポ×apify pushの構成: workspaceパッケージはesbuildでdist/main.jsに事前バンドル（apifyのみexternal）し、.actor/Dockerfileはdistとpackage.docker.jsonのみ使用。push前に`pnpm --filter @jp-opendata/actor-edinet-filings build`必須。
- 2026-07-07 財務値の要素IDマップ（SummaryOfBusinessResults系7項目）は公開仕様に基づく仮置き。営業利益は業種別様式で揺れるため実CSV採取後に検証（未取得はnull＝推測禁止で安全側）。単位は円/千円/百万円をJPY生値へ正規化。連結優先・無ければ個別（financials_basisで明示）。
- 2026-07-07 enrich（FR-1 enriched）はANTHROPIC_API_KEY未設定で検証不能のため未実装のまま前進。enrich=trueは警告ログ＋basic出力・record-enriched課金なし。公開前に「実装完了」か「v1掲載から一旦除外」かを事業主が選択（docs/launch/edinet-filings.md 公開ゲート3）。
- 2026-07-07 FR-C8の実行失敗条件「認証エラー」はEDINETのボディ内StatusCode 401/403で判定。FR-C7超過時は打ち切り＋警告（days_truncated/documents_truncatedをサマリで報告）。共通ランナー化（§15）は#2着手時に抽出予定。

- 2026-07-07 #4法人番号もNexGenDataの既存Actorと完全競合になる見込み→Phase 3の公開前スキャンで再確認（docs/research/store-scan-edinet.md）。
- 2026-07-07 受入基準6(#1)実施: EDINET公式APIベースの完全競合2件を確認（メタデータ＋DLリンク中心・底値価格）。差別化は柱②（構造化財務値＋逐語検証＋golden CI）でREADME第1段落に反映。名前は§5.1のまま変更なし・価格競争に応じない。§11チェックリスト消化状況: docs/launch/edinet-filings.md

- 2026-07-07 未決#3(仕様面)解消: 名称検索はmode(1前方/2部分)×target(1あいまい/2完全/3英語)。あいまい検索の文字補正はひらがな→カタカナ・英小文字→大文字・中点/全角スペース削除。実データ精度確認は検証環境接続後。
- 2026-07-07 法人番号Web-APIの検証環境は本番と同一アプリケーションIDが必須（仮IDなし・URL非公開、ID到着後に問合せフォームで利用申請）→ID到着前の接続は不可。公式公開サンプルZIP（Ver.4実応答・架空法人）を`fixtures/houjin/`に採取してfixture整備を先行。詳細: docs/research/houjin-webapi-v4.md

- 2026-07-07 x402/agenticはactor.jsonのフラグではなく「PPE＋limited permissions＋Standby不使用」の3条件充足で自動対象（追加開発禁止の方針は維持）。`allowsAgenticUsers`はStore検索APIのフィルタ。
- 2026-07-07 未決#6(ドキュメント調査分): PPEイベント定義はApifyコンソール側（actor.jsonに課金フィールドなし）、単価下限の明示なし、発火は`Actor.charge({eventName,count})`。**「月間無料枠」のコンソール設定機能はドキュメント上確認できず**→FR-C6の無料枠はコード側graceful制御になる可能性。コンソール実物での最終確認をPhase 1公開前に実施。詳細: docs/research/apify-ppe.md

- 2026-07-07 EDINET一覧のfixtureはEDINET_API_KEY未設定のため仕様書ベースの合成で先行（`documents.2026-06-30.spec-based.json`）。TODO: キー設定後に実応答（1req/秒で数日分）を採取しfixture・goldenを差し替え、レート実測（未決#2）も行う。
- 2026-07-07 EDINET APIは認証エラーをHTTP 200＋ボディ内`StatusCode:401`で返す（実測）→クライアントはHTTPステータスでなくボディのStatusCode/metadata.statusも検査する。
- 2026-07-07 fixture配置は引継書§8の`packages/gov-clients/*/fixtures/`を`packages/gov-clients/fixtures/<source>/`と解釈（単一パッケージ内で源別サブディレクトリ）。

- 2026-07-07 Nodeは`.node-version`で22.17.0に固定（ローカルnodenvのpnpm都合。要件のNode 20+を満たす）。workspaceの内部パッケージはビルドせずsrc/index.ts直参照（tsc noEmit＋vitestで検証、Actorのビルドは`apify push`時に構成）。

- 2026-07-07 gBizINFO v2は補助金レコードからnote(備考)が削除されたため、jGrants由来識別（FR-2のdata_origin）は`meta-data.source`での代替可否を実データで要確認。
- 2026-07-07 「gBizINFO v1は2026年9月終了」は一次情報で確認できず（公式FAQは「終了時期未定」）→終了時期を断定する記述をコード・READMEに書かない。
- 2026-07-07 未決#1解消: gBizINFO v2 = `https://api.info.gbiz.go.jp/hojin/v2/...`、認証はv1と同じヘッダ`X-hojinInfo-api-token`、補助金は法人番号指定＋期間指定(updateInfo)の2系統で、府省・期間による補助金横断検索は法人検索API(`subsidy`/`ministry`/`source=4`)経由のみ。詳細: docs/research/gbizinfo-v2.md
