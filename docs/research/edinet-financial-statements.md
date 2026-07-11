# EDINET CSV(type=5) 財務諸表本表の実データ調査 — Actor #6 Step 1/2（2026-07-11）

一次情報: EDINET書類取得API type=5 の実応答4書類（2026-07-11採取・`packages/gov-clients/fixtures/edinet/document.*.csv.statements.zip`）。
採取スクリプト: `actors/edinet-financials/scripts/capture-fixtures.ts`（要EDINET_API_KEY・1req/秒直列）。

## fixture 4系統と選定理由

| docID | 提出者 | 系統 | 選定理由 |
|---|---|---|---|
| S100YIZC | 山口放送（証券コードなし） | **JGAAP個別** | 既存#1 fixtureの原本再取得。個別のみ提出（連結非作成）の代表 |
| S100YN9E | ネポン（7985） | **JGAAP連結** | 指示書Step 1の追加1件。2026-06-30一覧の候補33件（120・証券コードあり・非ファンド・csvFlag=1）を先頭から実データ判定（jppfs_cor行が`CurrentYearInstant`に実在＝連結JGAAP・jpigp行なし）した最初の該当書類 |
| S100YN95 | コンヴァノ（6574） | **IFRS連結（標準様式）** | 追加採取（指示書の3書類への+1）。S100YNCJ（保険）は無区分BS・保険PLのため**IFRS標準本表要素（売上収益・流動/非流動区分等）をfixtureで実在確認できず**、FR6-7-2（実在確認できないIDは登録しない）の下でIFRS系候補が登録不能になる。これを解消するための一般事業会社IFRS。判定はjpigp実在で確認 |
| S100YNCJ | MS&AD（8725） | **IFRS連結（保険・特殊様式）** | 既存#1 fixtureの原本再取得。業種別特殊様式の代表（無区分BS・保険収益PL）＝「取れない項目はnull」の安全側回帰用 |

- fixture名は`*.csv.statements.zip`（#6専用）。**#1の既存`*.csv.trimmed.zip`は無変更**——同名差し替えは#1のunitテスト（fixture先頭行の相対年度前提）を壊すことを実測で確認したため別名方式に確定。
- トリミング規律: jppfs_cor/jpigp_cor全行＋jpdei*全行＋経営指標等（`*SummaryOfBusinessResults`・`NumberOfEmployees`）＋TextBlock候補行を保持、他は行削除のみ（値の改変なし・キー非含有）。監査報告（jpaud*）はzipから除外。
- 当期＋前期の本表行の実在を確認: 4書類とも`Prior1Year(Instant|Duration)`（連結）／`Prior1Year*_NonConsolidatedMember`（個別）に本表行あり（FR6-5の前期値はCSV内で完結）。

## DEI系メタの実在確認（要件 未決#4の解消）

**DEI行（jpdei_cor:*）は`jpcrp*.csv`内に27行存在**（4書類とも同一構成）。別ファイルではないため`parseEdinetCsvZip`の対象パターン拡張は**不要**（gov-clients無変更）。FR6-3のメタは**全項目CSV由来（経路非依存）で確定**:

| FR6-3項目 | DEI要素（実在値の例: S100YN9E） |
|---|---|
| edinet_code | `jpdei_cor:EDINETCodeDEI`（E02385） |
| sec_code | `jpdei_cor:SecurityCodeDEI`（79850。なしは「－」→null: S100YIZCで実証） |
| filer_name_ja | `jpdei_cor:FilerNameInJapaneseDEI`（ネポン株式会社） |
| filer_name_en | `jpdei_cor:FilerNameInEnglishDEI`（NEPON Inc.。**api_native**。値にHTML実体参照が混入する: MS&amp;AD→要デコード） |
| period_start / period_end | `jpdei_cor:CurrentFiscalYearStartDateDEI` / `jpdei_cor:CurrentPeriodEndDateDEI`（ISO日付） |
| accounting_standard補助 | `jpdei_cor:AccountingStandardsDEI`（"Japan GAAP" / "IFRS"） |
| 連結有無 | `jpdei_cor:WhetherConsolidatedFinancialStatementsArePreparedDEI`（true/false） |

## 様式判定手段（Step 1-5・非有報docIDの安全弁）

