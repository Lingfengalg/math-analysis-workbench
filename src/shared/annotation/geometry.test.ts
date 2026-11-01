import { describe, expect, it } from 'vitest';
import {
  toPx,
  clamp01,
  distanceToSegment,
  pointInRect,
  strokeHit,
} from './geometry';
import type { StrokeItem } from './model';

const stroke: StrokeItem = {
  kind: 'stroke',
  id: 's1',
  color: '#000000',
  width: 4,
  points: [
    { x: 0, y: 0.5 },
    { x: 1, y: 0.5 },
  ],
};

describe('annotation geometry', () => {
  it('归一化坐标转像素', () => {
    expect(toPx({ x: 0.5, y: 0.25 }, 200, 400)).toEqual({ x: 100, y: 100 });
  });

  it('clamp01 处理越界与 NaN', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(Number.NaN)).toBe(0);
    expect(clamp01(0.4)).toBeCloseTo(0.4);
  });

  it('点到线段距离', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    expect(distanceToSegment({ x: 5, y: 0 }, a, b)).toBeCloseTo(0);
    expect(distanceToSegment({ x: 5, y: 3 }, a, b)).toBeCloseTo(3);
    expect(distanceToSegment({ x: -4, y: 0 }, a, b)).toBeCloseTo(4);
    expect(distanceToSegment({ x: 5, y: 5 }, a, a)).toBeCloseTo(
      Math.hypot(5, 5),
    );
  });

  it('命中测试：中线附近命中，远处不命中', () => {
    expect(strokeHit({ x: 0.5, y: 0.5 }, stroke, 200, 200)).toBe(true);
    expect(strokeHit({ x: 0.5, y: 0.9 }, stroke, 200, 200)).toBe(false);
  });

  it('命中测试考虑笔宽', () => {
    const thick: StrokeItem = { ...stroke, width: 40 };
    expect(strokeHit({ x: 0.5, y: 0.6 }, thick, 200, 200)).toBe(true);
    expect(strokeHit({ x: 0.5, y: 0.6 }, stroke, 200, 200)).toBe(false);
  });

  it('点是否在矩形内', () => {
    expect(pointInRect({ x: 5, y: 5 }, 0, 0, 10, 10)).toBe(true);
    expect(pointInRect({ x: 11, y: 5 }, 0, 0, 10, 10)).toBe(false);
  });
});
