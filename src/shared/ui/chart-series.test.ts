import { describe, expect, it } from 'vitest';
import {
  COMPARISON_CURVE_COLORS,
  comparisonCurveColor,
  curveExpressionsLabel,
  finiteYRange,
  GAP_MARKER_COLOR,
  INTERSECTION_MARKER_COLOR,
  MAIN_CURVE_COLOR,
  TANGENT_COLOR,
  TAYLOR_COLOR,
  taylorPolynomialLabel,
  tangentPoints,
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

  it('切线颜色与主曲线、间断标记、对比三色均可区分', () => {
    const used = [
      TANGENT_COLOR,
      MAIN_CURVE_COLOR,
      GAP_MARKER_COLOR,
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

describe('切线端点', () => {
  it('按 y = value + slope·(x − x0) 计算区间两端点', () => {
    const points = tangentPoints({
      x0: 1,
      slope: 2,
      value: 1,
      xMin: -5,
      xMax: 5,
    });
    expect(points).toEqual([
      [-5, -11],
      [5, 9],
    ]);
  });

  it('水平切线两端点与切点同高', () => {
    const points = tangentPoints({
      x0: 0,
      slope: 0,
      value: 4,
      xMin: -2,
      xMax: 2,
    });
    expect(points).toEqual([
      [-2, 4],
      [2, 4],
    ]);
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

describe('泰勒多项式可读标签', () => {
  it('sin 在 0 处的 T₃：x − 0.16667·x^3', () => {
    expect(taylorPolynomialLabel([0, 1, 0, -1 / 6], 0)).toBe('x − 0.16667·x^3');
  });

  it('exp 在 0 处的 T₂：1 + x + 0.5·x^2', () => {
    expect(taylorPolynomialLabel([1, 1, 0.5], 0)).toBe('1 + x + 0.5·x^2');
  });

  it('展开中心非零时以 (x − a) 形式展开', () => {
    expect(taylorPolynomialLabel([1, 2, 3], 1)).toBe(
      '1 + 2·(x − 1) + 3·(x − 1)^2',
    );
  });

  it('系数为 0 的项跳过；全零时输出 0；系数 −1 输出 −x', () => {
    expect(taylorPolynomialLabel([0, 0, 1], 0)).toBe('x^2');
    expect(taylorPolynomialLabel([0, 0, 0], 0)).toBe('0');
    expect(taylorPolynomialLabel([0, -1], 0)).toBe('−x');
  });
});

it('泰勒颜色与现有曲线和标记互不相同', () => {
  const used = [
    TAYLOR_COLOR,
    TANGENT_COLOR,
    MAIN_CURVE_COLOR,
    GAP_MARKER_COLOR,
    INTERSECTION_MARKER_COLOR,
    ...COMPARISON_CURVE_COLORS,
  ];
  expect(new Set(used).size).toBe(used.length);
});
