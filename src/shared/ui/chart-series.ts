import type { PlotPoint } from '@/shared/contracts';

/** FunctionChart 的一条曲线（主曲线或对比曲线）。 */
export interface ChartCurve {
  points: PlotPoint[];
  expression: string;
  gapMarkers?: number[];
}

export const MAIN_CURVE_COLOR = '#485bb2';
export const GAP_MARKER_COLOR = '#c47f17';
// 与主曲线蓝、疑似间断橙 #c47f17 保持可区分；渐近提示色（#60）为 #0e7490。
export const COMPARISON_CURVE_COLORS = ['#b03a5b', '#2f855a', '#7b5ea7'];

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
