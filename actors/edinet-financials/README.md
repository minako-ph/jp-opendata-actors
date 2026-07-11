# Japan Financial Statements (EDINET Official)

Normalized **balance sheet, income statement and cash-flow** figures of Japanese listed companies, in English, from the **official EDINET API** (Japan's Financial Services Agency disclosure system). One JSON record per annual securities report, with figures in raw JPY, both Japan GAAP and IFRS filers supported, and **the source XBRL element ID attached to every number** so you can verify each value against the filing. **Official API based — no scraping.** This Actor is the numbers companion to **Japan Company Filings (EDINET Official)**: use that Actor to **discover** filings (metadata, headline KPIs, English summaries), then pass its `doc_id` values here to get the **full normalized three statements** — the two Actors deliberately do not overlap, so you never pay twice for the same fields. Tested against frozen datasets on every release.

## What you get

One JSON item per annual report. Excerpt of a real item (the full item also includes the complete `prior_year` income statement / cash flow and one `element_map` entry per non-null value, prior year included):

```json
{
  "doc_id": "S100YN9E",
  "edinet_code": "E02385",
  "sec_code": "79850",
  "filer_name_ja": "ネポン株式会社",
  "filer_name_en": "NEPON Inc.",
  "period_start": "2025-04-01",
  "period_end": "2026-03-31",
  "accounting_standard": "jgaap",
  "basis": "consolidated",
  "balance_sheet": {
    "cash_and_deposits": 592590000,
    "current_assets": 4360065000,
    "property_plant_and_equipment": 960418000,
    "intangible_assets": 214045000,
    "investments_and_other_assets": 353130000,
    "non_current_assets": 1527594000,
    "total_assets": 5887660000,
    "current_liabilities": 2598697000,
    "non_current_liabilities": 845538000,
    "total_liabilities": 3444235000,
    "share_capital": 601424000,
    "retained_earnings": 1606358000,
    "equity_attributable_to_owners_of_parent": null,
    "net_assets": 2443424000
  },
  "income_statement": {
    "net_sales": 7417643000,
    "cost_of_sales": 4872682000,
    "gross_profit": 2544960000,
    "selling_general_and_administrative_expenses": 2474363000,
    "operating_income": 70597000,
    "ordinary_income": 78608000,
    "income_before_income_taxes": 62533000,
    "income_taxes": 24796000,
    "net_income": 37737000,
    "net_income_attributable_to_owners_of_parent": 37737000
  },
  "cash_flow": {
    "net_cash_provided_by_operating_activities": 385755000,
    "net_cash_provided_by_investing_activities": -120003000,
    "net_cash_provided_by_financing_activities": -185304000,
    "cash_and_cash_equivalents_end": 565590000
  },
  "prior_year": {
    "balance_sheet": { "total_assets": 6068175000, "net_assets": 2377042000 },
    "income_statement": { "net_sales": 7277473000, "net_income": -283546000 },
    "cash_flow": { "net_cash_provided_by_operating_activities": 170882000 }
  },
  "element_map": {
    "balance_sheet.total_assets": "jppfs_cor:Assets",
    "income_statement.net_sales": "jppfs_cor:NetSales",
    "cash_flow.net_cash_provided_by_operating_activities": "jppfs_cor:NetCashProvidedByUsedInOperatingActivities"
  },
  "coverage": { "mapped_fields": 27, "target_fields": 28 },
  "source": "edinet",
  "source_url": "https://api.edinet-fsa.go.jp/api/v2/documents/S100YN9E?type=5",
  "attribution": "出典：金融庁 EDINET",
  "schema_version": "0.1.0"
}
```

All figures are normalized to **raw JPY** from EDINET's official CSV output (type=5). `basis` tells you whether figures are consolidated or parent-only — the two are never mixed within one record. `accounting_standard` is derived deterministically from the taxonomy of the adopted elements (`jgaap` / `ifrs`). Field mapping is a fixed, hand-verified candidate list — **no LLM is involved anywhere**, values the filing does not report are `null`, never guessed, and `element_map` + `coverage` let you (or your agent) machine-verify every number against the source.

## How to use

1. Paste EDINET document IDs into `doc_ids` — for example straight from the `doc_id` field of the Japan Company Filings Actor. The prefilled IDs (one Japan GAAP consolidated filer, one IFRS filer) return results in seconds.
2. Or leave `doc_ids` empty and pick a submission-date range (`date_from` / `date_to`, up to 31 days, optionally filtered by `edinet_codes` / `sec_codes`) to process all annual reports submitted in the range.
3. Read the results from the default dataset as JSON, CSV, or Excel.

## What this does NOT do

- **Not a full XBRL parser.** Figures are limited to the facts included in EDINET's official CSV output (type=5). For the complete fact set, download the XBRL packages from EDINET.
- **Industry-specific statement formats** (banks, securities firms, insurers, etc.) can leave major items `null` — e.g. insurers under IFRS 17 report no `net_sales`/`gross_profit` line. Known coverage measured on real filings: standard Japan GAAP filers ≈26–27 of 28 fields, standard IFRS filers ≈26, insurance-format IFRS ≈17. `coverage` reports the per-record reality.
- **Fund disclosures are out of scope** (excluded in date-range runs; passing a fund doc_id yields an explicit non-billable error row).
- **Semi-annual reports (docTypeCode 160) are not supported** in v1 — annual securities reports (120, and 130 amendments when requested) only.
- **Prior-year figures are as restated in the current report** — they come from the same CSV's prior-year context, not from the previous year's original filing.
- Reference data, **not investment advice**.

## Pricing

Pay-per-event, fully transparent:

| Event                       | Price                                                        |
| --------------------------- | ------------------------------------------------------------ |
| Actor start                 | $0.02                                                        |
| Financial statements record | $0.03 — one company × one annual report, prior year included |

Free allowance: **the first 3 documents of every run are free** — enough to evaluate the output. Error rows (document not found, non-annual-report doc_ids, no CSV data) are never charged. If your run hits the maximum charge limit you set, the Actor stops gracefully and keeps the partial results.

## Data source & attribution

Data comes from the [EDINET API](https://disclosure2.edinet-fsa.go.jp/) operated by Japan's Financial Services Agency. Attribution included with every item: 出典：金融庁 EDINET (Source: Financial Services Agency, EDINET). This Actor is independent and is not endorsed by the FSA.

## More Japan data Actors

- **Japan Company Filings (EDINET Official)** — discover filings: submission metadata, headline KPIs (7 values), optional English summaries. Feed its `doc_id` output into this Actor.
- Part of a family of official-API-based Japan data Actors (subsidies & grants, real estate transaction prices, company enrichment, laws & regulations). See the developer profile for the full list.

## Contact

Found an issue or need a statement line that EDINET's CSV provides but this Actor doesn't expose yet? Open a ticket on the **Issues** tab — first response within 48 hours.
