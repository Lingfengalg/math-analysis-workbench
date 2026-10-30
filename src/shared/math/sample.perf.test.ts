import { describe, expect, it } from 'vitest';
import budgets from '../../../perf/budgets.json';
import type { PlotRequest } from '@/shared/contracts';
import { sampleFunction } from './sample';

type BudgetKey = keyof typeof budgets.samplingMs;

const CASES: Array<{ name: string; kind: BudgetKey; request: PlotRequest }> = [
  {
    name: 'x^2（典型）',
    kind: 'typical',
    request: { expression: 'x^2', xMin: -5, xMax: 5 },
  },
  {
    name: 'abs(x)（典型）',
    kind: 'typical',
    request: { expression: 'abs(x)', xMin: -3, xMax: 3 },
  },
  {
    name: 'sin(20*x)（高频）',
    kind: 'boundary',
    request: { expression: 'sin(20*x)', xMin: -5, xMax: 5 },
  },
  {
    name: '1/x（定义域空洞）',
    kind: 'boundary',
    request: { expression: '1/x', xMin: -5, xMax: 5 },
  },
  {
    name: 'tan(x)（多极点）',
    kind: 'boundary',
    request: { expression: 'tan(x)', xMin: -5, xMax: 5 },
  },
  {
    name: 'x^20（边界数值）',
    kind: 'boundary',
    request: { expression: 'x^20', xMin: -2, xMax: 2 },
  },
];

/**
 * 采样性能基线：只做「明显变慢」的粗粒度回归，阈值来自 perf/budgets.json，
 * 数值本身取本机单次冷启动测量，不用于跨机器的精确对比。
 */
describe('绘图采样性能基线 (#39)', () => {
  it('典型与边界表达式在预算内完成 801 点采样', () => {
    const rows: string[] = [];
    for (const item of CASES) {
      const start = performance.now();
      const result = sampleFunction(item.request);
      const ms = performance.now() - start;
      const budget = budgets.samplingMs[item.kind];

      rows.push(
        `${item.name.padEnd(20)} ${ms.toFixed(1).padStart(7)} ms  ` +
          `预算 ${String(budget).padStart(3)} ms  ` +
          `点数 ${String(result.points.length).padStart(4)} 缺口 ${result.gaps}`,
      );

      expect(result.points.length).toBeGreaterThanOrEqual(801);
      expect(ms, `${item.name} 超过预算 ${budget} ms`).toBeLessThan(budget);
    }
    console.log(`采样耗时（801 点，单次冷启动）：\n${rows.join('\n')}`);
  });

  it('性能相关改动不改变采样语义', () => {
    const reciprocal = sampleFunction({
      expression: '1/x',
      xMin: -5,
      xMax: 5,
    });
    // 定义域空洞仍要留空并计入缺口，不能为了快而跳过间断检测
    expect(reciprocal.gaps).toBeGreaterThan(0);
    expect(reciprocal.points.some((point) => point[1] === null)).toBe(true);

    const parabola = sampleFunction({
      expression: 'x^2',
      xMin: -2,
      xMax: 2,
    });
    expect(parabola.gaps).toBe(0);
    expect(parabola.points.every((point) => point[1] !== null)).toBe(true);
  });
});
