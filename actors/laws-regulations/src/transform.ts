import { withCommonMeta, type CommonMeta } from '@jp-opendata/attribution';
import { kanjiToNumber, toHalfWidth } from '@jp-opendata/normalize-jp';
import type { LawTextNode } from '@jp-opendata/gov-clients';

/**
 * 法令標準XML直訳ツリー（law_full_text）→ 条アイテム変換（FR-5 / FR-C1 / FR-C2）。
 * - 対象は本則（MainProvision）の条のみ。附則（SupplProvision）はv1対象外（README明記）
 * - ツリー（paragraphs: 項→号）とフラット（text_ja）の両対応
 * - title_enはv1ではnull（api_nativeの英名が存在しないため。FR-5軽微逸脱・decisions記録）
 */

export const LAWS_SCHEMA_VERSION = '0.1.0';

export interface ArticleItemEntry {
  item_number: string | null;
  item_title_ja: string | null;
  text_ja: string;
}

export interface ArticleParagraph {
  paragraph_number: string | null;
  text_ja: string;
  items: ArticleItemEntry[];
}

export interface ExtractedArticle {
  /** Article.attr.Num（枝番は "2_2" 形式） */
  number: string;
  /** ArticleTitle（「第一条」等） */
  display_ja: string;
  caption_ja: string | null;
  paragraphs: ArticleParagraph[];
  /** 条全体のフラットテキスト（見出し・項・号を改行連結） */
  text_ja: string;
}

function isNode(value: unknown): value is LawTextNode {
  return typeof value === 'object' && value !== null && 'tag' in value;
}

function childrenOf(node: LawTextNode): Array<LawTextNode | string> {
  return Array.isArray(node.children) ? node.children : [];
}

/** ノード配下のテキストを連結する（ルビの読み仮名Rtは重複を避けるため除外） */
export function textOf(node: LawTextNode | string | undefined): string {
  if (node === undefined) return '';
  if (typeof node === 'string') return node;
  if (node.tag === 'Rt') return '';
  return childrenOf(node)
    .map((child) => textOf(child))
    .join('');
}

function findFirst(node: LawTextNode | string, tag: string): LawTextNode | null {
  if (!isNode(node)) return null;
  if (node.tag === tag) return node;
  for (const child of childrenOf(node)) {
    const found = findFirst(child, tag);
    if (found !== null) return found;
  }
  return null;
}

function collect(node: LawTextNode | string, tag: string, out: LawTextNode[]): void {
  if (!isNode(node)) return;
  if (node.tag === tag) {
    out.push(node);
    return; // 条の入れ子は無い前提（Article配下は探索しない）
  }
  for (const child of childrenOf(node)) {
    collect(child, tag, out);
  }
}

function directChildren(node: LawTextNode, tag: string): LawTextNode[] {
  return childrenOf(node).filter((c): c is LawTextNode => isNode(c) && c.tag === tag);
}

function toParagraph(paragraph: LawTextNode): ArticleParagraph {
  const sentence = directChildren(paragraph, 'ParagraphSentence')
    .map((n) => textOf(n))
    .join('');
  const items = directChildren(paragraph, 'Item').map((item) => {
    const title = directChildren(item, 'ItemTitle')
      .map((n) => textOf(n))
      .join('');
    const body = directChildren(item, 'ItemSentence')
      .map((n) => textOf(n))
      .join('');
    return {
      item_number: item.attr?.Num ?? null,
      item_title_ja: title === '' ? null : title,
      text_ja: body,
    };
  });
  return {
    paragraph_number: paragraph.attr?.Num ?? null,
    text_ja: sentence,
    items,
  };
}

