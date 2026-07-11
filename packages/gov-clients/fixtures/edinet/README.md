# EDINET fixtures

すべて**実応答のサニタイズ済みスナップショット**（2026-07-08採取、Subscription-Keyは含まれない）。

| ファイル | 内容 |
|---|---|
| `documents.2026-06-30.json` | 書類一覧の実応答。metadataは原本のまま（count=909）、**resultsは代表4件にトリミング**: S100YNCJ(連結・証券コードあり120)／S100YIZC(個別120)／S100YB0U(ファンド120)／S100Y2Q1(ファンド160) |
| `document.S100YIZC.csv.trimmed.zip` | 書類取得type=5の実応答（山口放送・JGAAP個別）。zip内jpcrp CSVを**当期の経営指標等＋jppfs営業利益の行にトリミング**して再zip |
| `document.S100YNCJ.csv.trimmed.zip` | 同（MS&AD・連結/IFRS併記の保険持株）。セグメント別Member付きcontextの従業員数行を含む（完全一致選別の回帰用） |
| `error.auth.2026-07-07.json` | キーなしリクエストへの実応答（HTTP 200＋ボディ内StatusCode=401） |

### #6（edinet-financials）用 `*.csv.statements.zip`（2026-07-11採取）

財務諸表本表行を含む#6専用トリム（jppfs/jpigp全行＋jpdei全行＋経営指標等＋TextBlock候補行を保持。監査報告jpaud*は除外）。
**#1用の`*.csv.trimmed.zip`とは別系統**（同名差し替えは#1のunitテストの行順前提を壊すため別名。docs/research/edinet-financial-statements.md）。

| ファイル | 系統 |
|---|---|
| `document.S100YIZC.csv.statements.zip` | JGAAP個別（山口放送） |
| `document.S100YN9E.csv.statements.zip` | JGAAP連結（ネポン・7985） |
| `document.S100YN95.csv.statements.zip` | IFRS連結・標準様式（コンヴァノ・6574） |
| `document.S100YNCJ.csv.statements.zip` | IFRS連結・保険特殊様式（MS&AD・8725） |

再採取: #1用は `actors/edinet-filings/scripts/live-verify.ts`、#6用は `actors/edinet-financials/scripts/capture-fixtures.ts`（いずれも要EDINET_API_KEY）。
規約: fixtureにシークレットを含めない（引継書§13）。トリミングは行の削除のみで値の改変はしない。
