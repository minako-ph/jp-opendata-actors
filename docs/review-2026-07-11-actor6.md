# 第三者レビュー 2026-07-11 — Actor #6（edinet-financials）Phase 3成果物

保存先: `docs/review-2026-07-11-actor6.md` ／ 実施者: Claude Code ／ レビュー対象: コミット 5ce0e35
参照順: 本書 → `docs/requirements-edinet-financials.md` → `docs/tasks-phase3-edinet-financials.md`

**結果**: 実装はFR6-1〜10・N6-1/2・FR-C適用値・R2-5/6を充足。既存#1〜#5はfixture・golden・テストとも変更ゼロ（#1 README+1行のみ）。第三者環境でclone→typecheck/lint/format:check/259テスト/bundle6本の全緑を再現。掲載文言はmarketing.md §5と一字一句一致。公開ブロッカーは**FIX-1のみ**、FIX-2は公開前推奨の追加検証。

## FIX-1【公開前必須】README相互リンクのプレースホルダ除去

- 対象: `actors/edinet-financials/README.md` の2箇所——第1段落と `## More Japan data Actors` 節の `[Japan Company Filings (EDINET Official)](https://apify.com/store)`
- 修正: リンクを外し **太字テキスト**（`**Japan Company Filings (EDINET Official)**`）にする。文言は変更しない。
- 理由: 現状はStoreトップへの誤誘導リンク。ファミリー規約（未公開Actorへの言及はリンクなし・公開時に実URLを追記——#1側READMEの#6言及と同じ運用）との不整合。実URL化は両Actor公開後の人間タスク起点で別途実施する（Notion A6に記載済み）。

## FIX-2【公開前推奨】date_range副経路のライブ疎通1回

- 対象: `actors/edinet-financials/scripts/live-e2e.ts`（現状はdoc_ids固定で日付範囲入力を受けられない）
- 修正: `--from=YYYY-MM-DD --to=YYYY-MM-DD` 引数を受けて日付範囲入力で実行できるよう小改修し、**2026-06-30の単日で1回実機実行**する（一覧→120/非ファンドフィルタ→取得→抽出の全経路疎通。summaryの `days_scanned` / `documents_planned` / `records_pushed` と、doc_ids経路との出力同一性を1件で目視）。上限に配慮し `maxDocuments` を小さく上書きした実行でよい（例: 5）。結果のログ要約を完了報告に含める。
- 理由: 実機確認はdoc_ids経路のみ（414ms実測済み）。date_range経路はunitテスト（実応答一覧fixture）のみで、実APIを通していない。「ライブ検証を必ず挟む」教訓（#4実ID英数字事故を公開前検出した実績）の適用。

## 完了条件

CI緑維持（typecheck/lint/format:check/test/bundle6本）。golden・fixtureは無変更のはず——差分が出た場合は自動コミットせずdiff要約を報告。`docs/decisions.md` に1行（FIX-1/2適用とdate_rangeライブ疎通の結果）。完了報告に「残り（人間タスク）」の変化があれば明記。
