# 最終監査 2026-07-12 — Actor #6 公開前チェック（第三者・全数監査）

保存先: `docs/review-2026-07-12-final-audit.md` ／ 実施者: Claude Code ／ 対象: main 569fb7a
参照順: 本書 → `docs/requirements-edinet-financials.md` → `docs/tasks-phase3-edinet-financials.md`

**結果**: #6の実装・golden・既存資産・掲載文言・受入基準は健全（doc_ids/date_range両経路のライブ疎通・N6-2の192値機械検証・CI全緑を第三者再現済み）。残るClaude Code作業は下記3件——いずれも軽微だが、週明けコンソール作業の前に消化する。

## FIX-3【文書整合】ルートREADME.md の「5本」表記を更新

- 対象: `README.md` の「Actorファミリー（5本）」と「構成は `actors/*`（Actor 5本）」の2箇所
- 修正: いずれも **6本** へ。他の文言は変更しない。
- 理由: #6追加後の事実誤り（リポジトリの玄関ページ）。なお `docs/requirements.md`・`docs/handover.md` の「5本」前提は追補パターンにより**次回全面改訂まで据え置きが正**（本FIXの対象外・触らない）。

## FIX-4【運用保険】AGENTS.md の読み順に #6 要件書を追加

- 対象: `AGENTS.md`（addendum-v1.1 を案内している行の直後）
- 修正: 1行追加——「`docs/requirements-edinet-financials.md` はActor #6の要件追加文書。#6の範囲では requirements.md に優先する。」
- 理由: 新規Claude Codeセッションの読み順（handover → requirements）に#6要件書が含まれず、存在を見落とすリスク。addendumと同じ扱いの1行の保険。

## FIX-5【検証残】#6 の課金ログをローカル実機で確認（tasks-phase3 Step 3-7 の未消化分）

- 手順（#2/#4/#5 で2026-07-10に確立済み——`docs/research/live-verification-2026-07-10.md`）:
  1. `pnpm --filter @jp-opendata/actor-edinet-financials build`
  2. `ACTOR_TEST_PAY_PER_EVENT=1` と `ACTOR_USE_CHARGING_LOG_DATASET=1` の**両方**（片方ではログが出ない・同research文書の発見）＋ `EDINET_API_KEY` を設定し、INPUT を **4書類**（prefill 2件＋fixture採取済み2件）にして `dist/main.js` をローカルNode 22で実行
- 確認事項:
  1. charging-log dataset に `record-basic` イベントが現れる
  2. **無料枠3件が控除され、4件処理で charged=1 / free_used=3** となる（main.tsのfreeAllowance=3の実配線確認）
  3. summaryの `records_charged` / `free_used` がログと一致する
  4. 追加で非有報docID（半期等）を1件混ぜ、`_error`行が**課金されない**ことを確認
- 記録: 結果の数値を `docs/decisions.md` に1行。
- 理由: Step 3-7「課金ログは ACTOR_TEST_PAY_PER_EVENT=1」の実施記録が無い（両経路の疎通はFIX-2までに完了済み・**課金配線の実機確認のみ未実施**）。PPE設定はイベント削除不可の一発勝負ゾーンのため、コンソール当日の前にゼロコストで実証しておく。

## 完了条件

CI緑維持（typecheck／lint／format:check／test／bundle6本）。golden・fixtureは無変更（FIX-3/4/5はいずれも非影響のはず——差分が出たら自動コミットせず報告）。`docs/decisions.md` に1行（FIX-3/4適用とFIX-5の課金ログ数値）。完了報告に課金ログの要約と「残り（人間タスク）」の変化有無を明記。
