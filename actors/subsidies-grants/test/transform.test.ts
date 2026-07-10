import { describe, expect, it } from 'vitest';
import { toAmountJpy, toIsoDate, toSubsidyItem } from '../src/transform.js';

const context = {
  sourceUrl: 'https://api.info.gbiz.go.jp/hojin/v2/hojin/7010001008844/subsidy',
  retrievedAt: '2026-07-10T00:00:00+09:00',
};

const recipient = {
  corporateNumber: '7010001008844',
  nameEn: 'Hitachi, Ltd.',
  nameJa: '株式会社日立製作所',
  locationJa: '東京都千代田区丸の内１丁目６番６号',
  nameResolution: null,
};

describe('toAmountJpy', () => {
  it('文字列（補助金API実応答）・数値（調達API）の両方を数値化する', () => {
    expect(toAmountJpy('76846429')).toBe(76846429);
    expect(toAmountJpy(75170700)).toBe(75170700);
    expect(toAmountJpy(undefined)).toBeNull();
    expect(toAmountJpy('非公表')).toBeNull();
  });
});

describe('toIsoDate', () => {
  it('YYYY-MM-DD・ISO datetimeをYYYY-MM-DDへ、それ以外はnull', () => {
    expect(toIsoDate('2025-12-18')).toBe('2025-12-18');
    expect(toIsoDate('2021-05-21T00:00:00+09:00')).toBe('2021-05-21');
    expect(toIsoDate('令和3年')).toBeNull();
    expect(toIsoDate(undefined)).toBeNull();
  });
});

describe('toSubsidyItem', () => {
  it('FR-2項目＋共通メタを組み立て、府省ENは辞書から引く', () => {
    const item = toSubsidyItem(
      {
        title: 'ものづくり・商業・サービス生産性向上促進補助金',
        amount: '7784000',
        date_of_approval: '2025-12-18',
        government_departments: '中小企業庁',
      },
      recipient,
      context,
    );
    expect(item).toMatchObject({
      record_type: 'subsidy',
      title_ja: 'ものづくり・商業・サービス生産性向上促進補助金',
      ministry: 'Small and Medium Enterprise Agency',
      ministry_ja: '中小企業庁',
      amount_jpy: 7784000,
      date_of_approval: '2025-12-18',
      target_ja: null,
      recipient_corporate_number: '7010001008844',
      recipient_name: 'Hitachi, Ltd.',
      recipient_name_ja: '株式会社日立製作所',
      source: 'gbizinfo',
      attribution: '出典：経済産業省 Gビズインフォ',
      schema_version: '0.1.0',
    });
  });

  it('辞書に無い府省はministry=null・原文は保全（推測禁止）', () => {
    const item = toSubsidyItem(
      { title: 'x', government_departments: '未知の庁' },
      recipient,
      context,
    );
    expect(item.ministry).toBeNull();
    expect(item.ministry_ja).toBe('未知の庁');
  });
});
