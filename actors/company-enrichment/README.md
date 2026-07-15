# Japan Company Data Enrichment (Official Registry)

Corporate number lookup and firmographics for Japanese companies, in English. This Actor calls the **official gBizINFO API** (経済産業省 Gビズインフォ) and the **National Tax Agency corporate number registry** (法人番号 / houjin bangou) directly — **official API based, not a scraper**: no page-by-page crawling, no polite-bot throttling, no HTML parsing to break when a portal changes. It returns japan company registry data — capital, employees, establishment date, industry, subsidies, procurement and patent counts — as clean, snake_case JSON. Name resolution goes deeper than a plain registry wrap: company names are resolved to corporate numbers via the NTA registry with an explicit confidence verdict (`exact` / `selected` / `ambiguous` / `not_found` in `name_resolution`), and companies missing from gBizINFO are still returned via a documented NTA-registry fallback row (clearly marked `source: houjin`) instead of being silently dropped. English company names come from the official registry only (`name_en_method: "api_native"`) — **never invented**; where no registered English name exists the field is an honest `null`, and the optional LLM enrichment is clearly labeled and verified against the source. Every release is tested against frozen datasets with per-field golden verification.

## What you get

One JSON item per company — real output for Hitachi, Ltd. (corporate number 7010001008844):

```json
{
  "record_type": "company",
  "corporate_number": "7010001008844",
  "name_en": "Hitachi, Ltd.",
  "name_en_method": "api_native",
  "name_ja": "株式会社日立製作所",
  "name_kana": "ヒタチセイサクショ",
  "address_ja": "東京都千代田区丸の内１丁目６番６号",
  "postal_code": "1000005",
  "prefecture": "Tokyo",
  "prefecture_ja": "東京都",
  "representative_name_ja": "執行役社長兼CEO　德永　俊昭",
  "capital_stock_jpy": 466666000000,
  "employee_number": 35631,
  "date_of_establishment": "1920-02-01",
  "business_summary_ja": "デジタルシステム&サービス分野における事業、エナジー分野における事業…",
  "industry": ["Manufacturing"],
  "industry_codes": ["E"],
  "company_url": "http://www.hitachi.co.jp",
  "has_subsidy": true,
  "subsidy_count": 5,
  "has_procurement": true,
  "procurement_count": 423,
  "patent_count": 19950,
  "name_resolution": null,
  "source": "gbizinfo",
  "source_url": "https://api.info.gbiz.go.jp/hojin/v2/hojin/7010001008844",
  "retrieved_at": "2026-07-10T00:00:00+09:00",
  "attribution": "出典：経済産業省 Gビズインフォ",
  "schema_version": "0.1.0"
}
```

With `enrich: true`, each item also carries an `enriched` block: `business_summary_en` (one English sentence, no figures, flagged if any number cannot be verified against the source) and `name_en` (romanized transliteration, generated **only when no official English name is registered**, marked `method: "llm"` with the model's own confidence). Every generated field carries `confidence` and `method` (`api_native` / `rule` / `llm`).

## How to use

1. Enter 13-digit `corporate_numbers` (法人番号) — the prefilled Hitachi example returns results in seconds. Or enter Japanese `company_names`, resolved via the official National Tax Agency registry (unambiguous matches only).
2. Pick `fields` to control which activity blocks are fetched (`subsidies`, `procurement`, `patents`). Patent responses can be tens of MB for large corporations — drop `patents` for faster runs.
3. Optionally set `enrich: true` for the English one-liner and name transliteration.
4. Read the results from the default dataset as JSON, CSV, or Excel.

## What this does NOT do

- **Coverage is gBizINFO's ~4 million corporations**, and its activity data (subsidies, procurement, patents) covers only what each ministry publishes — not everything. Companies outside gBizINFO fall back to the National Tax Agency corporate number registry: you still get a billable row with the registry basics (name, address, corporate number; `source: "houjin"`), while gBizINFO-derived fields are `null`. Numbers found in neither source are reported as explicit non-billable error rows.
- **English names are never guessed in the basic output.** `name_en` is the officially registered English name or `null`. The LLM transliteration (enriched only) is machine-generated, cannot be verbatim-verified by construction, and is labeled `method: "llm"` — treat it as a reading aid, not an official name.
- **Address romanization stops at the prefecture** (rule-based, 47-prefecture table). Full street addresses are provided in Japanese only — no guessed romanization.
- `industry` translates JSIC division codes; `business_item_codes` are qualification item codes kept as-is (upstream provides no names).
- `company_names` resolution needs the National Tax Agency Web-API (operator-side credential) and accepts only unambiguous matches; ambiguous names are reported with candidate counts, never guessed.
- The English business summary (enriched) contains no figures by design — numeric facts come from the structured fields.
- The upstream APIs may change or suspend service without notice; we monitor with frozen-dataset regression tests.

## Pricing

Pay-per-event, fully transparent:

| Event                  | Price               |
| ---------------------- | ------------------- |
| Actor start            | $0.02               |
| Company record (basic) | $0.006              |
| Enriched company       | $0.019 (LLM output) |

Free allowance: **the first 20 companies of every run are free** (basic records; enriched records are always billed). Per-run limit: 1,000 companies. If your run hits the maximum charge limit you set, the Actor stops gracefully and keeps the partial results.

## Data source & attribution

Data comes from [gBizINFO](https://info.gbiz.go.jp/) operated by Japan's Ministry of Economy, Trade and Industry, used under the Government of Japan Standard Terms of Use (v2.0): 出典：経済産業省 Gビズインフォ (Source: METI gBizINFO). Company name resolution uses the National Tax Agency Corporate Number System Web-API: このサービスは、国税庁法人番号システムのWeb-API機能を利用して取得した情報をもとに作成しているが、サービスの内容は国税庁によって保証されたものではない. This Actor is independent and not endorsed by METI or the NTA.

## More Japan data Actors

This Actor is part of a family of official-API-based Japan data Actors. See also **Japan Company Filings (EDINET Official)** — structured financial filings of listed Japanese companies —, **Japan Subsidies & Grants Data (Official)** — which Japanese companies received which subsidies —, and **Japan Real Estate Transaction Prices (MLIT Official)**. Check the developer profile for the full list.

## Contact

Found an issue or need a field the upstream API provides but this Actor doesn't expose yet? Open a ticket on the **Issues** tab — first response within 48 hours.
