import { describe, expect, it } from 'vitest';
import { detectIntersections, MAX_INTERSECTION_POINTS } from './intersections';

const identity = (x: number) => x;
const square = (x: number) => x * x;
const constant = (value: number) => () => value;
const reciprocal = (x: number) => (x === 0 ? null : 1 / x);

describe('近似交点检测（数值二分）', () => {
  it('x^2 与 2 交于 ±√2，误差受控', () => {
    const points = detectIntersections(square, constant(2), -5, 5);
    expect(points).toHaveLength(2);
    expect(points[0].x).toBeCloseTo(-Math.SQRT2, 9);
    expect(points[1].x).toBeCloseTo(Math.SQRT2, 9);
    for (const point of points) expect(point.y).toBeCloseTo(2, 6);
  });

  it('无交点时不产生标记', () => {
    expect(detectIntersections(Math.sin, constant(2), -5, 5)).toEqual([]);
    expect(detectIntersections(square, constant(-1), -5, 5)).toEqual([]);
  });

  it('切触（相切）不标：x^2 与 0 只切不穿', () => {
    expect(detectIntersections(square, constant(0), -5, 5)).toEqual([]);
  });

  it('恰在样本点上穿越零点的交点：x 与 0 交于原点', () => {
    const points = detectIntersections(identity, constant(0), -1, 1);
    expect(points).toHaveLength(1);
    expect(points[0].x).toBeCloseTo(0, 9);
    expect(points[0].y).toBeCloseTo(0, 9);
  });

  it('曲线在部分区域不可求值时仍能检测其余交点：1/x 与 2 交于 0.5', () => {
    const points = detectIntersections(reciprocal, constant(2), -5, 5);
    expect(points).toHaveLength(1);
    expect(points[0].x).toBeCloseTo(0.5, 9);
    expect(points[0].y).toBeCloseTo(2, 6);
  });

  it('完全重合的两条曲线不产生标记', () => {
    expect(detectIntersections(square, square, -5, 5)).toEqual([]);
  });

  it('交点超过上限时按 x 升序截断', () => {
    const points = detectIntersections(
      (x) => Math.sin(20 * x),
      constant(0),
      -5,
      5,
    );
    expect(points).toHaveLength(MAX_INTERSECTION_POINTS);
    for (let i = 1; i < points.length; i += 1)
      expect(points[i].x).toBeGreaterThan(points[i - 1].x);
  });

  it('无效区间与步数报错', () => {
    expect(() => detectIntersections(identity, identity, 5, 5)).toThrow(
      '观察区间无效',
    );
    expect(() => detectIntersections(identity, identity, 0, 1, 2)).toThrow(
      '扫描步数',
    );
  });
});
