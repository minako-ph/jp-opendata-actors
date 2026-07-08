import { normalizeForVerbatimMatch } from '@jp-opendata/normalize-jp';

/** LLM品質規律（N-9）の共通部品: 生成メタと逐語照合 */

export type GenerationMethod = 'api_native' | 'rule' | 'llm';

/** 生成項目に必ず付与するメタ（N-9③） */
export interface GeneratedField<T> {
  value: T | null;
  confidence: number;
  method: GenerationMethod;
  verification_failed?: boolean;
}

/**
 * 逐語照合（N-9①）: LLM出力の候補値（固有名詞・数値）が正規化済み原文に部分一致するか検証する。
 * 不一致の数値・固有名詞フィールドは呼び出し側で null化＋verification_failed:true とする。
 */
export function verifyVerbatim(candidate: string, sourceText: string): boolean {
  const normalizedCandidate = normalizeForVerbatimMatch(candidate);
  if (normalizedCandidate === '') return false;
  return normalizeForVerbatimMatch(sourceText).includes(normalizedCandidate);
}

/** 照合結果を GeneratedField に反映する（数値・固有名詞フィールド用） */
export function applyVerbatimVerification<T extends string | number>(
  field: GeneratedField<T>,
  sourceText: string,
): GeneratedField<T> {
  if (field.value === null) return field;
  if (verifyVerbatim(String(field.value), sourceText)) return field;
  return { ...field, value: null, verification_failed: true };
}
