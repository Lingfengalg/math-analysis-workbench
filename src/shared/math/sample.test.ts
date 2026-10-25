import { describe, expect, it } from 'vitest';
import { compileExpression, sampleFunction } from './sample';

describe('受限表达式计算', () => {
  it.each([
    ['x^2', 3, 9],
    ['abs(x)', -2, 2],
    ['sin(pi/2)', 0, 1],
    ['sqrt(x)', 4, 2],
    ['x^-2', 2, 0.25],
  ])('%s', (expression, x, expected) => {
    expect(compileExpression(expression)(x)).toBeCloseTo(expected);
  });
  it.each([
    'x=2',
    '[1,2]',
    'x.constructor',
    'import("x")',
    'random()',
    'unknown(x)',
    'x!',
    '2^100',
    'x^x',
    'f(x)=x',
    'sin(x,2)',
    '1e100',
    'x > 1',
    'x;2',
  ])('拒绝 %s', (expression) => {
    expect(() => compileExpression(expression)).toThrow();
  });
  it('拒绝空输入和过长输入', () => {
    expect(() => compileExpression('')).toThrow();
    expect(() => compileExpression('x'.repeat(161))).toThrow();
  });
  it('非实数、非有限值以及超出显示上限的值留空', () => {
    expect(compileExpression('sqrt(x)')(-1)).toBeNull();
    expect(compileExpression('1/x')(0)).toBeNull();
    expect(compileExpression('exp(x)')(1000)).toBeNull();
  });
});

describe('函数采样', () => {
  it('平方函数包含端点', () => {
    const { points, gaps } = sampleFunction(
      { expression: 'x^2', xMin: -2, xMax: 2 },
      5,
    );
    expect(points).toEqual([
      [-2, 4],
      [-1, 1],
      [0, 0],
      [1, 1],
      [2, 4],
    ]);
    expect(gaps).toBe(0);
  });
  it('1/x 在 0 留空', () => {
    const { points, gaps } = sampleFunction(
      { expression: '1/x', xMin: -1, xMax: 1 },
      5,
    );
    expect(points).toContainEqual([0, null]);
    expect(gaps).toBeGreaterThan(0);
  });
  it('极点位于采样点之间时进行中点检查', () => {
    const { points } = sampleFunction(
      { expression: '1/(x-0.25)', xMin: 0, xMax: 1 },
      3,
    );
    expect(points).toContainEqual([0.25, null]);
  });
  it('定义域外留空', () => {
    const { points } = sampleFunction(
      { expression: 'sqrt(x)', xMin: -1, xMax: 1 },
      3,
    );
    expect(points[0]).toEqual([-1, null]);
  });
  it('拒绝非法区间和过量采样', () => {
    expect(() =>
      sampleFunction({ expression: 'x', xMin: 1, xMax: -1 }),
    ).toThrow();
    expect(() =>
      sampleFunction({ expression: 'x', xMin: 0, xMax: 1 }, 5000),
    ).toThrow();
  });
});
