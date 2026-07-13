/**
 * data/syukujitsu-snapshot.csv（Shift_JIS・CRLF・2列）を検証し、
 * src/generated/holidays-data.ts を生成する。
 *
 * 手動実行のみ: `pnpm build-holidays`（fetch-holidays.ts の後段。生成物はコミットする）
 * 収録範囲（coveredFrom/coveredTo）は実CSVから機械的に決定する（FR-10。ハードコード禁止）。
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import iconv from 'iconv-lite';

const here = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(here, '../data/syukujitsu-snapshot.csv');
const OUTPUT_PATH = join(here, '../src/generated/holidays-data.ts');

const EXPECTED_HEADER = '国民の祝日・休日月日,国民の祝日・休日名称';
// CSVの日付列は「1955/1/1」形式（ゼロ埋めなしのスラッシュ区切り）
const DATE_PATTERN = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/;

function isValidDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const daysInMonth = [
    31,
    (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  const dim = daysInMonth[m - 1];
  return dim !== undefined && d <= dim;
}

const raw = await readFile(SNAPSHOT_PATH);
const text = iconv.decode(raw, 'Shift_JIS');

const lines = text.split(/\r\n/);
// 末尾の空行は許容（CRLF終端）
while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

const header = lines.shift();
if (header !== EXPECTED_HEADER) {
  throw new Error(
    `Unexpected header: ${JSON.stringify(header)} (expected ${JSON.stringify(EXPECTED_HEADER)})`,
  );
}
if (lines.length < 800) {
  // 1955年〜翌年分で毎年十数件 → 800件未満は取得失敗や形式変更を疑う
  throw new Error(`Too few rows: ${lines.length}. CSVの形式変更・取得失敗を疑ってください。`);
}

const holidays: Array<{ date: string; name: string }> = [];
let prevKey = 0;
for (const [i, line] of lines.entries()) {
  const cols = line.split(',');
  if (cols.length !== 2) {
    throw new Error(
      `Row ${i + 2}: expected 2 columns, got ${cols.length}: ${JSON.stringify(line)}`,
    );
  }
  const [dateRaw, name] = cols;
  if (dateRaw === undefined || name === undefined || name === '') {
    throw new Error(`Row ${i + 2}: empty column: ${JSON.stringify(line)}`);
  }
  const m = dateRaw.match(DATE_PATTERN);
  if (!m) {
    throw new Error(`Row ${i + 2}: unexpected date format: ${JSON.stringify(dateRaw)}`);
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!isValidDate(y, mo, d)) {
    throw new Error(`Row ${i + 2}: invalid calendar date: ${dateRaw}`);
  }
  const key = y * 10000 + mo * 100 + d;
  if (key <= prevKey) {
    throw new Error(`Row ${i + 2}: dates not strictly ascending at ${dateRaw}`);
  }
  prevKey = key;
  const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  holidays.push({ date: iso, name });
}

const first = holidays[0];
const last = holidays[holidays.length - 1];
if (first === undefined || last === undefined) throw new Error('No holiday rows');

// 収録範囲: 祝日データが「その年の祝日を全て含む」と言える年単位で機械決定する。
// 最初の祝日の年の1/1〜最後の祝日の年の12/31…とすると末端年が年途中までの収録である場合に
// 根拠のない非祝日判定をしてしまうため、上限・下限とも「祝日が1件以上収録されている年」を採用し、
// 年単位（1/1〜12/31）で丸める。内閣府CSVは年単位で追記されるため実運用上これで一致する。
const coveredFromYear = Number(first.date.slice(0, 4));
const coveredToYear = Number(last.date.slice(0, 4));
const coveredFrom = `${coveredFromYear}-01-01`;
const coveredTo = `${coveredToYear}-12-31`;

const uniqueNames = [...new Set(holidays.map((h) => h.name))];

const generated = `// このファイルは scripts/build-holidays.ts による生成物（手動パイプライン）。直接編集しないこと。
// 出典: 内閣府「国民の祝日」CSV（data/syukujitsu-snapshot.csv、data/README.md 参照）
// 収録範囲は実CSVから機械的に決定（FR-10）

/** ISO日付(YYYY-MM-DD) → 祝日名（日本語原文） */
export const HOLIDAYS_JA: ReadonlyMap<string, string> = new Map<string, string>([
${holidays.map((h) => `  [${JSON.stringify(h.date)}, ${JSON.stringify(h.name)}],`).join('\n')}
]);

/** 祝日データの収録範囲（この範囲外の祝日・営業日判定は行わない） */
export const COVERED_FROM = ${JSON.stringify(coveredFrom)};
export const COVERED_TO = ${JSON.stringify(coveredTo)};

/** CSVに出現する祝日名のユニーク一覧（英語名マッピングの網羅テストに使用） */
export const HOLIDAY_NAMES_JA: ReadonlyArray<string> = ${JSON.stringify(uniqueNames, null, 2)};
`;

await writeFile(OUTPUT_PATH, generated, 'utf8');
console.log(`Generated ${OUTPUT_PATH}`);
console.log(`rows=${holidays.length} covered=${coveredFrom}..${coveredTo}`);
console.log(`unique names (${uniqueNames.length}): ${uniqueNames.join(' / ')}`);
