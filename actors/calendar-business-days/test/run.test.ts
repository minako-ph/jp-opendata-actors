import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { expectGolden } from '@jp-opendata/testing';
import { createBilling } from '@jp-opendata/billing';
import { RunFailedError, runCalendarBusinessDays, type RunLogger } from '../src/run.js';

const here = dirname(fileURLToPath(import.meta.url));
const goldenDir = join(here, 'golden');

/** 決定化: goldenはtoday固定（2026-07-13）・retrievedAt固定で生成する（N7-4） */
const TODAY = { year: 2026, month: 7, day: 13 };
const RETRIEVED_AT = '2026-07-13T00:00:00.000Z';

function makeDeps(freeAllowance?: number) {
  const pushed: Record<string, unknown>[] = [];
  const warnings: string[] = [];
  const charge = vi.fn().mockResolvedValue(undefined);
  const alert = vi.fn().mockResolvedValue(undefined);
  const log: RunLogger = {
    info: () => undefined,
    warning: (m) => {
      warnings.push(m);
    },
    error: () => undefined,
  };
  const deps = {
    billing: createBilling(
      { charge },
      freeAllowance === undefined
        ? undefined
        : { freeAllowance: { 'record-basic': freeAllowance } },
    ),
    pushData: async (item: Record<string, unknown>) => {
      pushed.push(item);
    },
    log,
    retrievedAt: RETRIEVED_AT,
    today: TODAY,
    alert,
  };
  return { deps, pushed, warnings, charge, alert };
}

describe('runCalendarBusinessDays: golden 6系統＋境界（N7-4）', () => {
  it('date_info: prefill4日付（改元境界2019-04-30/05-01・振替休日2026-05-06・平日）', async () => {
    const { deps, pushed, charge } = makeDeps();
    const summary = await runCalendarBusinessDays(
      {
        operation: 'date_info',
        dates: ['2019-04-30', '2019-05-01', '2026-05-06', '2026-07-13'],
      },
      deps,
    );
    expect(summary.records_pushed).toBe(4);
    expect(summary.record_errors).toBe(0);
    expect(charge).toHaveBeenCalledTimes(4);
    expectGolden(goldenDir, 'run.date-info.prefill.json', pushed);
  });

  it('date_info: weekend_daysカスタム＋収録範囲外・実在しない日付の_error（非課金）', async () => {
    const { deps, pushed, charge } = makeDeps();
    const summary = await runCalendarBusinessDays(
      {
        operation: 'date_info',
        dates: ['2026-07-11', '1954-12-31', '2026-02-30'],
        weekend_days: ['sunday'],
      },
      deps,
    );
    expect(summary.records_pushed).toBe(1);
    expect(summary.record_errors).toBe(2);
    // _errorレコードは非課金（FR-C8）
    expect(charge).toHaveBeenCalledTimes(1);
    expectGolden(goldenDir, 'run.date-info.custom-weekend.json', pushed);
  });

  it('wareki_to_western: 表記ゆれ3形式＋年のみ＋境界エラー2種', async () => {
    const { deps, pushed, charge } = makeDeps();
    const summary = await runCalendarBusinessDays(
      {
        operation: 'wareki_to_western',
        wareki_strings: [
          '令和8年7月11日',
          'R8.7.11',
          'reiwa 8',
          '令和元年',
          '平成31年5月1日',
          'そもそも日付でない',
        ],
      },
      deps,
    );
    expect(summary.records_pushed).toBe(4);
    expect(summary.record_errors).toBe(2);
    expect(charge).toHaveBeenCalledTimes(4);
    expectGolden(goldenDir, 'run.wareki.json', pushed);
  });

  it('holidays: 改元年2019は22件（1祝日=1レコード・全件課金）＋範囲外年の_error', async () => {
    const { deps, pushed, charge } = makeDeps();
    const summary = await runCalendarBusinessDays(
      { operation: 'holidays', years: [2019, 1954] },
      deps,
    );
    expect(summary.records_pushed).toBe(22);
    expect(summary.record_errors).toBe(1);
    expect(charge).toHaveBeenCalledTimes(22);
    expectGolden(goldenDir, 'run.holidays.2019.json', pushed);
  });

  it('holidays_next: from_date明示で決定化（2026-07-13 → 海の日）', async () => {
    const { deps, pushed } = makeDeps();
    const summary = await runCalendarBusinessDays(
      { operation: 'holidays_next', from_date: '2026-07-13' },
      deps,
    );
    expect(summary.records_pushed).toBe(1);
    expectGolden(goldenDir, 'run.holidays-next.json', pushed);
  });

  it('business_days_add: 連休跨ぎ・負値・days=0・収録範囲外の_error', async () => {
    const { deps, pushed, charge } = makeDeps();
    const summary = await runCalendarBusinessDays(
      {
        operation: 'business_days_add',
        items: [
          { date: '2026-07-17', days: 1 },
          { date: '2026-07-21', days: -1 },
          { date: '2026-07-11', days: 0 },
          { date: '2027-12-28', days: 10 },
        ],
      },
      deps,
    );
    expect(summary.records_pushed).toBe(3);
    expect(summary.record_errors).toBe(1);
    expect(charge).toHaveBeenCalledTimes(3);
    expectGolden(goldenDir, 'run.business-days-add.json', pushed);
  });

  it('business_days_count: extra_holidays適用・両端包含・from>toの_error', async () => {
    const { deps, pushed } = makeDeps();
    const summary = await runCalendarBusinessDays(
      {
        operation: 'business_days_count',
        ranges: [
          { from: '2026-07-06', to: '2026-07-19' },
          { from: '2026-07-06', to: '2026-07-12' },
          { from: '2026-08-01', to: '2026-07-01' },
        ],
        extra_holidays: ['2026-07-13', '2026-07-14'],
      },
      deps,
    );
    expect(summary.records_pushed).toBe(2);
    expect(summary.record_errors).toBe(1);
    expectGolden(goldenDir, 'run.business-days-count.json', pushed);
  });
});

