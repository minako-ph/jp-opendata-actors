import { describe, expect, it } from 'vitest';
import { median } from '../src/aggregate.js';

describe('median', () => {
  it('奇数個は中央、偶数個は中央2値の平均、空はnull', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});
