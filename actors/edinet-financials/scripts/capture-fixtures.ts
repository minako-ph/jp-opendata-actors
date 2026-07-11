/**
 * Actor#6 fixture採取スクリプト（手動実行。CIに含めない）:
 *   node_modules/.bin/esbuild actors/edinet-financials/scripts/capture-fixtures.ts \
 *     --bundle --platform=node --format=esm \
 *     --banner:js="import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);" \
 *     --outfile=<out>/capture-fixtures.mjs && node <out>/capture-fixtures.mjs <rawDir>
 *
 * やること（docs/tasks-phase3-edinet-financials.md Step 1）:
 * 1. S100YIZC / S100YNCJ のtype=5 CSV原本を再取得（1req/秒はクライアント側で直列化）
 * 2. 2026-06-30の一覧から連結JGAAPの一般事業会社（120・証券コードあり・非ファンド）を
 *    実データ判定（jppfs_cor行がCurrentYearInstantに実在）で1件選定し取得
 * 3. トリミング（行削除のみ・値の改変禁止）:
 *    - jppfs_cor / jpigp_cor 全行＋DEI系（jpdei*）全行を保持
 *    - 経営指標等（*SummaryOfBusinessResults・NumberOfEmployees）＋TextBlock候補
 *      （textblocks.tsの採用対象）を保持
 *    - 出力は#6専用の別名 `document.<docID>.csv.statements.zip`。#1の既存fixture
 *      （*.csv.trimmed.zip）は変更しない（同名差し替えは#1のunitテストの行順前提を
 *      壊すことを確認済み→別名方式に確定。decisions.md 2026-07-11）
 * 4. DEI実在レポートと様式判定手段（zip内ファイル名パターン）を標準出力に出す
 *
 * 生zipは第2引数のディレクトリ（リポジトリ外）へ、トリム済みfixtureは
 * packages/gov-clients/fixtures/edinet/ へ書き出す。キーはURLにのみ使われ成果物に含まれない。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync, zipSync } from 'fflate';
import { EdinetClient } from '@jp-opendata/gov-clients';

const apiKey = process.env.EDINET_API_KEY;
if (!apiKey) throw new Error('EDINET_API_KEY を .env に設定して source してから実行すること');
const rawDir = process.argv[2];
if (!rawDir) throw new Error('第1引数に生zip保存先ディレクトリ（リポジトリ外）を指定すること');
mkdirSync(rawDir, { recursive: true });

const FIXTURES_DIR = 'packages/gov-clients/fixtures/edinet';
const LIST_DATE = '2026-06-30';
// S100YN95（コンヴァノ）はIFRS標準様式（流動/非流動区分・売上収益）の一般事業会社。
// 保険持株のS100YNCJだけではIFRSの標準本表要素をfixtureで実在確認できないため追加
// （FR6-7-2: 実在確認できないIDは登録しない、の登録面を確保する）。
const KNOWN_DOCS: readonly string[] = ['S100YIZC', 'S100YNCJ', 'S100YN95'];

const client = new EdinetClient({ apiKey });
const decoder = new TextDecoder('utf-16le');

/** zip内の全CSVを {ファイル名 → 行テキスト配列(ヘッダ含む)} で返す */
function readZipCsvs(zip: Uint8Array): Map<string, string[]> {
  const files = unzipSync(zip);
  const out = new Map<string, string[]>();
  for (const [name, data] of Object.entries(files)) {
    if (!/\.csv$/i.test(name)) continue;
    out.set(
      name,
      decoder
        .decode(data)
        .split(/\r?\n/)
        .filter((l) => l.trim() !== ''),
    );
  }
  return out;
}

function elementIdOf(line: string): string {
  return (line.split('\t')[0] ?? '').trim().replace(/^"|"$/g, '');
}

function isKeepPrefix(elementId: string): boolean {
  return (
    elementId.startsWith('jppfs_cor:') ||
    elementId.startsWith('jpigp_cor:') ||
    elementId.startsWith('jpdei')
  );
}

function isSummaryRow(elementId: string): boolean {
  return (
    elementId.includes('SummaryOfBusinessResults') || elementId === 'jpcrp_cor:NumberOfEmployees'
  );
}

function isTextBlockKeepRow(elementId: string): boolean {
  return (
    elementId === 'jpcrp_cor:DescriptionOfBusinessTextBlock' ||
    elementId === 'jpcrp_cor:BusinessRisksTextBlock' ||
    (elementId.includes('SegmentInformation') && elementId.includes('TextBlock'))
  );
}

/** UTF-16LE(BOM付き)へエンコード（EDINET CSV原本と同エンコーディング） */
function encodeUtf16Le(text: string): Uint8Array {
  const body = new Uint8Array(2 + text.length * 2);
  body[0] = 0xff;
  body[1] = 0xfe;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    body[2 + i * 2] = code & 0xff;
    body[3 + i * 2] = code >> 8;
  }
  return body;
}

