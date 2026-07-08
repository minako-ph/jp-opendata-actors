import { describe, expect, it } from 'vitest';
import type { EdinetCsvRow } from '@jp-opendata/gov-clients';
import { extractEdinetTextSections, stripHtml } from '../src/enrich-input.js';

function row(elementId: string, value: string): EdinetCsvRow {
  return {
    elementId,
    itemName: '',
    contextId: 'FilingDateInstant',
    relativeFiscalYear: '提出日',
    consolidatedOrNot: 'その他',
    periodOrInstant: '時点',
    unitId: '－',
    unit: '－',
    value,
  };
}

describe('stripHtml', () => {
  it('タグ・エンティティを除去して平文にする', () => {
    expect(stripHtml('<p>当社は<b>放送事業</b>を営む。&nbsp;売上&amp;利益</p>')).toBe(
      '当社は 放送事業 を営む。 売上&利益',
    );
  });
});

describe('extractEdinetTextSections', () => {
  it('事業の内容・リスク・セグメント（最長のTextBlock）を抽出する', () => {
    const rows = [
      row('jpcrp_cor:DescriptionOfBusinessTextBlock', '<p>事業の内容です。</p>'),
      row('jpcrp_cor:BusinessRisksTextBlock', '<p>リスクです。</p>'),
      row('jpcrp_cor:NotesSegmentInformationEtcFinancialStatementsTextBlock', '<p>短い</p>'),
      row(
        'jpigp_cor:NotesSegmentInformationConsolidatedFinancialStatementsIFRSTextBlock',
        '<p>こちらのほうが長いセグメント情報です。</p>',
      ),
    ];
    expect(extractEdinetTextSections(rows)).toEqual({
      business: '事業の内容です。',
      risks: 'リスクです。',
      segments: 'こちらのほうが長いセグメント情報です。',
    });
  });

  it('該当行が無いセクションはnull（ファンド等）', () => {
    expect(extractEdinetTextSections([])).toEqual({ business: null, risks: null, segments: null });
  });

  it('~8kトークン相当に節単位で切り詰める（business=3000字）', () => {
    const rows = [row('jpcrp_cor:DescriptionOfBusinessTextBlock', 'あ'.repeat(5000))];
    const sections = extractEdinetTextSections(rows);
    expect(sections.business).toHaveLength(3000);
  });
});
