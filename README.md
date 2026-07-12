# jp-opendata-actors

日本の公的オープンデータAPIを英語構造化データとしてApify Storeで販売するActorファミリー（6本）のモノレポ。

- 要件の正: `docs/requirements.md` ／ 実装設計・検証済み事実: `docs/handover.md`（§13 Do/Don'tは絶対規則）
- 判断ログ: `docs/decisions.md` ／ 調査メモ: `docs/research/`
- データ源は公式APIのみ。DOMスクレイピングは書かない。

## 開発

```sh
pnpm install
pnpm typecheck && pnpm lint && pnpm test
pnpm golden:update   # golden候補生成（diffを人間がレビューしてコミット。CIでは禁止）
```

構成は `actors/*`（Actor 6本）と `packages/*`（共通基盤）。依存方向は `actors → packages` の一方向のみ。
シークレットはApify Secrets／ローカル `.env` で管理し、コード・fixtureに含めない。