- `jpdei_cor:DocumentTypeDEI` = **「第三号様式」**（有報。4書類一致）。有報以外（半期=第五号様式等）はこの値で判定できる。
- 補助: zip内ファイル名 `jpcrp030000-asr-...csv`（`-asr-`=Annual Securities Report）。
- → 安全弁は「DocumentTypeDEIが取得でき、かつ『第三号様式』でない場合は`_error`（非課金）でスキップ。DEI自体が無い（jpcrp CSVなし等）場合は全null＋coverage 0で出力」で実装可能（推測判定なし）。

## 本表のコンテキスト実挙動

- 当期: `CurrentYearInstant`/`CurrentYearDuration`（連結）、`CurrentYear*_NonConsolidatedMember`（個別）。前期: `Prior1Year*`同型。**完全一致で採用**（`_RetainedEarningsMember`等の持分変動内訳・セグメントMember付きcontextを除外——#1のCONTEXT_BASIS方式の拡張）。
- 単位列は4書類とも本表行は「円」（生値）。#1と同じ乗数表（円/千円/百万円）で正規化。値なしは「－」。
- IFRS提出者でも個別財務諸表はJGAAP（jppfs・`*_NonConsolidatedMember`）で併記される（S100YNCJ/S100YN95で実証）→ 連結優先・基礎混在禁止の規律で自然に排除される。

## FR6-4 28フィールド × 要素IDマッピング表（実在確認済みIDのみ・優先順）

系統列: ○=当該fixtureで値取得可、null=候補なし（安全側）。

### balance_sheet（Instant・14）

| フィールド | 候補ID（優先順） | JGAAP個別 | JGAAP連結 | IFRS標準 | IFRS保険 |
|---|---|---|---|---|---|
| cash_and_deposits | jppfs_cor:CashAndDeposits → jpigp_cor:CashAndCashEquivalentsIFRS | ○ | ○ | ○ | ○ |
| current_assets | jppfs_cor:CurrentAssets → jpigp_cor:CurrentAssetsIFRS | ○ | ○ | ○ | null(無区分) |
| property_plant_and_equipment | jppfs_cor:PropertyPlantAndEquipment → jpigp_cor:PropertyPlantAndEquipmentIFRS | ○ | ○ | ○ | ○ |
| intangible_assets | jppfs_cor:IntangibleAssets → jpigp_cor:IntangibleAssetsIFRS | ○ | ○ | ○ | ○ |
| investments_and_other_assets | jppfs_cor:InvestmentsAndOtherAssets（JGAAPのみ・仕様どおり） | ○ | ○ | null | null |
| non_current_assets | jppfs_cor:NoncurrentAssets → jpigp_cor:NonCurrentAssetsIFRS | ○ | ○ | ○ | null(無区分) |
| total_assets | jppfs_cor:Assets → jpigp_cor:AssetsIFRS | ○ | ○ | ○ | ○ |
| current_liabilities | jppfs_cor:CurrentLiabilities → jpigp_cor:TotalCurrentLiabilitiesIFRS | ○ | ○ | ○ | null(無区分) |
| non_current_liabilities | jppfs_cor:NoncurrentLiabilities → jpigp_cor:NonCurrentLabilitiesIFRS（**タクソノミ側の綴りがLabilities**・実在確認済み） | ○ | ○ | ○ | null(無区分) |
| total_liabilities | jppfs_cor:Liabilities → jpigp_cor:LiabilitiesIFRS | ○ | ○ | ○ | ○ |
| share_capital | jppfs_cor:CapitalStock → jpigp_cor:ShareCapitalIFRS | ○ | ○ | ○ | ○ |
| retained_earnings | jppfs_cor:RetainedEarnings → jpigp_cor:RetainedEarningsIFRS | ○ | ○ | ○ | ○ |
| equity_attributable_to_owners_of_parent | jpigp_cor:EquityAttributableToOwnersOfParentIFRS（JGAAPは該当概念の単独要素なし——株主資本(ShareholdersEquity)はその他の包括利益累計額を含まず意味が異なるため**登録しない**） | null | null | ○ | ○ |
| net_assets | jppfs_cor:NetAssets → jpigp_cor:EquityIFRS | ○ | ○ | ○ | ○ |

### income_statement（Duration・10）

