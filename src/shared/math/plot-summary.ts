import type { PlotPoint } from '@/shared/contracts';

export interface GapRange {
  from: number;
  to: number;
}

export interface PlotSummary {
  finiteCount: number;
  minY: number | null;
  maxY: number | null;
  gapRanges: GapRange[];
}

/**
 * Derive a text-friendly summary from sampled points. Neighbouring gap x
 * values whose spacing is at most a few sample steps are merged into one
 * range (domain holes); isolated gaps (poles, jumps) stay single points.
 * Pure derivation from already sampled data — no expression evaluation.
 */
export function summarizePlot(points: PlotPoint[]): PlotSummary {
  const gapXs: number[] = [];
  let minY: number | null = null;
  let maxY: number | null = null;
  let finiteCount = 0;
  for (const [x, y] of points) {
    if (y === null) gapXs.push(x);
    else {
      finiteCount += 1;
      if (minY === null || y < minY) minY = y;
      if (maxY === null || y > maxY) maxY = y;
    }
  }
  const range =
    points.length > 0 ? points[points.length - 1][0] - points[0][0] : 0;
  const mergeThreshold =
    (Math.max(range, Number.EPSILON) / Math.max(points.length, 2)) * 3;
  const gapRanges: GapRange[] = [];
  for (const x of gapXs) {
    const last = gapRanges[gapRanges.length - 1];
    if (last && x - last.to <= mergeThreshold) last.to = x;
    else gapRanges.push({ from: x, to: x });
  }
  return { finiteCount, minY, maxY, gapRanges };
}

/** Compact, deterministic formatting for summary values. */
export function formatNumber(value: number): string {
  if (value === 0) return '0';
  const magnitude = Math.abs(value);
  if (magnitude >= 10000 || magnitude < 0.001) return value.toExponential(3);
  return String(Number(value.toPrecision(5)));
}

export function formatGapRange(range: GapRange): string {
  if (range.from === range.to) return `x = ${formatNumber(range.from)}`;
  return `x ∈ [${formatNumber(range.from)}, ${formatNumber(range.to)}]`;
}
