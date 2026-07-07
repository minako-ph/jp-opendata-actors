# decisions.md — 実装中の判断ログ（1行/件、新しいものを上に）

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
