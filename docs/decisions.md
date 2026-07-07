# decisions.md — 実装中の判断ログ（1行/件、新しいものを上に）

- 2026-07-07 Nodeは`.node-version`で22.17.0に固定（ローカルnodenvのpnpm都合。要件のNode 20+を満たす）。workspaceの内部パッケージはビルドせずsrc/index.ts直参照（tsc noEmit＋vitestで検証、Actorのビルドは`apify push`時に構成）。

- 2026-07-07 gBizINFO v2は補助金レコードからnote(備考)が削除されたため、jGrants由来識別（FR-2のdata_origin）は`meta-data.source`での代替可否を実データで要確認。
- 2026-07-07 「gBizINFO v1は2026年9月終了」は一次情報で確認できず（公式FAQは「終了時期未定」）→終了時期を断定する記述をコード・READMEに書かない。
- 2026-07-07 未決#1解消: gBizINFO v2 = `https://api.info.gbiz.go.jp/hojin/v2/...`、認証はv1と同じヘッダ`X-hojinInfo-api-token`、補助金は法人番号指定＋期間指定(updateInfo)の2系統で、府省・期間による補助金横断検索は法人検索API(`subsidy`/`ministry`/`source=4`)経由のみ。詳細: docs/research/gbizinfo-v2.md
