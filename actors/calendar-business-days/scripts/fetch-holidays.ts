/**
 * 内閣府「国民の祝日」CSVを取得し、生バイト（Shift_JIS）のまま
 * data/syukujitsu-snapshot.csv に保存する。
 *
 * 手動実行のみ（年次更新時）: `pnpm fetch-holidays`
 * CI・実行時（Worker）からは呼ばない（N-1: 実行時外部依存ゼロ）。
 * 変換・検証は行わない（build-holidays.ts の責務）。
 *
 * 注意: URL・ファイル名は過去に変更実績あり（2023年2月）。404時は親ページを人間が確認すること。
 * 親ページ: https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html
 */
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CSV_URL = 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv';
const SNAPSHOT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../data/syukujitsu-snapshot.csv',
);

const res = await fetch(CSV_URL);
if (!res.ok) {
  throw new Error(
    `Failed to fetch ${CSV_URL}: ${res.status} ${res.statusText}. ` +
      'URLが変更された可能性があります。親ページ https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html を確認してください。',
  );
}
const bytes = new Uint8Array(await res.arrayBuffer());
if (bytes.length === 0) {
  throw new Error('Fetched CSV is empty');
}
await writeFile(SNAPSHOT_PATH, bytes);
console.log(`Saved ${bytes.length} bytes to ${SNAPSHOT_PATH}`);
console.log(
  '次の手順: pnpm build-holidays で生成・検証し、golden差分をレビューしてからコミットすること。',
);
