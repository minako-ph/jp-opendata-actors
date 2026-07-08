import type { EdinetCsvRow } from '@jp-opendata/gov-clients';
import type { EdinetTextSections } from '@jp-opendata/enrich';

/**
 * enrichの入力原文を既取得のCSV zip（type=5）のTextBlock行から作る。
 * 追加のEDINET APIコールはしない（追補・レビュー方針）。
 * 要素IDは実CSV（S100YIZC/S100YNCJ, 2026-07-08）で確認済み:
 * - 事業の内容: jpcrp_cor:DescriptionOfBusinessTextBlock
 * - 事業等のリスク: jpcrp_cor:BusinessRisksTextBlock
 * - セグメント情報: SegmentInformation…TextBlock（連結/個別/IFRSで揺れる→最長の1件を採用）
 */

// 合計~8,000字 ≈ 日本語でおおむね8kトークン以内の近似（超過分は節単位で切り詰め）
const SECTION_CHAR_LIMITS = { business: 3000, risks: 3500, segments: 1500 } as const;

const BUSINESS_ELEMENT_ID = 'jpcrp_cor:DescriptionOfBusinessTextBlock';
const RISKS_ELEMENT_ID = 'jpcrp_cor:BusinessRisksTextBlock';

/** TextBlockの値はHTML。タグ・主要エンティティを除去して平文にする */
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
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : text.slice(0, limit);
}

function findByExactId(rows: EdinetCsvRow[], elementId: string): string | null {
  const row = rows.find((r) => r.elementId === elementId && r.value !== '');
  return row ? row.value : null;
}

function findSegmentsTextBlock(rows: EdinetCsvRow[]): string | null {
  const candidates = rows.filter(
    (r) =>
      r.elementId.includes('SegmentInformation') &&
      r.elementId.includes('TextBlock') &&
      r.value !== '',
  );
  if (candidates.length === 0) return null;
  // 連結/個別/IFRSで要素IDが揺れるため、情報量の多い最長の1件を採用する
  const longest = candidates.reduce((a, b) => (b.value.length > a.value.length ? b : a));
  return longest.value;
}

export function extractEdinetTextSections(rows: EdinetCsvRow[]): EdinetTextSections {
  const business = findByExactId(rows, BUSINESS_ELEMENT_ID);
  const risks = findByExactId(rows, RISKS_ELEMENT_ID);
  const segments = findSegmentsTextBlock(rows);
  return {
    business:
      business === null ? null : truncate(stripHtml(business), SECTION_CHAR_LIMITS.business),
    risks: risks === null ? null : truncate(stripHtml(risks), SECTION_CHAR_LIMITS.risks),
    segments:
      segments === null ? null : truncate(stripHtml(segments), SECTION_CHAR_LIMITS.segments),
  };
}
