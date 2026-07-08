import { describe, expect, it, vi } from 'vitest';
import { createBilling } from '../src/index.js';

describe('createBilling', () => {
  it('注入されたChargeClient経由でイベントを発火し、累計を記録する', async () => {
    const charge = vi.fn().mockResolvedValue({ eventChargeLimitReached: false, chargedCount: 3 });
    const billing = createBilling({ charge });

    const outcome = await billing.charge('record-basic', 3);
    expect(charge).toHaveBeenCalledWith({ eventName: 'record-basic', count: 3 });
    expect(outcome).toEqual({ charged: 3, free: 0, limitReached: false });
    expect(billing.totals()).toEqual({
      'record-basic': 3,
      'record-enriched': 0,
      'article-translated': 0,
    });
  });

  it('R2-3: 実行単位の無料枠。最初のN件はActor.chargeを呼ばない', async () => {
    const charge = vi.fn().mockResolvedValue(undefined);
    const billing = createBilling({ charge }, { freeAllowance: { 'record-basic': 3 } });

    // 1〜3件目: 無料（発火しない）
    for (let i = 0; i < 3; i++) {
      const outcome = await billing.charge('record-basic');
      expect(outcome).toEqual({ charged: 0, free: 1, limitReached: false });
    }
    expect(charge).not.toHaveBeenCalled();

    // 4件目から課金
    const outcome = await billing.charge('record-basic');
    expect(outcome).toEqual({ charged: 1, free: 0, limitReached: false });
    expect(charge).toHaveBeenCalledWith({ eventName: 'record-basic', count: 1 });
    expect(billing.freeUsed()['record-basic']).toBe(3);
    expect(billing.totals()['record-basic']).toBe(1);
  });

  it('無料枠をまたぐcountは無料分と課金分に分割する', async () => {
    const charge = vi.fn().mockResolvedValue({ chargedCount: 3 });
    const billing = createBilling({ charge }, { freeAllowance: { 'record-basic': 2 } });

    const outcome = await billing.charge('record-basic', 5);
    expect(outcome).toEqual({ charged: 3, free: 2, limitReached: false });
    expect(charge).toHaveBeenCalledWith({ eventName: 'record-basic', count: 3 });
  });

  it('R2-6: eventChargeLimitReachedを検知して返す（エラーにしない）', async () => {
    const charge = vi.fn().mockResolvedValue({ eventChargeLimitReached: true, chargedCount: 1 });
    const billing = createBilling({ charge });

    const outcome = await billing.charge('record-basic');
    expect(outcome.limitReached).toBe(true);
    expect(outcome.charged).toBe(1);
  });

  it('countが正の整数でなければ発火せずエラー', async () => {
    const charge = vi.fn();
    const billing = createBilling({ charge });
    await expect(billing.charge('record-basic', 0)).rejects.toThrow(/正の整数/);
    await expect(billing.charge('record-basic', 1.5)).rejects.toThrow(/正の整数/);
    expect(charge).not.toHaveBeenCalled();
  });
});
