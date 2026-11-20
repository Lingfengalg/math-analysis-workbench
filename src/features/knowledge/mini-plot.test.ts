import { describe, expect, it } from 'vitest';
import type { PlotPoint } from '@/shared/contracts';
import { splitSegments, toCanvasPoint } from './mini-plot';

describe('迷你图采样分段（#67）', () => {
  it('按 null 断点切分折线', () => {
    const points: PlotPoint[] = [
      [0, 0],
      [1, 1],
      [2, null],
      [3, 3],
      [4, 4],
    ];
    const segments = splitSegments(points);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toHaveLength(2);
    expect(segments[1]).toHaveLength(2);
  });

  it('连续缺口不会产生空折线', () => {
    const points: PlotPoint[] = [
      [0, null],
      [1, null],
      [2, 0],
      [3, null],
      [4, null],
    ];
    expect(splitSegments(points)).toHaveLength(0);
  });

  it('单点片段不单独成线，避免画出孤点', () => {
    const points: PlotPoint[] = [
      [0, 0],
      [1, null],
      [2, 2],
      [3, 3],
    ];
    const segments = splitSegments(points);
    expect(segments).toHaveLength(1);
    expect(segments[0][0][0]).toBe(2);
  });
});

describe('迷你图坐标映射（#67）', () => {
  const bounds = { xMin: -1, xMax: 1, yMin: -1, yMax: 1 };
  const size = { width: 120, height: 60 };

  it('把范围端点映射到带内边距的画布边缘', () => {
    expect(toCanvasPoint([-1, 1], bounds, size, 6)).toEqual({ x: 6, y: 6 });
    expect(toCanvasPoint([1, -1], bounds, size, 6)).toEqual({ x: 114, y: 54 });
  });

  it('null 值不参与映射', () => {
    expect(toCanvasPoint([0, null], bounds, size)).toBeNull();
  });
});