describe('runCalendarBusinessDays: actor層の振る舞い', () => {
  it('FR-C7: 入力項目1,000超は打ち切り＋警告＋items_truncated（maxItems上書きで検証）', async () => {
    const { deps, warnings } = makeDeps();
    const summary = await runCalendarBusinessDays(
      { operation: 'date_info', dates: ['2026-07-13', '2026-07-14', '2026-07-15'] },
      { ...deps, maxItems: 2 },
    );
    expect(summary.items_planned).toBe(3);
    expect(summary.items_used).toBe(2);
    expect(summary.items_truncated).toBe(true);
    expect(summary.records_pushed).toBe(2);
    expect(warnings.some((w) => w.includes('per-run limit'))).toBe(true);
  });

  it('無料枠（freeAllowance）: 先頭N件はActor.chargeを呼ばない', async () => {
    const { deps, charge } = makeDeps(3);
    const summary = await runCalendarBusinessDays(
      {
        operation: 'date_info',
        dates: ['2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16'],
      },
      deps,
    );
    expect(summary.records_pushed).toBe(4);
    expect(summary.free_used).toBe(3);
    expect(summary.records_charged).toBe(1);
    expect(charge).toHaveBeenCalledTimes(1);
  });

  it('R2-6: 課金上限到達でgraceful終了（部分結果・実行失敗にしない）', async () => {
    const { deps, pushed, warnings } = makeDeps();
    const limitedBilling = createBilling({
      charge: async () => ({ eventChargeLimitReached: true, chargedCount: 1 }),
    });
    const summary = await runCalendarBusinessDays(
      { operation: 'holidays', years: [2026] },
      { ...deps, billing: limitedBilling },
    );
    expect(summary.charge_limit_reached).toBe(true);
    expect(summary.records_pushed).toBe(1);
    expect(pushed).toHaveLength(1);
    expect(warnings.some((w) => w.includes('Max charge limit reached'))).toBe(true);
  });

  it('FR-C8: 入力全項目が不正な場合のみ実行失敗（_errorはdatasetに出力済み）', async () => {
    const { deps, pushed } = makeDeps();
    await expect(
      runCalendarBusinessDays(
        { operation: 'date_info', dates: ['not-a-date', '2026-02-30'] },
        deps,
      ),
    ).rejects.toThrow(RunFailedError);
    expect(pushed).toHaveLength(2);
    expect(pushed.every((p) => typeof p._error === 'string')).toBe(true);
  });

  it('入力バリデーション: 対象リスト空・未知operation・不正な共通オプションは実行失敗', async () => {
    const { deps } = makeDeps();
    await expect(
      runCalendarBusinessDays({ operation: 'date_info', dates: [] }, deps),
    ).rejects.toThrow(/requires "dates"/);
    await expect(runCalendarBusinessDays({ operation: 'holidays' }, deps)).rejects.toThrow(
      /requires "years"/,
    );
    await expect(
      runCalendarBusinessDays({ operation: 'nope', dates: ['2026-07-13'] }, deps),
    ).rejects.toThrow(/Unknown operation/);
    await expect(
      runCalendarBusinessDays(
        { operation: 'date_info', dates: ['2026-07-13'], weekend_days: ['土曜'] },
        deps,
      ),
    ).rejects.toThrow(/not a valid weekday name/);
    await expect(
      runCalendarBusinessDays(
        { operation: 'date_info', dates: ['2026-07-13'], extra_holidays: ['2026/07/13'] },
        deps,
      ),
    ).rejects.toThrow(/extra_holidays contains/);
    await expect(
      runCalendarBusinessDays(
        {
          operation: 'date_info',
          dates: ['2026-07-13'],
          extra_holidays: Array.from(
            { length: 101 },
            (_, i) => `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
          ),
        },
        deps,
      ),
    ).rejects.toThrow(/at most 100/);
  });

  it('holidays_next: from_date省略時はtoday（JST）を使う', async () => {
    const { deps, pushed } = makeDeps();
    const summary = await runCalendarBusinessDays({ operation: 'holidays_next' }, deps);
    expect(summary.records_pushed).toBe(1);
    expect(pushed[0]).toMatchObject({
      from: '2026-07-13',
      next_holiday: { date: '2026-07-20', name_ja: '海の日' },
      days_until: 7,
    });
  });

  it('N7-2: today > COVERED_TO − 90日 で鮮度警告＋アラート通知（1回/実行）', async () => {
    const { deps, warnings, alert } = makeDeps();
    const summary = await runCalendarBusinessDays(
      { operation: 'date_info', dates: ['2027-10-15'] },
      { ...deps, today: { year: 2027, month: 10, day: 15 } },
    );
    expect(summary.freshness_warning).toBe(true);
    expect(warnings.some((w) => w.includes('nearing the end of its coverage'))).toBe(true);
    expect(alert).toHaveBeenCalledTimes(1);
  });

  it('N7-2: 収録範囲に余裕がある間は鮮度警告を出さない', async () => {
    const { deps, alert } = makeDeps();
    const summary = await runCalendarBusinessDays(
      { operation: 'date_info', dates: ['2026-07-13'] },
      deps,
    );
    expect(summary.freshness_warning).toBe(false);
    expect(alert).not.toHaveBeenCalled();
  });

  it('全レコード（_error含む）にattribution・schema_versionが付く（FR-C2・受入基準c）', async () => {
    const { deps, pushed } = makeDeps();
    await runCalendarBusinessDays(
      { operation: 'date_info', dates: ['2026-07-13', '1954-12-31'] },
      deps,
    );
    for (const record of pushed) {
      expect(record.attribution).toBe('出典：内閣府「国民の祝日」');
      expect(record.schema_version).toBe('0.1.0');
      expect(record.operation).toBe('date_info');
    }
  });
});
