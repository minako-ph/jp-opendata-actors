# レビュー指摘・修正指示 — apify push で dist/ が除外されビルド失敗（2026-07-13）

## 症状（実機で発生）
`actors/edinet-filings` で `apify push` 実行 → Apifyコンテナ内ビルドが以下で FAILED:

```
#10 [4/5] COPY dist ./dist
#10 ERROR: "/dist": not found
ACTOR: ERROR: Container image build failed
```
`Upload: SUCCEEDED / Build: FAILED`（＝アップロードは通ったが中身に dist が入っていない）。

## 根本原因（実証済み）
- ルート `.gitignore:2` に `dist/` があり、`dist/main.js` はローカルで正しく生成されるが git 無視対象。
  - `git check-ignore -v actors/edinet-filings/dist/main.js` → `.gitignore:2:dist/` で無視されることを確認。
- `apify push` は **`.gitignore` と `.actorignore` にマッチしたファイルをアップロードから除外する**（Apify CLI 公式リファレンスに明記）。
  - 結果 `dist/` がアップロードされず、Dockerfile の `COPY dist ./dist` が dist を見つけられず失敗。
- Dockerfile は「ローカルで esbuild バンドル → dist を COPY」する設計（各Actorの `.actor/Dockerfile`）。この設計自体は正しいが、push が dist を送らないため成立していなかった。

## 確定した修正（公式解・実証済み）
Apify CLI 公式リファレンス:
> Files matched by .gitignore and .actorignore are excluded. Use negation patterns (e.g. `!dist/`) in **.actorignore** to force-include git-ignored files.

→ **各Actorディレクトリ直下に `.actorignore` を新規作成し、`!dist/` を記述する。**
   `.gitignore`（dist をコミットしない運用）は一切変更しない。`.actorignore` は `apify push` だけに効くため、リポジトリはクリーンなまま dist だけを push に含められる。

手元検証: Actor直下に否定パターンを置くと `git check-ignore` が dist を無視しなくなり、他ファイルへの巻き込みが無いことを確認済み（`.gitignore` で実証。本番は `.actorignore` に置くこと）。

## FIX-1: 全7 Actor に `.actorignore` を作成
対象ディレクトリ（7本すべて。1本でも漏れると同じ push 失敗が起きる）:
- actors/edinet-filings/.actorignore
- actors/edinet-financials/.actorignore
- actors/subsidies-grants/.actorignore
- actors/real-estate-prices/.actorignore
- actors/company-enrichment/.actorignore
- actors/laws-regulations/.actorignore
- actors/calendar-business-days/.actorignore

各ファイルの内容（最小構成）:
```
# apify push は .gitignore を尊重し dist/ を除外してしまうため、
# ビルド成果物 dist/ だけを force-include する（Dockerfile が COPY するため必須）。
!dist/
```

補足検討（Claude Code判断で追加してよいが必須ではない）:
- `apify push` は `.gitignore` が無いと node_modules や storage まで送るが、本リポジトリはルート `.gitignore` があるためそれらは既に除外される。`.actorignore` は「dist の force-include」のみを目的とし、余計な除外行は足さないこと。
- `.actorignore` の否定パターンは、親の `.gitignore` で無視された dist を「push に限り」戻す。gitの追跡状態は変わらない（dist は引き続き未追跡・非コミット）。

## 完了条件
1. 7本すべてに `.actorignore`（`!dist/` を含む）が存在。
2. 検証コマンド（各Actorで）: `git check-ignore -v actors/<name>/dist/main.js` が **何も返さない**（＝無視されない）こと。※ `.actorignore` は git の無視判定には影響しないため、この検証は「`.gitignore` 側で dist が無視されたままでも `apify push` は `.actorignore` の否定で送る」ことを CLI 挙動として確認する形になる。確実な検証は下記3を優先。
3. **実push検証（推奨・1本で代表確認）**: `pnpm --filter @jp-opendata/actor-edinet-filings build` → `cd actors/edinet-filings && apify push` が Build SUCCEEDED になること。※これは人間（コンソール権限保持者）が実施する項目。Claude Code はファイル作成と `git check-ignore` までを担い、実 push の成否は人間が確認。
4. handover.md（§13 付近の Do/Don't もしくはデプロイ節）に1行追記: 「各Actorに `.actorignore`（`!dist/`）必須。新規Actor追加時も同様。理由: apify push は .gitignore の dist/ を除外するため」。
5. decisions.md 先頭に1行: 「- 2026-07-13 apify push が .gitignore の dist/ を除外しビルド失敗 → 全7Actorに .actorignore（!dist/）追加で解決（Apify CLI公式の force-include 方式）。第三者レビュー実証済み」。
6. CI green（既存346テストに影響しないこと）・push。

## やらないこと
- ルート `.gitignore` の `dist/` を消さない（distをコミットする運用に変えない）。
- Dockerfile の COPY 方式を変えない(「コンテナ内ビルド」への切替は今回不要・スコープ外)。
- 単価・PPE・スキーマは一切触らない。
