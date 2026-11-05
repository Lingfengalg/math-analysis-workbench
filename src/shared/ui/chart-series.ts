import type { PlotPoint } from '@/shared/contracts';
import { formatNumber } from '@/shared/math/plot-summary';

/** FunctionChart 的一条曲线（主曲线或对比曲线）。 */
export interface ChartCurve {
  points: PlotPoint[];
  expression: string;
  gapMarkers?: number[];
}

export const MAIN_CURVE_COLOR = '#485bb2';
export const GAP_MARKER_COLOR = '#c47f17';
export const INTERSECTION_MARKER_COLOR = '#854d0e';
// 对比曲线色与主曲线蓝、疑似间断橙 #c47f17 保持可区分；渐近提示色（#60）
// 为 #0e7490；交点标记色 #854d0e 也与以上各色保持可区分。
export const COMPARISON_CURVE_COLORS = ['#b03a5b', '#2f855a', '#7b5ea7'];
// 切线：亮青色，与渐近提示的深青 #0e7490 及上述各色保持可区分。
export const TANGENT_COLOR = '#06b6d4';
export const TAYLOR_COLOR = '#d946ef';

/** 第 index 条对比曲线（0 起）的颜色；超出调色板（或负索引）时循环取用。 */
export function comparisonCurveColor(index: number): string {
  const length = COMPARISON_CURVE_COLORS.length;
  return COMPARISON_CURVE_COLORS[((index % length) + length) % length];
}

/** 全部曲线有限 y 值的范围；无有限值时退回默认区间，退化为单点时适当加宽。 */
export function finiteYRange(curves: ChartCurve[]): {
  min: number;
  max: number;
} {
  const finiteYs = curves.flatMap((curve) =>
    curve.points
      .map((point) => point[1])
      .filter((y): y is number => y !== null),
  );
  if (finiteYs.length === 0) return { min: 0, max: 1 };
  const min = Math.min(...finiteYs);
  const max = Math.max(...finiteYs);
  if (min < max) return { min, max };
  const pad = Math.max(Math.abs(min) * 0.05, 0.5);
  return { min: min - pad, max: max + pad };
}

/** 无障碍名称与 aria 描述用的表达式列表，例如「x^2 与 abs(x)」。 */
export function curveExpressionsLabel(curves: ChartCurve[]): string {
  return curves.map((curve) => curve.expression).join(' 与 ');
}

/** 叠加在图上的一条切线：y = value + slope·(x − x0)，横跨观察区间。 */
export interface TangentLine {
  x0: number;
  slope: number;
  value: number;
  xMin: number;
  xMax: number;
}

/** 切线在观察区间两端的采样点；同时用于扩展 y 范围，保证切线可见。 */
export function tangentPoints(tangent: TangentLine): PlotPoint[] {
  const y = (x: number) => tangent.value + tangent.slope * (x - tangent.x0);
  return [
    [tangent.xMin, y(tangent.xMin)],
    [tangent.xMax, y(tangent.xMax)],
  ];
}

/** 叠加在图上的一条泰勒多项式曲线 T_n(x)。 */
export interface TaylorOverlay {
  points: PlotPoint[];
  center: number;
  order: number;
}

/** 系数列表的可读多项式，例如 sin 在 0 处的 T₃：「x − 0.16667·x^3」。 */
export function taylorPolynomialLabel(
  coefficients: number[],
  center: number,
): string {
  const terms: Array<{ negative: boolean; body: string }> = [];
  for (let power = 0; power < coefficients.length; power += 1) {
    const coefficient = coefficients[power];
    if (coefficient === 0) continue;
    const variable =
      center === 0
        ? power === 0
          ? ''
          : power === 1
            ? 'x'
            : `x^${power}`
        : power === 0
          ? ''
          : power === 1
            ? `(x − ${formatNumber(center)})`
            : `(x − ${formatNumber(center)})^${power}`;
    const body =
      Math.abs(coefficient) === 1 && power > 0
        ? variable
        : `${formatNumber(Math.abs(coefficient))}${variable === '' ? '' : '·'}${variable}`;
    terms.push({ negative: coefficient < 0, body });
  }
  if (terms.length === 0) return '0';
  return terms
    .map((term, index) =>
      index === 0
        ? `${term.negative ? '−' : ''}${term.body}`
        : `${term.negative ? ' − ' : ' + '}${term.body}`,
    )
    .join('');
}
