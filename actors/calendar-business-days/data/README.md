# data/ — 祝日データスナップショット

## syukujitsu-snapshot.csv

- **出典**: 内閣府「国民の祝日」について — 昭和30年（1955年）から令和9年（2027年）国民の祝日（CSV形式）
  - CSV URL: https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv
  - 親ページ: https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html
- **ライセンス**: CC-BY（クリエイティブ・コモンズ 表示）。デジタル庁データカタログ（data.go.jp、データセットID: cao_20190522_0002）に明記。
- **取得日**: 2026-07-11（移植元 jp-business-api での `pnpm fetch-holidays` による手動取得。2026-07-13にActor #7へ無改変移植）
- **形式**: Shift_JIS・CRLF・2列（国民の祝日・休日月日, 国民の祝日・休日名称）・1,067行（ヘッダ除く）
- **実収録範囲**: 1955-01-01 〜 2027-11-23（年単位では1955年〜2027年）

## 更新手順（年次・手動。N-4）

1. `pnpm --filter @jp-opendata/actor-calendar-business-days fetch-holidays` — CSVを取得し本ディレクトリへ生バイト保存（例年2月頃に翌年分が追記される）
2. `pnpm --filter @jp-opendata/actor-calendar-business-days build-holidays` — Shift_JIS→UTF-8変換・形式検証・`src/generated/holidays-data.ts` 生成（収録範囲は機械決定）
3. `pnpm test` — golden差分をレビュー（**期待値の自動修正・自動コミット禁止**。差分は事業主レビュー）
4. スナップショット・生成物・本README（取得日・収録範囲）を更新してコミット。収録範囲が変わった場合はActor README・docs/marketing.md の範囲記載も更新

実行時（Actor）はこのCSVにもURLにも一切アクセスしない（N7-1: ビルド時同梱のみ）。
