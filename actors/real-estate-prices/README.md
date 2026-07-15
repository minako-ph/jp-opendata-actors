# Japan Real Estate Transaction Prices (MLIT Official)

Actual real estate transaction prices across Japan, in English and Japanese. This Actor reads the **official MLIT Real Estate Information Library API** (国土交通省 不動産情報ライブラリ) and returns quarterly japan property price data as clean, snake_case JSON with the Japanese originals in `*_ja` fields. **Official API based — no scraping.** **Zero setup**: no API key application on your side, no multi-day approval wait — press Start and get results. Covers both survey-based **transaction prices** (from 2005) and REINS-derived **contract (closed) prices** (from 2021), and can bundle municipality × quarter aggregates at no extra charge. Tested against frozen datasets on every release.

## What you get

One JSON item per transaction — real output from the Tokyo / Chiyoda dataset:

```json
{
  "record_type": "transaction",
  "price_category": "Contract Price Information",
  "price_category_ja": "成約価格情報",
  "property_type": "Pre-owned Condominiums, etc.",
  "property_type_ja": "中古マンション等",
  "prefecture": "Tokyo",
  "prefecture_ja": "東京都",
  "prefecture_code": "13",
  "municipality": "Chiyoda Ward",
  "municipality_ja": "千代田区",
  "municipality_code": "13101",
  "district_name": "Kojimachi",
  "district_name_ja": "麹町",
  "trade_price": 140000000,
  "area_sqm": 90,
  "floor_plan": "2LDK",
  "building_year": 1991,
  "structure": "SRC",
  "city_planning": "Commercial Zone",
  "period": "1st quarter 2024",
  "transaction_year": 2024,
  "transaction_quarter": 1,
  "unit_price_per_sqm": { "value": 1555556, "confidence": 1, "method": "rule" },
  "building_age_at_transaction": { "value": 33, "confidence": 1, "method": "rule" },
  "source": "reinfolib",
  "source_url": "https://www.reinfolib.mlit.go.jp/ex-api/external/XIT001?year=2024&area=13&city=13101&language=en",
  "retrieved_at": "2026-07-09T00:00:00+09:00",
  "attribution": "このサービスは、国土交通省不動産情報ライブラリのAPI機能を使用していますが、提供情報の最新性、正確性、完全性等が保証されたものではありません。",
  "schema_version": "0.1.0"
}
```

All 29 upstream fields are included (land shape, frontage, road, zoning, coverage/floor-area ratios, remarks, …). Derived metrics (`unit_price_per_sqm` = price ÷ area, `building_age_at_transaction`) are computed only when both inputs are clean numbers and are marked `method: "rule"` — never guessed from rounded or bracketed values. With `include_aggregates: true`, you also get `record_type: "aggregate"` rows with the **median price, median unit price and count per municipality and quarter, computed from the records fetched in this run** — free of charge.

## How to use

1. Pick a `year` and one or more `prefectures` (English names like `Tokyo`, Japanese names, or 2-digit codes). Optionally narrow by `cities` (names or 5-digit codes) or a 6-digit `station` code. The prefilled Tokyo/Chiyoda/2024 input returns results in seconds — just press **Start**.
2. Choose `price_category`: `transaction`, `closed` (contract prices), or `both` (default).
3. Read the results from the default dataset as JSON, CSV, or Excel.

## What this does NOT do

- **Not exhaustive.** Transaction prices come from MLIT's questionnaire survey of buyers; contract prices cover REINS-mediated deals from 2021 onward. Neither covers every transaction in Japan.
- **Transaction prices and contract prices differ in nature** — survey-based vs. transaction-system-based. `price_category` tells you which is which; interpret accordingly.
- **Prices and areas are rounded / bracketed by MLIT** for privacy (e.g. large sites appear as "2,000 m² or greater"). Bracketed values are returned as `null` in numeric fields — this Actor never converts them into fake numbers.
- No matching area for your query returns **0 records by upstream design** (the API answers 404 for empty result sets) — it is not an error.
- `station` accepts a 6-digit National Land Numerical Information station group code in v1; station **names** are not resolved.
- This is **not REINS itself** and not a valuation service; aggregates are computed from the records fetched in the run, not market-wide statistics.
- The upstream API may change or suspend service without notice (per its terms); we monitor with frozen-dataset regression tests.

## Pricing

Pay-per-event, fully transparent:

| Event              | Price                          |
| ------------------ | ------------------------------ |
| Actor start        | $0.02                          |
| Transaction record | $0.003                         |
| Aggregate rows     | free (with include_aggregates) |

Free allowance: **the first 50 transaction records of every run are free**. If your run hits the maximum charge limit you set, the Actor stops gracefully and keeps the partial results.

## Data source & attribution

Data comes from the [Real Estate Information Library](https://www.reinfolib.mlit.go.jp/) operated by Japan's Ministry of Land, Infrastructure, Transport and Tourism (MLIT). Attribution included with every item: このサービスは、国土交通省不動産情報ライブラリのAPI機能を使用していますが、提供情報の最新性、正確性、完全性等が保証されたものではありません。(This service uses the MLIT Real Estate Information Library API; the currency, accuracy and completeness of the information are not guaranteed.) Records are normalized and translated field-for-field by this Actor based on 不動産情報ライブラリ (国土交通省); this Actor is independent and not endorsed by MLIT. Contract price information originates from REINS data published by MLIT via Reins Market Information.

## More Japan data Actors

This Actor is part of a family of official-API-based Japan data Actors. See also [**Japan Company Filings (EDINET Official)**](https://apify.com/minako-ph/japan-edinet-filings) — structured financial filings of listed Japanese companies — and the developer profile for the full list as they are published.

## Contact

Found an issue or need a field the upstream API provides but this Actor doesn't expose yet? Open a ticket on the **Issues** tab — first response within 48 hours.
