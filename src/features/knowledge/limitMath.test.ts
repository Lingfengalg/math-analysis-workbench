import { describe, expect, it } from 'vitest';
import { observeLimit } from './limitMath';

describe('极限演示的固定示例', () => {
  it('二次函数左右靠近 1 且不取到目标点', () => {
    const result = observeLimit('square', 100);
    expect(result.distance).toBeCloseTo(0.01);
    expect(result.leftX).toBeCloseTo(0.99);
    expect(result.rightX).toBeCloseTo(1.01);
    expect(result.leftY).toBeCloseTo(0.9801);
    expect(result.rightY).toBeCloseTo(1.0201);
  });
  it('跳跃示例的左右值始终不同且从不取 x = 0', () => {
    for (const progress of [0, 50, 100]) {
      const result = observeLimit('jump', progress);
      expect(result.leftX).toBeLessThan(0);
      expect(result.rightX).toBeGreaterThan(0);
      expect(result.leftY).toBe(-1);
      expect(result.rightY).toBe(1);
    }
  });
  it('超出进度范围时限制在合法区间', () => {
    expect(observeLimit('square', -100).distance).toBe(1);
    expect(observeLimit('square', 200).distance).toBeCloseTo(0.01);
  });
});
