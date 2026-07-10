# Japan Subsidies & Grants Data (Official)

Which Japanese companies received which government subsidies — as clean JSON. This Actor reads the **official gBizINFO API** (経済産業省 Gビズインフォ) operated by Japan's Ministry of Economy, Trade and Industry and returns japan subsidies data / japanese government grants records by corporate number, by company name, or across companies by granting ministry. **Official API based — no scraping.** Ministry names are translated to their official English names by dictionary; amounts and dates are normalized. No LLM is involved anywhere in this Actor. Tested against frozen datasets on every release.

## What you get

One JSON item per subsidy record — real output for Hitachi, Ltd. (corporate number 7010001008844):

```json
{
  "record_type": "subsidy",
  "title_ja": "令和４年度固定価格買取制度等の効率的・安定的な運用のための業務（ＲＰＳ管理システム運用業務）",
  "ministry": "Agency for Natural Resources and Energy",
  "ministry_ja": "資源エネルギー庁",
  "amount_jpy": 76846429,
  "date_of_approval": "2022-04-01",
  "target_ja": null,
  "recipient_corporate_number": "7010001008844",
  "recipient_name": "Hitachi, Ltd.",
  "recipient_name_ja": "株式会社日立製作所",
  "recipient_location_ja": "東京都千代田区丸の内１丁目６番６号",
  "name_resolution": null,
  "source": "gbizinfo",
  "source_url": "https://api.info.gbiz.go.jp/hojin/v2/hojin/7010001008844/subsidy",
  "retrieved_at": "2026-07-10T00:00:00+09:00",
  "attribution": "出典：経済産業省 Gビズインフォ",
  "schema_version": "0.1.0"
}
```

`recipient_name` is the English name registered in gBizINFO (`null` when the registry has none — it is never machine-generated). When you search by `company_names`, each record carries `name_resolution` with the input name and the match confidence (`exact` / `selected`); ambiguous or unmatched names are reported as non-billable rows instead of being guessed.

## How to use

1. Enter 13-digit `corporate_numbers` (法人番号) — the prefilled Hitachi example returns results in seconds. Or enter Japanese `company_names`, resolved via the official National Tax Agency corporate number registry. Or set `ministry` (e.g. 経済産業省 or "Ministry of Economy, Trade and Industry") for a cross-company search of subsidy recipients.
2. Optionally narrow by approval date with `date_from` / `date_to` (YYYY-MM-DD).
3. Read the results from the default dataset as JSON, CSV, or Excel.

## What this does NOT do

- **Not exhaustive.** gBizINFO lists only subsidies that each ministry has agreed to publish. Absence of a record does not mean a company received no subsidies.
- **Data freeze period**: upstream data collection was frozen between June 2025 and January 2026 during the gBizINFO system migration; records from that window may be missing or delayed.
- **Subsidy titles are Japanese only** (`title_ja`). This Actor uses no LLM, so free-text titles are not translated. Ministry names are translated by a fixed dictionary of official English names; agencies outside the dictionary return `ministry: null` with the Japanese original preserved.
- **jGrants origin is not identifiable.** Whether a record originally came through the jGrants application system is not distinguishable in the gBizINFO v2 data, so no such flag is provided.
- Cross-company search requires a `ministry` in v1, and date filters are applied client-side to the approval date (the upstream API cannot filter subsidies by date).

<!-- TODO(国税庁ID到着後に次の1行を除去し、input_schema.jsonのcompany_names説明の「TEMPORARILY UNAVAILABLE」前置きも元に戻す): -->

- **`company_names` is temporarily unavailable**: the National Tax Agency Web-API credential for name resolution is pending issuance. Runs using `company_names` currently fail with a clear error — use `corporate_numbers` instead.
- `company_names` resolution needs the National Tax Agency Web-API (operator-side credential). Names that resolve ambiguously are reported, never guessed.
- The upstream API may change or suspend service without notice; we monitor with frozen-dataset regression tests.

## Pricing

Pay-per-event, fully transparent:

| Event          | Price  |
| -------------- | ------ |
| Actor start    | $0.02  |
| Subsidy record | $0.004 |

Free allowance: **the first 50 subsidy records of every run are free**. Per-run limits: up to 500 companies, or 500 records for a cross-company search. If your run hits the maximum charge limit you set, the Actor stops gracefully and keeps the partial results.

## Data source & attribution

Data comes from [gBizINFO](https://info.gbiz.go.jp/) operated by Japan's Ministry of Economy, Trade and Industry, used under the Government of Japan Standard Terms of Use (v2.0). Attribution included with every item: 出典：経済産業省 Gビズインフォ (Source: METI gBizINFO). Company name resolution uses the National Tax Agency Corporate Number System Web-API; このサービスは、国税庁法人番号システムのWeb-API機能を利用して取得した情報をもとに作成しているが、サービスの内容は国税庁によって保証されたものではない. This Actor is independent and not endorsed by METI or the NTA.

## 日本語のご案内

日本の補助金採択データ（Gビズインフォ掲載分）を、法人番号・会社名・府省名から JSON で取得できる Apify Actor です。営業リスト作成や与信・市場調査で「どの企業がどの補助金を受けたか」を機械可読で必要とする方向けです。入札・調達情報については、姉妹プロダクトの入札インテリジェンス Actor もご覧ください。

## More Japan data Actors

This Actor is part of a family of official-API-based Japan data Actors. See also **Japan Company Filings (EDINET Official)** — structured financial filings of listed Japanese companies — and **Japan Real Estate Transaction Prices (MLIT Official)** — actual quarterly transaction prices across Japan. Check the developer profile for the full list as they are published.

## Contact

Found an issue or need a field the upstream API provides but this Actor doesn't expose yet? Open a ticket on the **Issues** tab — first response within 48 hours.
