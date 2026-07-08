import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EDINET_SUMMARY_SYSTEM_PROMPT } from '../src/prompt-edinet-summary-v1.js';

describe('prompt sync', () => {
  it('埋め込みプロンプトは正典 prompts/edinet-summary-v1.md と一致する', () => {
    const canonical = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'edinet-summary-v1.md'),
      'utf-8',
    );
    expect(EDINET_SUMMARY_SYSTEM_PROMPT.trim()).toBe(canonical.trim());
  });
});
