# Japan Company Filings (EDINET Official)

Structured financial filings of Japanese listed companies, in English. This Actor reads the **official EDINET API** (Japan's Financial Services Agency disclosure system) and returns annual and semi-annual securities reports as clean, snake_case JSON — filing metadata plus key financials, with the original Japanese preserved in `*_ja` fields. **Official API based — no scraping**, no brittle selectors, no headless browsers. Tested against frozen datasets on every release.

## What you get

One JSON item per filing. Example (illustrative):

```json
{
  "doc_id": "S100XXA1",
  "edinet_code": "E00001",
  "sec_code": "13010",
  "corporate_number": "6000012010023",
  "filer_name_ja": "架空電機株式会社",
  "filer_name_en": null,
  "doc_type_code": "120",
  "doc_type": "Annual Securities Report",
  "is_amendment": false,
  "is_fund": false,
  "doc_description_ja": "有価証券報告書－第100期(2025/04/01－2026/03/31)",
  "period_start": "2025-04-01",
  "period_end": "2026-03-31",
  "submitted_at": "2026-06-30T09:01:00+09:00",
  "has_xbrl": true,
  "has_pdf": true,
  "has_csv": true,
  "source": "edinet",
  "source_url": "https://api.edinet-fsa.go.jp/api/v2/documents.json?date=2026-06-30&type=2",
  "retrieved_at": "2026-07-07T00:00:00+09:00",
  "attribution": "出典：金融庁 EDINET",
  "schema_version": "0.1.0"
}
```

With `enrich: true`, each filing also gets short English summaries (business overview, key risks, segment structure). Every generated field carries `confidence` and `method`, and proper nouns / figures are kept only if they verbatim-match the source text — otherwise they are set to `null` and flagged.

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

| Event                    | Price  |
| ------------------------ | ------ |
| Actor start              | $0.02  |
| Filing record (basic)    | $0.005 |
| Filing record (enriched) | $0.049 |

Free monthly allowance: 20 documents — enough to evaluate the output, not enough to run a business on.

## Data source & attribution

Data comes from the [EDINET API](https://disclosure2.edinet-fsa.go.jp/) operated by Japan's Financial Services Agency. Attribution included with every item: 出典：金融庁 EDINET (Source: Financial Services Agency, EDINET). This Actor is independent and is not endorsed by the FSA.

## More Japan data Actors

This Actor is part of a family of official-API-based Japan data Actors (subsidies & grants, real estate transaction prices, company enrichment, laws & regulations). See the developer profile for the full list as they are published.

## Contact

Found an issue or need a field that EDINET provides but this Actor doesn't expose yet? Open a ticket on the **Issues** tab — first response within 48 hours.
