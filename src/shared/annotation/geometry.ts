import type { Point, StrokeItem } from './model';

/** 归一化坐标（0–1）转像素坐标 */
export function toPx(point: Point, width: number, height: number): Point {
  return { x: point.x * width, y: point.y * height };
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** 点到线段的最短距离，全部使用像素坐标 */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq),
  );
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** 橡皮按整笔删除，容差取笔宽的一半再加一点余量 */
export function strokeHit(
  point: Point,
  stroke: StrokeItem,
  width: number,
  height: number,
  tolerance = 6,
): boolean {
  if (stroke.points.length === 0) return false;
  const pixel = toPx(point, width, height);
  const points = stroke.points.map((item) => toPx(item, width, height));
  const reach = tolerance + stroke.width / 2;

  if (points.length === 1) {
    return Math.hypot(pixel.x - points[0].x, pixel.y - points[0].y) <= reach;
  }
  for (let index = 0; index < points.length - 1; index += 1) {
    if (distanceToSegment(pixel, points[index], points[index + 1]) <= reach) {
      return true;
    }
  }
  return false;
}

export function pointInRect(
  point: Point,
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  return (
    point.x >= x &&
    point.x <= x + width &&
    point.y >= y &&
    point.y <= y + height
  );
}
