# #6 README追記: US-GAAP非対応の明示（公開前・競合スキャン反映）2026-07-15

## 背景
公開前のStore競合スキャン（`japan financial statements` / `edinet`）を実施。
- Apify上に「EDINET財務三表を正規化数値で返す」直接competitorは実質不在（競合はファイルDL系 rationalistic_counsel か、Apify外の edinet-tools/edinet-mcp/Axiora）。
- ただし Apify外の競合（edinet-tools等）は **J-GAAP / IFRS / US-GAAP の3標準対応**を謳う。当社#6は **JGAAP / IFRS の2標準**。この差を正直に明示するのが誠実（marketing.md「正直明記」方針）。

## 実装で確認したUS-GAAP文書の実挙動（憶測ではなく実コード確認済み）
- 会計基準判定（statements.ts:301）: `usedJpigp ? 'ifrs' : usedJppfs ? 'jgaap' : null`。US-GAAP文書は jppfs も jpigp も無いため **`accounting_standard: null`**。
- DEI判定（transform.ts:75-76）: 「Japan GAAP」→jgaap /「IFRS」→ifrs、それ以外（US-GAAP含む）は該当なし。
- 結果: US-GAAP有報は **エラーで落ちない**（有報=第三号様式なので処理継続）が、財務フィールド抽出行がゼロ → **各財務フィールドは null・`accounting_standard: null`・`coverage: { mapped_fields: 0, target_fields: 28 }`**。
- 重要: **課金は発生する**（record-basic は push 時点で発火。有報として処理は成立するため）。→ ユーザーがUS-GAAP企業を知らずに投げると空レコードに課金される。だからREADME明示に価値がある。

## FIX-1: README「What this does NOT do」節にUS-GAAP除外を1項目追加
対象: `actors/edinet-financials/README.md` の `## What this does NOT do` 節。

追記する項目（実装挙動に忠実。文面は既存の箇条書きトーンに合わせて調整可。ただし下記の事実は変えないこと）:
```
- **US-GAAP filers are out of scope.** A small number of Japanese companies (mostly historically NYSE-listed firms) still file under US-GAAP. This Actor maps Japan GAAP and IFRS taxonomies only; a US-GAAP annual report is not rejected, but its financial fields come back `null` with `accounting_standard: null` and `coverage.mapped_fields: 0`. Check `accounting_standard` before relying on the numbers. (Note: such a document is still a billable `record-basic`, since it is a valid annual report.)
```

上記の各主張が実装と一致することを確認してから書くこと（既に確認済みだが、Claude Code側でも statements.ts / transform.ts / run.ts で再確認）。特に「課金される（billable record-basic）」の記述は、run.ts の charge('record-basic') 発火経路がUS-GAAP（null標準）レコードでも通ることを確認した上で残す。もし実装上US-GAAPレコードが _error（非課金）でスキップされるなら、その事実に文面を合わせること（＝実装優先）。

## 完了条件
1. `actors/edinet-financials/README.md` の NOT do 節にUS-GAAP除外項目が追加されている。
2. 記述内容が実装（accounting_standard null / フィールドnull / coverage 0 / 課金有無）と一致。実装と食い違う表現は実装に合わせて修正。
3. 第1段落以降の他部分（What you get・Pricing・Hitachi/ネポン実例等）は変更しない。
4. `docs/decisions.md` 先頭に1行: 「- 2026-07-15 #6公開前 競合スキャン（Apify直接競合は実質不在・Apify外 edinet-tools等が3標準対応）反映。READMEのNOT do節にUS-GAAP非対応を明示（JGAAP/IFRS 2標準のみ・US-GAAP文書はnull返し＋課金の実挙動を正直記載。review-2026-07-15-actor6-usgaap FIX-1）」
5. CI green（README変更のみ・テスト影響なしのはずだが確認）・push。

## やらないこと
- US-GAAP対応の実装を追加しない（今回はREADME明示のみ。スコープ拡大しない）。
- 実装に無い挙動・持っていない性能を書かない。US-GAAP時の挙動は上記の実確認どおりに書く。
- 価格・PPEイベント・スキーマ・第1段落を変更しない。
- 競合の固有名（edinet-tools等）をREADMEに書かない（自社の性質のみ述べる）。
