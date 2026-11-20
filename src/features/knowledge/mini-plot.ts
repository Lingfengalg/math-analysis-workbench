import type { PlotPoint } from '@/shared/contracts';

export type MiniSegment = PlotPoint[];

/**
 * 按 null 断点把采样点切成若干条折线：缺口处不连线，
 * 与整页图表的「采样缺口」表述保持一致（只表示采样留空，不代表已证明间断）。
 */
export function splitSegments(points: readonly PlotPoint[]): MiniSegment[] {
  const segments: MiniSegment[] = [];
  let current: MiniSegment = [];
  for (const point of points) {
    if (point[1] === null) {
      if (current.length >= 2) segments.push(current);
      current = [];
      continue;
    }
    current.push(point);
  }
  if (current.length >= 2) segments.push(current);
  return segments;
}

/** 采样点到画布坐标的映射；y 轴向上。 */
export function toCanvasPoint(
  point: PlotPoint,
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number },
  size: { width: number; height: number },
  padding = 6,
): { x: number; y: number } | null {
  const [x, y] = point;
  if (y === null) return null;
  const spanX = bounds.xMax - bounds.xMin || 1;
  const spanY = bounds.yMax - bounds.yMin || 1;
  const usableWidth = size.width - padding * 2;
  const usableHeight = size.height - padding * 2;
  return {
    x: padding + ((x - bounds.xMin) / spanX) * usableWidth,
    y: padding + (1 - (y - bounds.yMin) / spanY) * usableHeight,
  };
}
