# decisions.md — 実装中の判断ログ（1行/件、新しいものを上に）

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
