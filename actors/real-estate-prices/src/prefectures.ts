/** 都道府県コード表（JIS X 0401）。入力はEN名・JA名・2桁コードのいずれでも受け付ける */

export interface Prefecture {
  code: string;
  en: string;
  ja: string;
}

export const PREFECTURES: readonly Prefecture[] = [
  { code: '01', en: 'Hokkaido', ja: '北海道' },
  { code: '02', en: 'Aomori', ja: '青森県' },
  { code: '03', en: 'Iwate', ja: '岩手県' },
  { code: '04', en: 'Miyagi', ja: '宮城県' },
  { code: '05', en: 'Akita', ja: '秋田県' },
  { code: '06', en: 'Yamagata', ja: '山形県' },
  { code: '07', en: 'Fukushima', ja: '福島県' },
  { code: '08', en: 'Ibaraki', ja: '茨城県' },
  { code: '09', en: 'Tochigi', ja: '栃木県' },
  { code: '10', en: 'Gunma', ja: '群馬県' },
  { code: '11', en: 'Saitama', ja: '埼玉県' },
  { code: '12', en: 'Chiba', ja: '千葉県' },
  { code: '13', en: 'Tokyo', ja: '東京都' },
  { code: '14', en: 'Kanagawa', ja: '神奈川県' },
  { code: '15', en: 'Niigata', ja: '新潟県' },
  { code: '16', en: 'Toyama', ja: '富山県' },
  { code: '17', en: 'Ishikawa', ja: '石川県' },
  { code: '18', en: 'Fukui', ja: '福井県' },
  { code: '19', en: 'Yamanashi', ja: '山梨県' },
  { code: '20', en: 'Nagano', ja: '長野県' },
  { code: '21', en: 'Gifu', ja: '岐阜県' },
  { code: '22', en: 'Shizuoka', ja: '静岡県' },
  { code: '23', en: 'Aichi', ja: '愛知県' },
  { code: '24', en: 'Mie', ja: '三重県' },
  { code: '25', en: 'Shiga', ja: '滋賀県' },
  { code: '26', en: 'Kyoto', ja: '京都府' },
  { code: '27', en: 'Osaka', ja: '大阪府' },
  { code: '28', en: 'Hyogo', ja: '兵庫県' },
  { code: '29', en: 'Nara', ja: '奈良県' },
  { code: '30', en: 'Wakayama', ja: '和歌山県' },
  { code: '31', en: 'Tottori', ja: '鳥取県' },
  { code: '32', en: 'Shimane', ja: '島根県' },
  { code: '33', en: 'Okayama', ja: '岡山県' },
  { code: '34', en: 'Hiroshima', ja: '広島県' },
  { code: '35', en: 'Yamaguchi', ja: '山口県' },
  { code: '36', en: 'Tokushima', ja: '徳島県' },
  { code: '37', en: 'Kagawa', ja: '香川県' },
  { code: '38', en: 'Ehime', ja: '愛媛県' },
  { code: '39', en: 'Kochi', ja: '高知県' },
  { code: '40', en: 'Fukuoka', ja: '福岡県' },
  { code: '41', en: 'Saga', ja: '佐賀県' },
  { code: '42', en: 'Nagasaki', ja: '長崎県' },
  { code: '43', en: 'Kumamoto', ja: '熊本県' },
  { code: '44', en: 'Oita', ja: '大分県' },
  { code: '45', en: 'Miyazaki', ja: '宮崎県' },
  { code: '46', en: 'Kagoshima', ja: '鹿児島県' },
  { code: '47', en: 'Okinawa', ja: '沖縄県' },
];

const JA_SUFFIXES = ['都', '道', '府', '県'];

/** EN名（大文字小文字不問）・JA名（都道府県サフィックス省略可）・2桁コードを解決。不明はnull */
export function resolvePrefectureCode(input: string): string | null {
  const raw = input.trim();
  if (/^\d{2}$/.test(raw)) {
    return PREFECTURES.some((p) => p.code === raw) ? raw : null;
  }
  const lower = raw.toLowerCase();
  for (const p of PREFECTURES) {
    if (p.en.toLowerCase() === lower) return p.code;
    if (p.ja === raw) return p.code;
    for (const suffix of JA_SUFFIXES) {
      if (p.ja === raw + suffix) return p.code;
    }
  }
  return null;
}
