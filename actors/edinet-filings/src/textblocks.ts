import type { EdinetCsvRow } from '@jp-opendata/gov-clients';

/**
 * enrichの入力原文を既取得のCSV zip（type=5）のTextBlock行から取る（Phase 1b Step 1）。
 * **EDINETへの追加APIコールは禁止**（原価と負荷を増やさない）。
 * 要素IDは実fixture（S100YIZC個別JGAAP / S100YNCJ連結IFRS, 2026-07-08）で特定した
 * 候補リスト方式（financials.tsと同方式。fixtureで確認できないIDを推測で書かない＝N-9②）。
 */

export interface TextBlocks {
  business: string | null;
  risks: string | null;
  segments: string | null;
  /** いずれかの節が上限で切り詰められた（内部利用。datasetには出さない） */
  truncated: boolean;
}

// 節別の文字数上限（合計≒6〜8kトークン想定。超過は節単位で切り詰め）
const CHAR_LIMITS = { business: 3_000, risks: 6_000, segments: 3_000 } as const;

// 実データで確認済みの要素ID候補（優先順）
const BUSINESS_CANDIDATES = ['jpcrp_cor:DescriptionOfBusinessTextBlock'];
const RISKS_CANDIDATES = ['jpcrp_cor:BusinessRisksTextBlock'];
// セグメント情報は財務諸表注記側にあり、連結/個別/IFRSで揺れる:
//   jpcrp_cor:NotesSegmentInformationEtcFinancialStatementsTextBlock（個別JGAAP）
//   jpigp_cor:NotesSegmentInformationConsolidatedFinancialStatementsIFRSTextBlock（連結IFRS）
// → 候補は「SegmentInformationを含むTextBlock」とし、複数一致時は情報量の多い最長を採用
function isSegmentTextBlock(elementId: string): boolean {
  return elementId.includes('SegmentInformation') && elementId.includes('TextBlock');
}

/** TextBlockの値はHTML。タグ・最低限の実体参照を除去し連続空白を圧縮する */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

function pickByCandidates(rows: EdinetCsvRow[], candidates: string[]): string | null {
  for (const id of candidates) {
    const row = rows.find((r) => r.elementId === id && r.value !== '');
    if (row) return row.value;
  }
  return null;
}

function pickSegments(rows: EdinetCsvRow[]): string | null {
  const matches = rows.filter((r) => isSegmentTextBlock(r.elementId) && r.value !== '');
  if (matches.length === 0) return null;
  return matches.reduce((a, b) => (b.value.length > a.value.length ? b : a)).value;
}

export function extractTextBlocks(rows: EdinetCsvRow[]): TextBlocks {
  let truncated = false;
  const clip = (raw: string | null, limit: number): string | null => {
    if (raw === null) return null;
    const text = stripHtml(raw);
    if (text.length <= limit) return text;
    truncated = true;
    return text.slice(0, limit);
  };
  const business = clip(pickByCandidates(rows, BUSINESS_CANDIDATES), CHAR_LIMITS.business);
  const risks = clip(pickByCandidates(rows, RISKS_CANDIDATES), CHAR_LIMITS.risks);
  const segments = clip(pickSegments(rows), CHAR_LIMITS.segments);
  return { business, risks, segments, truncated };
}
