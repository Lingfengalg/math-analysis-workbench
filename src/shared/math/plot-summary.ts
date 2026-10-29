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
 * values are grouped only while consecutive in the sampled sequence;
 * a finite point always separates two gaps. These are sampled gaps, not
 * proof that every point between them is undefined.
 * Pure derivation from already sampled data — no expression evaluation.
 */
export function summarizePlot(points: PlotPoint[]): PlotSummary {
  const gapRanges: GapRange[] = [];
  let previousWasGap = false;
  let minY: number | null = null;
  let maxY: number | null = null;
  let finiteCount = 0;
  for (const [x, y] of points) {
    if (y === null) {
      const last = gapRanges[gapRanges.length - 1];
      if (previousWasGap && last) last.to = x;
      else gapRanges.push({ from: x, to: x });
      previousWasGap = true;
    } else {
      previousWasGap = false;
      finiteCount += 1;
      if (minY === null || y < minY) minY = y;
      if (maxY === null || y > maxY) maxY = y;
    }
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
  return `采样缺口从 x = ${formatNumber(range.from)} 到 x = ${formatNumber(range.to)}`;
}
