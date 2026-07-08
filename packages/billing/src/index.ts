/**
 * PPE課金ラッパ（引継書§7、追補v1.1 R2-3/R2-5/R2-6で改訂）。
 * - Startイベントは合成 `apify-actor-start`（プラットフォームが自動課金）を使うため
 *   コードから発火しない（R2-5）。独自イベントは下記3種で固定。
 * - 無料枠は「実行単位の最初のN件」をコードで実装する（R2-3）。freeAllowance分は
 *   Actor.chargeを呼ばない。
 * - SDKのChargeResultを確認し、eventChargeLimitReached（ユーザー設定の課金上限到達）を
 *   呼び出し側へ返す。上限到達はエラーではなくgraceful打ち切りの契機（R2-6・FR-C8同思想）。
 */

export const CHARGE_EVENTS = ['record-basic', 'record-enriched', 'article-translated'] as const;

export type ChargeEvent = (typeof CHARGE_EVENTS)[number];

/** Apify SDK の Actor.charge が返す ChargeResult の必要最小面 */
export interface ChargeResultLike {
  eventChargeLimitReached?: boolean;
  chargedCount?: number;
}

/** Apify SDK の Actor.charge 互換の注入点。actorのmainで実物を渡し、テストではモックを渡す。 */
export interface ChargeClient {
  charge(options: {
    eventName: string;
    count?: number;
  }): Promise<ChargeResultLike | undefined | void>;
}

export interface ChargeOutcome {
  /** 実際に課金した件数（無料枠適用後） */
  charged: number;
  /** 無料枠として消化した件数 */
  free: number;
  /** ユーザー設定の課金上限に到達した（graceful打ち切りの契機。エラーではない） */
  limitReached: boolean;
}

export interface BillingOptions {
  /** 実行単位の無料枠（イベント別の最初のN件を課金しない。R2-3） */
  freeAllowance?: Partial<Record<ChargeEvent, number>>;
}

export interface Billing {
  charge(event: ChargeEvent, count?: number): Promise<ChargeOutcome>;
  /** イベント別の課金累計（監視・原価ログの入力） */
  totals(): Readonly<Record<ChargeEvent, number>>;
  /** イベント別の無料枠消化数 */
  freeUsed(): Readonly<Record<ChargeEvent, number>>;
}

function zeroCounts(): Record<ChargeEvent, number> {
  return { 'record-basic': 0, 'record-enriched': 0, 'article-translated': 0 };
}

export function createBilling(client: ChargeClient, options?: BillingOptions): Billing {
  const totals = zeroCounts();
  const freeUsed = zeroCounts();
  const allowance = options?.freeAllowance ?? {};

  return {
    async charge(event, count = 1) {
      if (count <= 0 || !Number.isInteger(count)) {
        throw new Error(`charge countは正の整数のみ: ${event} count=${count}`);
      }
      const remainingFree = Math.max(0, (allowance[event] ?? 0) - freeUsed[event]);
      const free = Math.min(remainingFree, count);
      const toCharge = count - free;
      freeUsed[event] += free;

      if (toCharge === 0) {
        return { charged: 0, free, limitReached: false };
      }
      const result = await client.charge({ eventName: event, count: toCharge });
      const charged = result?.chargedCount ?? toCharge;
      totals[event] += charged;
      return { charged, free, limitReached: result?.eventChargeLimitReached === true };
    },
    totals() {
      return { ...totals };
    },
    freeUsed() {
      return { ...freeUsed };
    },
  };
}
