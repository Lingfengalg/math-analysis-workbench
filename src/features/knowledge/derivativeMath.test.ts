import { describe, expect, it } from 'vitest';
import { observeDerivative } from './derivativeMath';

describe('导数实验的固定函数', () => {
  it('二次函数的差商和导数分别为 2x+h 和 2x', () => {
    const result = observeDerivative('square', 0.5, 0.2);
    expect(result.secant).toBeCloseTo(1.2);
    expect(result.tangent).toBe(1);
  });
  it('增量为零时不计算差商', () => {
    const result = observeDerivative('square', 1, 0);
    expect(result.secant).toBeNull();
    expect(result.tangent).toBe(2);
  });
  it('绝对值在零处左右差商不同，导数不存在', () => {
    expect(observeDerivative('absolute', 0, 0.1).secant).toBe(1);
    expect(observeDerivative('absolute', 0, -0.1).secant).toBe(-1);
    expect(observeDerivative('absolute', 0, 0.1).tangent).toBeNull();
    expect(observeDerivative('absolute', -1, 0.1).tangent).toBe(-1);
  });
});
