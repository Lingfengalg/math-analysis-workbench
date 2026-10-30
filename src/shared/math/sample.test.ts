import { describe, expect, it } from 'vitest';
import { compileExpression, sampleFunction } from './sample';
import { summarizePlot } from './plot-summary';
import type { PlotResult } from '@/shared/contracts';

const gapXs = (points: PlotResult['points']) =>
  points.filter((point) => point[1] === null).map((point) => point[0]);

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
    'sin',
    'x+sin',
    'sin+1',
    'cos',
    'tan - exp',
    'abs',
  ])('拒绝 %s', (expression) => {
    expect(() => compileExpression(expression)).toThrow();
  });
  it('单独的函数名给出明确的写法提示', () => {
    expect(() => compileExpression('sin')).toThrow(
      /函数名 sin 不能作为数值使用，请写成 sin\(x\) 的形式。/,
    );
    expect(() => compileExpression('x+sin')).toThrow(/函数名 sin/);
  });
  it('函数名作为调用目标仍然合法', () => {
    expect(compileExpression('sin(x)')(Math.PI / 2)).toBeCloseTo(1);
    expect(compileExpression('abs(x)')(-3)).toBe(3);
    expect(() => compileExpression('sin(pi)')).not.toThrow();
    expect(compileExpression('tan(x)^2')(0)).toBeCloseTo(0);
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
  it('极点位于采样点之间时定位断点', () => {
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

describe('间断点启发式', () => {
  it('1/x 的极点不在采样点上时也能定位到 0', () => {
    const { points, gaps } = sampleFunction(
      { expression: '1/x', xMin: -1, xMax: 1 },
      6,
    );
    expect(gapXs(points).some((x) => Math.abs(x) < 1e-9)).toBe(true);
    expect(gaps).toBeGreaterThan(0);
  });
  it('tan(x) 在 π/2 附近断线', () => {
    const { points, gaps } = sampleFunction({
      expression: 'tan(x)',
      xMin: 0,
      xMax: 3.1,
    });
    expect(gapXs(points).some((x) => Math.abs(x - Math.PI / 2) < 5e-3)).toBe(
      true,
    );
    expect(gaps).toBeGreaterThan(0);
  });
  it('跳跃间断 abs(x)/x 在 0 附近断线', () => {
    const { points, gaps } = sampleFunction(
      { expression: 'abs(x)/x', xMin: -1, xMax: 1 },
      4,
    );
    expect(gapXs(points).some((x) => x > -1 / 3 && x < 1 / 3)).toBe(true);
    expect(gaps).toBeGreaterThan(0);
  });
  it('偶阶极点 1/(x-0.25)^2 断线且平滑侧不误断', () => {
    const { points, gaps } = sampleFunction(
      { expression: '1/(x-0.25)^2', xMin: 0, xMax: 1 },
      3,
    );
    const xs = gapXs(points);
    expect(xs.some((x) => x > 0.15 && x < 0.35)).toBe(true);
    // 0.5→1 一侧连续，不应产生额外缺口
    expect(xs.some((x) => x > 0.5 && x <= 1)).toBe(false);
    expect(gaps).toBeGreaterThan(0);
  });
  it('陡峭连续函数不误断', () => {
    expect(
      sampleFunction({ expression: 'x^3', xMin: -10, xMax: 10 }).gaps,
    ).toBe(0);
    expect(
      sampleFunction({ expression: 'abs(x)', xMin: -10, xMax: 10 }).gaps,
    ).toBe(0);
    expect(
      sampleFunction({ expression: 'sin(10x)', xMin: -5, xMax: 5 }).gaps,
    ).toBe(0);
  });
  it('超出显示上限的结果留空且采样完整', () => {
    const { points, gaps } = sampleFunction({
      expression: 'exp(x)',
      xMin: 0,
      xMax: 20,
    });
    expect(points.at(-1)?.[1]).toBeNull();
    expect(points.length).toBeGreaterThanOrEqual(801);
    expect(gaps).toBeGreaterThan(0);
  });
  it('最大采样量在预算时间内完成', () => {
    const start = performance.now();
    const { points, gaps } = sampleFunction(
      { expression: 'sin(x) + exp(-x^2/100)', xMin: -100, xMax: 100 },
      1201,
    );
    expect(points.length).toBe(1201);
    expect(gaps).toBe(0);
    expect(performance.now() - start).toBeLessThan(1500);
  });
});

// 摘要只描述采样观察（缺口），不推断数学间断；三种留空成因都按
// 采样缺口报告，由 UI 文案进一步说明「不一定是数学间断」。
describe('采样缺口表述（#28）', () => {
  it('连续但超出显示上限：留空合并为区间，与数学间断无关', () => {
    // exp(x) 在 [0,20] 连续，但 x 较大时超过 10⁶ 显示上限而留空
    const summary = summarizePlot(
      sampleFunction({ expression: 'exp(x)', xMin: 0, xMax: 20 }).points,
    );
    const last = summary.gapRanges.at(-1);
    expect(last?.to).toBe(20);
    expect(last?.from).toBeGreaterThan(10);
    expect(summary.finiteCount).toBeGreaterThan(0);
  });
  it('定义域限制：sqrt(x) 负半轴留空合并为一个缺口区间', () => {
    const summary = summarizePlot(
      sampleFunction({ expression: 'sqrt(x)', xMin: -5, xMax: 5 }).points,
    );
    expect(summary.gapRanges.length).toBe(1);
    expect(summary.gapRanges[0].from).toBe(-5);
    expect(summary.gapRanges[0].to).toBeLessThan(0);
  });
  it('启发式断线：跳跃间断 abs(x)/x 报告为近单点缺口', () => {
    const summary = summarizePlot(
      sampleFunction({ expression: 'abs(x)/x', xMin: -1, xMax: 1 }).points,
    );
    const nearZero = summary.gapRanges.filter(
      (range) => Math.abs(range.from) < 0.1 && range.to - range.from < 0.05,
    );
    expect(nearZero.length).toBeGreaterThanOrEqual(1);
  });
  it('全部有效：不报告任何缺口', () => {
    const summary = summarizePlot(
      sampleFunction({ expression: 'x^2', xMin: -2, xMax: 2 }).points,
    );
    expect(summary.gapRanges).toEqual([]);
  });
});
