# Apify Pay-per-event (PPE) 現行仕様調査（2026-07-07・未決#6）

一次情報: docs.apify.com・apify/apify-sdk-js・apify/actor-templates。

## 要点

1. **イベント定義はApifyコンソール**（Publication → Monetization → Actor pricing）。`.actor/actor.json` に課金フィールドは存在しない。`.actor/pay_per_event.json` はコンソールに貼るJSONスキーマのサンプル置き場という慣習（自動読込なし）。
2. **単価下限**: 強制される最低価格の記載なし（無料設定も可）。`apify-actor-start` のデフォルトは $0.00005。
3. **無料枠**: 「月間◯イベント無料」のコンソール設定機能は**確認できず**。公式ガイドは「無料提供分はREADME・入力スキーマで明示し、コード側でgraceful exit」という自前実装方針。→ **FR-C6（無料枠）と引継書§7「無料枠はApify PPE設定側で構成」は現行仕様と不整合の可能性**。コンソール実物で最終確認し、なければ無料枠はコード側実装に変更（要decisions更新）。
4. **発火API**: `Actor.charge({ eventName, count? })` → `{ eventChargeLimitReached, chargedCount, chargeableWithinLimit }`。SDKがrun毎の課金上限を自動追跡。非PPE実行では警告ログのみ。ローカルテスト: `ACTOR_TEST_PAY_PER_EVENT=true` / `ACTOR_USE_CHARGING_LOG_DATASET`。
5. **取り分**: 80%（手数料20%）。`profit = 0.8 * revenue - platform costs`。
6. **x402/agentic**: actor.jsonのフラグではない。①PPE ②limited permissions ③Standby不使用 の3条件を満たすと**自動的に**対象。`allowsAgenticUsers` はStore検索APIのフィルタパラメータ。→引継書§7の「actor.jsonのフラグ設定のみ」は実際には「3条件を満たす構成にする」と読み替える（追加開発禁止は維持）。

組み込みイベント: `apify-actor-start`（起動時。追加メモリ1GBごと課金）、`apify-default-dataset-item`（dataset書き込み毎・削除可）→ 要件書§7の独自 `actor-start` / `record-basic` との重複課金にならないようコンソール設定時に組み込み側を調整する。

主要URL:

- https://docs.apify.com/platform/actors/publishing/monetize/pay-per-event
- https://docs.apify.com/sdk/js/docs/concepts/pay-per-event
- https://docs.apify.com/platform/integrations/x402
- https://docs.apify.com/platform/actors/development/actor-definition/actor-json
- https://github.com/apify/apify-sdk-js/blob/master/src/charging.ts
