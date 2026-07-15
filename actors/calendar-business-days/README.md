# Japan Business Days & Calendar (Cabinet Office Official)

Japan business days API for developers and AI agents: check, add and count business days with Japanese national holidays, custom company closures, and wareki (Japanese era) conversion in both directions. All answers are computed from the **official Cabinet Office (内閣府) "国民の祝日" holiday data**, bundled into the Actor at build time — **official data based, no scraping, no external calls at run time**, so results are deterministic and the Actor keeps working even when websites change. It parses Japanese era dates in the notations people actually write (令和8年7月11日 / R8.7.11 / reiwa 8), handles the 2019 Heisei→Reiwa era boundary correctly, and refuses to guess outside its recorded data range. Tested against frozen datasets on every release.

## What you get

One JSON record per input item. Real output for the era-boundary pair — the last day of Heisei and the first day of Reiwa (both public holidays in 2019):

```json
{
  "operation": "date_info",
  "date": "2019-04-30",
  "weekday": "tuesday",
  "weekday_ja": "火",
  "wareki": {
    "era": "heisei",
    "era_ja": "平成",
    "year": 31,
    "is_first_year": false,
    "formatted_ja": "平成31年4月30日"
  },
  "is_holiday": true,
  "holiday_name_ja": "休日",
  "holiday_name_en": "Public Holiday",
  "is_business_day": false,
  "non_business_reason": "national_holiday",
  "fiscal_year": 2019,
  "is_leap_year": false,
  "note": null,
  "source": "cao_holidays",
  "source_url": "https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv",
  "retrieved_at": "2026-07-13T00:00:00.000Z",
  "attribution": "出典：内閣府「国民の祝日」",
  "schema_version": "0.1.0"
}
```

```json
{
  "operation": "date_info",
  "date": "2019-05-01",
  "weekday": "wednesday",
  "wareki": {
    "era": "reiwa",
    "era_ja": "令和",
    "year": 1,
    "is_first_year": true,
    "formatted_ja": "令和元年5月1日"
  },
  "is_holiday": true,
  "holiday_name_ja": "休日（祝日扱い）",
  "is_business_day": false,
  "non_business_reason": "national_holiday",
  "fiscal_year": 2019,
  "is_leap_year": false
}
```

(second record abbreviated — every record carries the same full field set and attribution metadata)

Six operations, selected by the `operation` input:

- `date_info` — weekday, wareki, holiday, business-day status, Japanese fiscal year (April start) and leap year for each date
- `wareki_to_western` — parse Japanese era dates (kanji, abbreviated, romaji; year-only inputs return the era year's date range)
- `holidays` — national holidays of the given years, one record per holiday, English names included
- `holidays_next` — the next national holiday on or after `from_date` (defaults to today JST), with `days_until`
- `business_days_add` — the date N business days later (negative N goes backwards)
- `business_days_count` — business days between two dates, both ends included

`weekend_days` (default Saturday/Sunday), `include_national_holidays` (default true) and `extra_holidays` (your own company closures, up to 100 dates) apply to the business-day operations. Non-business reasons are judged in the order weekend → national_holiday → extra_holiday.

## How to use

1. Press **Start** — the prefilled input describes four dates: the 2019 era boundary pair, a substitute holiday and a regular weekday. First results arrive in seconds.
2. Switch `operation` and fill the matching input list (`dates`, `wareki_strings`, `years`, `from_date`, `items`, or `ranges`).
3. Read results from the default dataset as JSON/CSV, or call the Actor from your code / an AI agent via the Apify API (`run-sync-get-dataset-items` for synchronous use).

Invalid items (unparseable dates, out-of-range years) do not fail the run: each produces a per-item `_error` record — free of charge — and processing continues. Up to 1,000 input items per run.

## What this does NOT do

- **If you only need a list of holidays, you may not need a paid Actor at all**: free alternatives exist (Nager.Date-based holiday Actors covering 100+ countries, and the Cabinet Office open-data CSV itself). This Actor's value is the combination of business-day arithmetic, wareki parsing with real-world notation variants, and custom company closures on top of the official data.
- No dates before **1873-01-01** (Japan used a lunisolar calendar before adopting the Gregorian calendar; naive conversion would be historically wrong).
- No holiday or business-day answers **outside the recorded data range** (currently 1955–2027, machine-derived from the official CSV). Out-of-range items return an explicit error with the covered range — never a guess.
- No rokuyō (六曜), sekki (二十四節気) or other almanac data. No company/corporate data (see the family Actors below).
- Holiday **English names are this Actor's reference translations** — no official English names exist.
- It does not predict your company's closures — pass them in via `extra_holidays`.

## Pricing

Pay per event: **$0.003 per result record** plus $0.02 per Actor start. The **first 50 records of every run are free**, and `_error` records are never charged. There are no LLM or proxy costs behind this Actor, so pricing is flat and predictable.

## Data source & attribution

- Source: Cabinet Office of Japan, ["国民の祝日" (national holidays) open data](https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html) (CC-BY, via the official CSV).
- Every record carries `attribution: 出典：内閣府「国民の祝日」`.
- The holiday snapshot is refreshed through a reviewed manual pipeline when the Cabinet Office publishes new years. **National holidays can change by legislation** (as happened for the Tokyo 2020 Olympics); the data follows the official source.
- No uptime/SLA figures are promised; the Actor is deterministic and has no runtime network dependencies.

## More Japan data Actors

This Actor is part of a family of official-data-based Japan Actors. Typical combo: pull tender deadlines with [**Japan Government Tenders Scraper + AI Extraction**](https://apify.com/minako-ph/japan-tender-scraper) and count the remaining business days to each deadline with this Actor. See also [**Japan Company Filings (EDINET Official)**](https://apify.com/minako-ph/japan-edinet-filings) — structured financial filings of listed Japanese companies — and the developer profile for the full list as they are published.

## Contact

Found an issue or a notation this Actor should parse but doesn't? Open a ticket on the **Issues** tab — first response within 48 hours.
