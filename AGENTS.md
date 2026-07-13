# jp-opendata-actors

作業前に必ず docs/handover.md を全文読むこと。§13 Do/Don't は絶対規則。
読み順: docs/handover.md → docs/requirements.md（矛盾時は requirements.md が正）
未定義事項は最小実装＋TODOで前進し、docs/decisions.md に1行残す。
検証: pnpm typecheck && pnpm test（Phase 0でスクリプト整備後、着手前に緑を確認）
柱1（jp-tender-intel）の出荷作業と競合したら常に柱1を優先する。
Store掲載文言・README構成・ローンチ手順の正: docs/marketing.md（引継書§10はこれに従属）
docs/addendum-v1.1.md は既存3文書の該当節を上書きする正誤表。作業前に必ず読むこと。
docs/requirements-edinet-financials.md はActor #6の要件追加文書。#6の範囲では requirements.md に優先する。
docs/requirements-calendar-business-days.md はActor #7の要件追加文書。#7の範囲では requirements.md に優先する。
人間向けチェックリストはリポジトリに置かない。各実装の完了報告に「残り（人間タスク）」節を箇条書きで必ず含める（事業主がNotionへ転記する）。掲載文言の正はmarketing.md §5、設定値の正は要件書§7とdecisions.md。