interface TrimReport {
  docId: string;
  files: string[];
  keptRows: number;
  totalRows: number;
  deiElements: string[];
  deiFiles: string[];
}

function trimDocument(docId: string, rawZip: Uint8Array): TrimReport {
  const csvs = readZipCsvs(rawZip);
  const outFiles: Record<string, Uint8Array> = {};
  const report: TrimReport = {
    docId,
    files: [...csvs.keys()],
    keptRows: 0,
    totalRows: 0,
    deiElements: [],
    deiFiles: [],
  };

  for (const [name, lines] of csvs) {
    const basename = name.split('/').pop() ?? name;
    // 監査報告(jpaud*)はfixture対象外（#1のパーサ対象外・#6も使わない）
    if (/^jpaud/i.test(basename)) continue;
    const header = lines[0] ?? '';
    const kept: string[] = [];
    for (const line of lines.slice(1)) {
      report.totalRows++;
      const elementId = elementIdOf(line);
      if (elementId.startsWith('jpdei')) {
        report.deiElements.push(elementId);
        if (!report.deiFiles.includes(basename)) report.deiFiles.push(basename);
      }
      if (isKeepPrefix(elementId) || isSummaryRow(elementId) || isTextBlockKeepRow(elementId)) {
        kept.push(line);
      }
    }
    if (kept.length === 0) continue;
    report.keptRows += kept.length;
    outFiles[name] = encodeUtf16Le([header, ...kept].join('\r\n') + '\r\n');
  }

  const zipped = zipSync(outFiles, { level: 9 });
  writeFileSync(join(FIXTURES_DIR, `document.${docId}.csv.statements.zip`), zipped);
  return report;
}

function logReport(r: TrimReport): void {
  console.log(`[trim] ${r.docId}: kept ${r.keptRows}/${r.totalRows} rows`);
  console.log(`[trim] ${r.docId} files: ${r.files.join(', ')}`);
  console.log(`[dei] ${r.docId}: ${r.deiElements.length} rows in [${r.deiFiles.join(', ')}]`);
  console.log(`[dei] ${r.docId} elements: ${[...new Set(r.deiElements)].join(' ')}`);
}

// --- 1) 既知2書類の原本再取得 ---
for (const docId of KNOWN_DOCS) {
  const zip = await client.fetchDocument(docId, 5);
  writeFileSync(join(rawDir, `document.${docId}.csv.zip`), zip);
  console.log(`[fetch] ${docId}: ${zip.byteLength} bytes`);
}

// --- 2) 連結JGAAP一般事業会社の選定（実データ判定） ---
const list = await client.listDocuments(LIST_DATE);
writeFileSync(join(rawDir, `documents.${LIST_DATE}.raw.json`), JSON.stringify(list, null, 2));
const candidates = list.documents.filter(
  (d) =>
    d.docTypeCode === '120' &&
    d.fundCode === null &&
    d.csvFlag === '1' &&
    d.secCode !== null &&
    !KNOWN_DOCS.includes(d.docID),
);
console.log(
  `[select] ${LIST_DATE}: ${candidates.length} candidates (120, sec_code, csv, non-fund)`,
);

let selected: { docID: string; filerName: string | null; secCode: string | null } | null = null;
let selectedZip: Uint8Array | null = null;
for (const doc of candidates) {
  const zip = await client.fetchDocument(doc.docID, 5);
  const csvs = readZipCsvs(zip);
  let consolidatedJgaap = false;
  let hasIfrs = false;
  for (const [, lines] of csvs) {
    for (const line of lines.slice(1)) {
      const cells = line.split('\t').map((c) => c.trim().replace(/^"|"$/g, ''));
      const elementId = cells[0] ?? '';
      const contextId = cells[2] ?? '';
      if (elementId.startsWith('jppfs_cor:') && contextId === 'CurrentYearInstant') {
        consolidatedJgaap = true;
      }
      if (elementId.startsWith('jpigp_cor:')) hasIfrs = true;
    }
  }
  console.log(
    `[probe] ${doc.docID} ${doc.filerName} sec=${doc.secCode}: consolidatedJGAAP=${consolidatedJgaap} ifrs=${hasIfrs}`,
  );
  if (consolidatedJgaap && !hasIfrs) {
    selected = doc;
    selectedZip = zip;
    writeFileSync(join(rawDir, `document.${doc.docID}.csv.zip`), zip);
    break;
  }
}
if (!selected || !selectedZip) throw new Error('連結JGAAPの一般事業会社が見つからなかった');
console.log(`[select] chosen: ${selected.docID} ${selected.filerName} sec=${selected.secCode}`);

// --- 3) トリミングとfixture書き出し ---
for (const docId of KNOWN_DOCS) {
  const raw = new Uint8Array(readFileSync(join(rawDir, `document.${docId}.csv.zip`)));
  logReport(trimDocument(docId, raw));
}
logReport(trimDocument(selected.docID, selectedZip));

console.log(`[stats] http=${JSON.stringify(client.getHttpStats())}`);