/** law_full_textツリーから本則の条を文書順に抽出する（防御的: 構造が想定外なら空配列） */
export function extractArticles(lawFullText: unknown): ExtractedArticle[] {
  if (!isNode(lawFullText)) return [];
  const main = findFirst(lawFullText, 'MainProvision');
  if (main === null) return [];
  const articleNodes: LawTextNode[] = [];
  collect(main, 'Article', articleNodes);
  return articleNodes.map((article) => {
    const caption = directChildren(article, 'ArticleCaption')
      .map((n) => textOf(n))
      .join('');
    const display = directChildren(article, 'ArticleTitle')
      .map((n) => textOf(n))
      .join('');
    const paragraphs = directChildren(article, 'Paragraph').map(toParagraph);
    const flat = [
      caption,
      display,
      ...paragraphs.flatMap((p) => [
        p.text_ja,
        // 号は「号名＋全角スペース(U+3000)＋本文」で1行にする（法令の慣行表記）
        ...p.items.map((i) => `${i.item_title_ja ?? ''}\u3000${i.text_ja}`.trim()),
      ]),
    ]
      .filter((line) => line !== '')
      .join('\n');
    return {
      number: article.attr?.Num ?? '',
      display_ja: display,
      caption_ja: caption === '' ? null : caption,
      paragraphs,
      text_ja: flat,
    };
  });
}

/**
 * 条番号入力の正規化: 「1」「2-2」「2_2」「第二条」「第二条の二」→ "1" / "2_2"。
 * 解釈できない入力はnull（呼び出し側でエラーにする）。
 */
export function normalizeArticleNumber(input: string): string | null {
  const trimmed = toHalfWidth(input.trim());
  if (trimmed === '') return null;
  if (/^\d+(?:[_-]\d+)*$/.test(trimmed)) {
    return trimmed.replace(/-/g, '_');
  }
  const m = trimmed.match(/^第(.+?)条(?:の(.+))?$/);
  if (m?.[1] !== undefined) {
    const parts: string[] = [];
    const mainRaw = m[1];
    const main = /^\d+$/.test(mainRaw) ? Number(mainRaw) : kanjiToNumber(mainRaw);
    if (main === null || Number.isNaN(main)) return null;
    parts.push(String(main));
    if (m[2] !== undefined) {
      for (const sub of m[2].split('の')) {
        const value = /^\d+$/.test(sub) ? Number(sub) : kanjiToNumber(sub);
        if (value === null || Number.isNaN(value)) return null;
        parts.push(String(value));
      }
    }
    return parts.join('_');
  }
  return null;
}

export interface LawContext {
  lawId: string;
  lawNum: string | null;
  lawTitleJa: string;
  lawTitleKana: string | null;
  lawAbbrevJa: string | null;
  promulgationDate: string | null;
  enforcementDate: string | null;
  lawRevisionId: string;
  asOf: string | null;
}

export interface ArticleItem extends Record<string, unknown> {
  record_type: 'article';
  law_id: string;
  law_num: string | null;
  law_title_ja: string;
  law_title_kana: string | null;
  law_abbrev_ja: string | null;
  /** v1では常にnull（api_nativeの英名が存在しない。translate=true時の題名訳はtranslated側） */
  title_en: null;
  promulgation_date: string | null;
  enforcement_date: string | null;
  law_revision_id: string;
  as_of: string | null;
  article_number: string;
  article_display_ja: string;
  article_caption_ja: string | null;
  paragraphs: ArticleParagraph[];
  text_ja: string;
}

export interface TransformContext {
  sourceUrl: string;
  retrievedAt: string;
}

export function toArticleItem(
  article: ExtractedArticle,
  law: LawContext,
  context: TransformContext,
): ArticleItem & CommonMeta {
  const item: ArticleItem = {
    record_type: 'article',
    law_id: law.lawId,
    law_num: law.lawNum,
    law_title_ja: law.lawTitleJa,
    law_title_kana: law.lawTitleKana,
    law_abbrev_ja: law.lawAbbrevJa,
    title_en: null,
    promulgation_date: law.promulgationDate,
    enforcement_date: law.enforcementDate,
    law_revision_id: law.lawRevisionId,
    as_of: law.asOf,
    article_number: article.number,
    article_display_ja: article.display_ja,
    article_caption_ja: article.caption_ja,
    paragraphs: article.paragraphs,
    text_ja: article.text_ja,
  };
  return withCommonMeta(item, {
    source: 'laws',
    sourceUrl: context.sourceUrl,
    schemaVersion: LAWS_SCHEMA_VERSION,
    retrievedAt: context.retrievedAt,
  });
}
