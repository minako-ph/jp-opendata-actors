/**
 * PPE課金ラッパ（引継書§7）。
 * - イベント名は要件書§7の4種で固定。独断で変えない。
 * - コードからの発火は必ずこのラッパ経由（テストでモック可能にするため）。
 * - 無料枠はApifyのPPE設定側で構成し、コードでは制御しない。
 * - 単価はApifyコンソール側のPPE定義が持つ。コード側は発火のみ。
 */

export const CHARGE_EVENTS = [
  'actor-start',
  'record-basic',
  'record-enriched',
  'article-translated',
] as const;

export type ChargeEvent = (typeof CHARGE_EVENTS)[number];

/** Apify SDK の Actor.charge 互換の注入点。actorのmainで実物を渡し、テストではモックを渡す。 */
export interface ChargeClient {
  charge(options: { eventName: string; count?: number }): Promise<unknown>;
}

export interface Billing {
  charge(event: ChargeEvent, count?: number): Promise<void>;
  /** イベント別の発火累計（監視・原価ログの入力） */
  totals(): Readonly<Record<ChargeEvent, number>>;
}

export function createBilling(client: ChargeClient): Billing {
  const totals: Record<ChargeEvent, number> = {
    'actor-start': 0,
    'record-basic': 0,
    'record-enriched': 0,
    'article-translated': 0,
  };

  return {
    async charge(event, count = 1) {
      if (count <= 0 || !Number.isInteger(count)) {
        throw new Error(`charge countは正の整数のみ: ${event} count=${count}`);
      }
      await client.charge({ eventName: event, count });
      totals[event] += count;
    },
    totals() {
      return { ...totals };
    },
  };
}
