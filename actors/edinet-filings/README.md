# Japan Company Filings (EDINET Official)

Structured financial filings of Japanese listed companies, in English. This Actor reads the **official EDINET API** (Japan's Financial Services Agency disclosure system) and returns annual and semi-annual securities reports as clean, snake_case JSON — **parsed, analysis-ready fields, not just document download links**: key financials as numbers with normalized units and ISO dates, with the original Japanese preserved in `*_ja` fields. Optional English summaries are kept only after verbatim verification against the source text. **Official API based — no scraping**, no brittle selectors, no headless browsers. Tested against frozen datasets on every release.

## What you get

One JSON item per filing — real output for an actual annual report:

```json
{
  "doc_id": "S100YIZC",
  "edinet_code": "E04393",
  "sec_code": null,
  "corporate_number": "6250001009332",
  "filer_name_ja": "山口放送株式会社",
  "filer_name_en": null,
  "doc_type_code": "120",
  "doc_type": "Annual Securities Report",
  "is_amendment": false,
  "is_fund": false,
  "fund_code": null,
  "doc_description_ja": "有価証券報告書－第70期(2025/04/01－2026/03/31)",
  "period_start": "2025-04-01",
  "period_end": "2026-03-31",
  "submitted_at": "2026-06-30T09:00:00+09:00",
  "has_xbrl": true,
  "has_pdf": true,
  "has_csv": true,
  "financials": {
    "net_sales": 4928920000,
    "operating_income": 60234000,
    "ordinary_income": 126441000,
    "net_income": 100436000,
    "total_assets": 13533976000,
    "net_assets": 11726214000,
    "number_of_employees": 120,
    "financials_basis": "non_consolidated"
  },
  "source": "edinet",
  "source_url": "https://api.edinet-fsa.go.jp/api/v2/documents.json?date=2026-06-30&type=2",
  "retrieved_at": "2026-07-08T00:00:00+09:00",
  "attribution": "出典：金融庁 EDINET",
  "schema_version": "0.2.0"
}
```

`financials` come from EDINET's official CSV output, normalized to raw JPY. Values that a filing does not report (industry-specific formats, funds) are `null` rather than guessed, and `financials_basis` tells you whether figures are consolidated or parent-only.

With `enrich: true`, each filing also gets an `enriched` object with short **qualitative** English summaries generated from the filing's own text sections: `business_overview_en`, `key_risks_en`, and `segments_en` (2–3 sentences each), plus the `model` and `prompt_version` used. Summaries deliberately contain no figures — numbers stay in the structured `financials` fields. Every generated field carries `confidence` and `method: "llm"`; if a stray figure appears and does not verbatim-match the source text, the field is flagged with `verification_failed: true`. If summarization fails or the filing has no summarizable text (e.g. funds), you still get the basic record with `enriched: null` and are not charged the enriched event.

## How to use

1. Pick a submission-date range (`date_from` / `date_to`). The prefilled range returns results with the default settings — just press **Start**.
2. Optionally filter by document type, EDINET filer codes, or securities codes.
3. Read the results from the default dataset as JSON, CSV, or Excel.

## What this does NOT do

- **No full XBRL parsing.** Key financials are limited to what EDINET's official CSV output (type=5) provides. If you need the complete XBRL facts, download the XBRL packages directly from EDINET.
- **Fund disclosures are mixed in** on EDINET. Filter them out with `is_fund: false` if you only want operating companies.
- Data is organized by **submission date**, which differs from fiscal period ends.
- Coverage follows EDINET itself: roughly the past 10 years of documents.
- English summaries (when enabled) are reference information, **not investment advice**.

## Pricing

Pay-per-event, fully transparent:

| Event                    | Price                                     |
| ------------------------ | ----------------------------------------- |
| Actor start              | $0.02                                     |
| Filing record (basic)    | $0.005                                    |
| Filing record (enriched) | $0.079 — finalized from measured LLM cost |

Free allowance: **the first 3 documents of every run are free** — enough to evaluate the output, not enough to run a business on. If your run hits the maximum charge limit you set, the Actor stops gracefully and keeps the partial results.

## Data source & attribution

Data comes from the [EDINET API](https://disclosure2.edinet-fsa.go.jp/) operated by Japan's Financial Services Agency. Attribution included with every item: 出典：金融庁 EDINET (Source: Financial Services Agency, EDINET). This Actor is independent and is not endorsed by the FSA.

## More Japan data Actors

- [**Japan Financial Statements (EDINET Official)**](https://apify.com/minako-ph/japan-edinet-financials) — the numbers companion to this Actor: pass this Actor's `doc_id` values to it and get the full normalized balance sheet, income statement and cash flow with source element IDs. This Actor's `financials` are 7 headline KPIs; the companion returns the complete three statements — the two do not overlap.
- Part of a family of official-API-based Japan data Actors (subsidies & grants, real estate transaction prices, company enrichment, laws & regulations). See the developer profile for the full list as they are published.

## Contact

Found an issue or need a field that EDINET provides but this Actor doesn't expose yet? Open a ticket on the **Issues** tab — first response within 48 hours.
