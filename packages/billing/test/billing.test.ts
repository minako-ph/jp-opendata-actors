import { describe, expect, it, vi } from 'vitest';
import { createBilling } from '../src/index.js';

describe('createBilling', () => {
  it('注入されたChargeClient経由でイベントを発火し、累計を記録する', async () => {
    const charge = vi.fn().mockResolvedValue(undefined);
    const billing = createBilling({ charge });

    await billing.charge('actor-start');
    await billing.charge('record-basic', 3);
    await billing.charge('record-basic', 2);

    expect(charge).toHaveBeenCalledWith({ eventName: 'actor-start', count: 1 });
    expect(charge).toHaveBeenCalledWith({ eventName: 'record-basic', count: 3 });
    expect(billing.totals()).toEqual({
      'actor-start': 1,
      'record-basic': 5,
      'record-enriched': 0,
      'article-translated': 0,
    });
  });

  it('countが正の整数でなければ発火せずエラー', async () => {
    const charge = vi.fn();
    const billing = createBilling({ charge });
    await expect(billing.charge('record-basic', 0)).rejects.toThrow(/正の整数/);
    await expect(billing.charge('record-basic', 1.5)).rejects.toThrow(/正の整数/);
    expect(charge).not.toHaveBeenCalled();
  });
});