| フィールド | 候補ID（優先順） | JGAAP個別 | JGAAP連結 | IFRS標準 | IFRS保険 |
|---|---|---|---|---|---|
| net_sales | jppfs_cor:NetSales → jppfs_cor:OperatingRevenue1 → jpigp_cor:RevenueIFRS | ○ | ○ | ○ | null(保険収益様式) |
| cost_of_sales | jppfs_cor:CostOfSales → jpigp_cor:CostOfSalesIFRS | ○ | ○ | ○ | null |
| gross_profit | jppfs_cor:GrossProfit → jpigp_cor:GrossProfitIFRS | ○ | ○ | ○ | null |
| selling_general_and_administrative_expenses | jppfs_cor:SellingGeneralAndAdministrativeExpenses → jpigp_cor:SellingGeneralAndAdministrativeExpensesIFRS | ○ | ○ | ○ | null |
| operating_income | jppfs_cor:OperatingIncome → jpigp_cor:OperatingProfitLossIFRS | ○ | ○ | ○ | null |
| ordinary_income | jppfs_cor:OrdinaryIncome（JGAAPのみ・仕様どおり） | ○ | ○ | null | null |
| income_before_income_taxes | jppfs_cor:IncomeBeforeIncomeTaxes → jpigp_cor:ProfitLossBeforeTaxIFRS | ○ | ○ | ○ | ○ |
| income_taxes | jppfs_cor:IncomeTaxes → jpigp_cor:IncomeTaxExpenseIFRS | ○ | ○ | ○ | ○ |
| net_income | jppfs_cor:ProfitLoss → jpigp_cor:ProfitLossIFRS | ○ | ○ | ○ | ○ |
| net_income_attributable_to_owners_of_parent | jppfs_cor:ProfitLossAttributableToOwnersOfParent → jpigp_cor:ProfitLossAttributableToOwnersOfParentIFRS | null(個別) | ○ | ○ | ○ |

- 保険（S100YNCJ）のPL上段はIFRS17の保険収益様式＝標準のRevenueIFRS等が不在→null（安全側・要件Step 2-3どおり）。セグメント注記の`jpigp_cor:Revenue2IFRS`（収益）は実在するが**本表のPL行ではないため登録しない**（注記由来の値をnet_salesに流用しない）。

### cash_flow（4）

| フィールド | 候補ID（優先順） | JGAAP個別 | JGAAP連結 | IFRS標準 | IFRS保険 |
|---|---|---|---|---|---|
| net_cash_provided_by_operating_activities | jppfs_cor:NetCashProvidedByUsedInOperatingActivities → jpigp_cor:NetCashProvidedByUsedInOperatingActivitiesIFRS | ○ | ○ | ○ | ○ |
| net_cash_provided_by_investing_activities | jppfs_cor:NetCashProvidedByUsedInInvestmentActivities（JGAAPは**Investment**） → jpigp_cor:NetCashProvidedByUsedInInvestingActivitiesIFRS | ○ | ○ | ○ | ○ |
| net_cash_provided_by_financing_activities | jppfs_cor:NetCashProvidedByUsedInFinancingActivities → jpigp_cor:NetCashProvidedByUsedInFinancingActivitiesIFRS | ○ | ○ | ○ | ○ |
| cash_and_cash_equivalents_end（Instant） | jppfs_cor:CashAndCashEquivalents → jpigp_cor:CashAndCashEquivalentsIFRS | ○ | ○ | ○ | ○ |

### 系統別カバレッジ（当期・28フィールド）

- JGAAP個別（S100YIZC）: **26/28**（null: equity_attributable=概念なし・net_income_attributable=個別）
- JGAAP連結（S100YN9E）: **27/28**（null: equity_attributable）
- IFRS標準（S100YN95）: **26/28**（null: investments_and_other_assets・ordinary_income=いずれもIFRSに概念なし・仕様どおり）
- IFRS保険（S100YNCJ）: **17/28**（無区分BS 4項目・PL上段5項目・JGAAP専用2項目がnull=安全側で正）

28フィールド全てに実在確認済み候補が最低1つ存在（候補ゼロ＝null固定のフィールドはなし。ただし系統によりnullになるのは上表のとおり）。

## 会計基準の決定的導出（FR6-6）

採用行のタクソノミ系（jppfs→jgaap／jpigp→ifrs。jpigpが1つでもあればifrs）を第一、値ゼロ件時は`AccountingStandardsDEI`（"Japan GAAP"→jgaap／"IFRS"→ifrs／その他=US GAAP等→null）を補助とする。4fixtureでタクソノミ系とDEI表記の不一致なし。
