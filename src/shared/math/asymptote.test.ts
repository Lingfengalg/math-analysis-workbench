import { describe, expect, it } from 'vitest';
import type { PlotPoint } from '@/shared/contracts';
import { detectHorizontalAsymptotes, type Evaluate } from './asymptote';
import { sampleFunction } from './sample';

describe('水平渐近趋势检测（#60）', () => {
  it('1/x 双侧检测到趋向 0 的候选（数值近似）', () => {
    const result = sampleFunction({ expression: '1/x', xMin: -5, xMax: 5 });
    const sides = (result.asymptotes ?? []).map((a) => a.side).sort();
    expect(sides).toEqual(['left', 'right']);
    for (const candidate of result.asymptotes ?? []) {
      expect(Math.abs(candidate.y)).toBeLessThanOrEqual(0.3);
    }
  });
  it('e^(-x) 仅右侧产生候选', () => {
    const result = sampleFunction({ expression: 'exp(-x)', xMin: -5, xMax: 5 });
    expect(result.asymptotes).toHaveLength(1);
    expect(result.asymptotes?.[0].side).toBe('right');
    expect(result.asymptotes?.[0].y ?? Infinity).toBeLessThanOrEqual(0.05);
  });
  it('sin(x) 振荡函数不产生候选', () => {
    const result = sampleFunction({ expression: 'sin(x)', xMin: -5, xMax: 5 });
    expect(result.asymptotes).toEqual([]);
  });
  it('1+1/x 右侧检测到趋向 1 的候选', () => {
    const result = sampleFunction({ expression: '1+1/x', xMin: -5, xMax: 5 });
    const right = (result.asymptotes ?? []).find(
      (candidate) => candidate.side === 'right',
    );
    expect(right).toBeDefined();
    expect(Math.abs((right?.y ?? NaN) - 1)).toBeLessThanOrEqual(0.3);
  });
  it('x^2 与常数函数：前者无候选，平直尾部产生候选', () => {
    const parabola = sampleFunction({ expression: 'x^2', xMin: -5, xMax: 5 });
    expect(parabola.asymptotes).toEqual([]);
    const constant = sampleFunction({ expression: '5', xMin: -5, xMax: 5 });
    expect(constant.asymptotes).toHaveLength(2);
    for (const candidate of constant.asymptotes ?? []) {
      expect(candidate.y).toBeCloseTo(5, 5);
    }
  });
});

describe('渐近检测纯函数行为（#60）', () => {
  const uniform = (ys: number[]): PlotPoint[] =>
    ys.map((y, index) => [-5 + (10 * index) / (ys.length - 1), y]);

  it('指数函数发散侧被窗口外探测拒绝，仅保留收敛侧', () => {
    // e^(-x)：右侧尾部收敛（真渐近线），左侧尾部在窗口内几何形态相同，
    // 但窗口外探测值迅速远离边缘值，从而被拒绝。
    const evaluate: Evaluate = (x) => Math.exp(-x);
    const ys: number[] = [];
    for (let i = 0; i < 100; i += 1) ys.push(evaluate(-5 + (10 * i) / 99) ?? 0);
    const candidates = detectHorizontalAsymptotes(evaluate, uniform(ys), -5, 5);
    expect(candidates.map((candidate) => candidate.side)).toEqual(['right']);
  });

  it('振荡尾部被符号变化检查拒绝', () => {
    const evaluate: Evaluate = (x) => Math.sin(x * 10);
    const ys: number[] = [];
    for (let i = 0; i < 100; i += 1) ys.push(evaluate(-5 + (10 * i) / 99) ?? 0);
    const candidates = detectHorizontalAsymptotes(evaluate, uniform(ys), -5, 5);
    expect(candidates).toEqual([]);
  });

  it('窗口外探测无定义时不产生候选', () => {
    // 尾部像 1/x 一样收敛，但窗口外返回 null（定义域到此为止）
    const evaluate: Evaluate = (x) => (x > 5 || x < -5 ? null : 1 / x);
    const ys: number[] = [];
    for (let i = 0; i < 100; i += 1) ys.push(evaluate(-5 + (10 * i) / 99) ?? 0);
    const candidates = detectHorizontalAsymptotes(evaluate, uniform(ys), -5, 5);
    expect(candidates).toEqual([]);
  });
});
