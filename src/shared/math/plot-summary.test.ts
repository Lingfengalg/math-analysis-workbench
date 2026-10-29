import { describe, expect, it } from 'vitest';
import type { PlotPoint } from '@/shared/contracts';
import { formatGapRange, formatNumber, summarizePlot } from './plot-summary';

describe('采样数据摘要', () => {
  it('平方函数：全部有效，无缺口', () => {
    const summary = summarizePlot([
      [-2, 4],
      [-1, 1],
      [0, 0],
      [1, 1],
      [2, 4],
    ]);
    expect(summary).toEqual({
      finiteCount: 5,
      minY: 0,
      maxY: 4,
      gapRanges: [],
    });
  });
  it('1/x：0 处单点缺口', () => {
    const points: PlotPoint[] = [
      [-1, -1],
      [-0.6, -1.6667],
      [-0.2, -5],
      [0, null],
      [0.2, 5],
      [0.6, 1.6667],
      [1, 1],
    ];
    const summary = summarizePlot(points);
    expect(summary.gapRanges).toEqual([{ from: 0, to: 0 }]);
    expect(summary.finiteCount).toBe(6);
    expect(summary.minY).toBe(-5);
    expect(summary.maxY).toBe(5);
  });
  it('sqrt(x)：相邻缺口合并为区间', () => {
    const summary = summarizePlot([
      [-1, null],
      [-0.5, null],
      [0, 0],
      [0.5, 0.70711],
      [1, 1],
    ]);
    expect(summary.gapRanges).toEqual([{ from: -1, to: -0.5 }]);
  });
  it('有效采样点分隔缺口，不能误合并', () => {
    const summary = summarizePlot([
      [0, null],
      [1, 5],
      [2, null],
      [3, 5],
    ]);
    expect(summary.gapRanges).toEqual([
      { from: 0, to: 0 },
      { from: 2, to: 2 },
    ]);
  });
  it('tan(x)：孤立缺口各自保留', () => {
    const summary = summarizePlot([
      [0, 0],
      [1, 1.5574],
      [1.5, 14.101],
      [1.5708, null],
      [1.7, -7.6966],
      [2.5, -0.747],
      [3.1, -0.0416],
    ]);
    expect(summary.gapRanges).toEqual([{ from: 1.5708, to: 1.5708 }]);
  });
  it('重复的 0 缺口点合并为同一位置', () => {
    // 采样点与插入的断点可能同时落在 0
    const summary = summarizePlot([
      [-0.5, -2],
      [0, null],
      [0, null],
      [0.5, 2],
    ]);
    expect(summary.gapRanges).toEqual([{ from: 0, to: 0 }]);
  });
  it('全部留空：无有效值且合并为单一区间', () => {
    const summary = summarizePlot([
      [0, null],
      [1, null],
      [2, null],
    ]);
    expect(summary.finiteCount).toBe(0);
    expect(summary.minY).toBeNull();
    expect(summary.maxY).toBeNull();
    expect(summary.gapRanges).toEqual([{ from: 0, to: 2 }]);
  });
  it('空数组', () => {
    expect(summarizePlot([])).toEqual({
      finiteCount: 0,
      minY: null,
      maxY: null,
      gapRanges: [],
    });
  });
});

describe('数值格式', () => {
  it.each([
    [0, '0'],
    [0.25, '0.25'],
    [1.5707963, '1.5708'],
    [148.41316, '148.41'],
    [22026, '2.203e+4'],
    [0.0005, '5.000e-4'],
    [-5, '-5'],
  ])('formatNumber(%s) = %s', (value, expected) => {
    expect(formatNumber(value)).toBe(expected);
  });
  it('formatGapRange', () => {
    expect(formatGapRange({ from: 0, to: 0 })).toBe('x = 0');
    expect(formatGapRange({ from: -1, to: -0.5 })).toBe(
      '采样缺口从 x = -1 到 x = -0.5',
    );
  });
});
