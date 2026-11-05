import { describe, expect, it } from 'vitest';
import {
  COMPARISON_CURVE_COLORS,
  comparisonCurveColor,
  curveExpressionsLabel,
  finiteYRange,
  GAP_MARKER_COLOR,
  INTERSECTION_MARKER_COLOR,
  MAIN_CURVE_COLOR,
} from './chart-series';

describe('对比曲线颜色分配', () => {
  it('前三条颜色互不相同，且与主曲线、间断与交点标记颜色可区分', () => {
    expect(COMPARISON_CURVE_COLORS.length).toBeGreaterThanOrEqual(3);
    const used = [
      MAIN_CURVE_COLOR,
      GAP_MARKER_COLOR,
      INTERSECTION_MARKER_COLOR,
      ...COMPARISON_CURVE_COLORS.slice(0, 3),
    ];
    expect(new Set(used).size).toBe(used.length);
  });

  it('按索引稳定取色，超出调色板时循环', () => {
    expect(comparisonCurveColor(0)).toBe(COMPARISON_CURVE_COLORS[0]);
    expect(comparisonCurveColor(1)).toBe(COMPARISON_CURVE_COLORS[1]);
    expect(comparisonCurveColor(2)).toBe(COMPARISON_CURVE_COLORS[2]);
    expect(comparisonCurveColor(3)).toBe(COMPARISON_CURVE_COLORS[0]);
    expect(comparisonCurveColor(-1)).toBe(COMPARISON_CURVE_COLORS[2]);
  });
});

describe('多曲线有限值范围', () => {
  it('取全部曲线的并集并忽略空值', () => {
    const range = finiteYRange([
      {
        points: [
          [0, 1],
          [1, null],
          [2, 3],
        ],
        expression: 'f',
      },
      {
        points: [
          [0, -2],
          [1, 4],
        ],
        expression: 'g',
      },
    ]);
    expect(range).toEqual({ min: -2, max: 4 });
  });

  it('没有有限值时退回默认区间', () => {
    expect(finiteYRange([{ points: [[0, null]], expression: 'f' }])).toEqual({
      min: 0,
      max: 1,
    });
  });

  it('全部为同一常数时适当加宽', () => {
    const range = finiteYRange([
      {
        points: [
          [0, 5],
          [1, 5],
        ],
        expression: 'f',
      },
    ]);
    expect(range.min).toBeLessThan(5);
    expect(range.max).toBeGreaterThan(5);
    expect(range.max - range.min).toBeGreaterThanOrEqual(1);
  });
});

describe('曲线表达式无障碍标签', () => {
  it('单条曲线只返回表达式本身', () => {
    expect(curveExpressionsLabel([{ points: [], expression: 'x^2' }])).toBe(
      'x^2',
    );
  });

  it('多条曲线以「与」连接', () => {
    expect(
      curveExpressionsLabel([
        { points: [], expression: 'x^2' },
        { points: [], expression: 'abs(x)' },
      ]),
    ).toBe('x^2 与 abs(x)');
  });
});
