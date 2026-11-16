import { describe, expect, it } from 'vitest';
import {
  createPlotLink,
  createSurfacePlotLink,
  parsePlotSearch,
  parseSurfacePlotSearch,
} from './plot-link';

describe('跨模块绘图契约', () => {
  it('表达式中的特殊字符可往返传递', () => {
    const request = {
      expression: 'sin(x) + x^2',
      xMin: -3,
      xMax: 3,
      sourceKnowledgeId: 'limit-square',
    };
    const link = createPlotLink(request);
    expect(parsePlotSearch(new URLSearchParams(link.split('?')[1]))).toEqual(
      request,
    );
  });

  it('对比函数、纵轴范围与差商参数可往返传递', () => {
    const request = {
      expression: 'sin(x)',
      compareExpression: 'x - x^3/6',
      xMin: -4,
      xMax: 4,
      yMin: -2,
      yMax: 2,
      secant: { x0: 0, h: 0.5 },
      sourceMistakeId: 'mistake-lhopital',
    };
    const link = createPlotLink(request);
    expect(parsePlotSearch(new URLSearchParams(link.split('?')[1]))).toEqual(
      request,
    );
  });

  it('三维多元曲面与二重积分参数可往返传递', () => {
    const request = {
      expression: '2 - 0.25 * (x^2 + y^2)',
      xMin: -2,
      xMax: 2,
      yDomainMin: -2,
      yDomainMax: 2,
      gridSize: 56,
      integral: {
        regionType: 'disk' as const,
        xStart: -2,
        xEnd: 2,
        yStart: -2,
        yEnd: 2,
        partitions: 16,
        rule: 'midpoint' as const,
      },
      probe: { x0: 0.5, y0: -0.5 },
      sourceKnowledgeId: 'integral-double-riemann',
    };
    const link = createSurfacePlotLink(request);
    const search = new URLSearchParams(link.split('?')[1]);
    expect(parsePlotSearch(search)).toBeNull();
    expect(parseSurfacePlotSearch(search)).toEqual(request);
  });

  it('没有表达式或参数错误时返回 null', () => {
    expect(parsePlotSearch(new URLSearchParams())).toBeNull();
    expect(
      parsePlotSearch(new URLSearchParams('expression=x&xMin=NaN')),
    ).toBeNull();
    expect(
      parsePlotSearch(new URLSearchParams('expression=x&xMin=5&xMax=-5')),
    ).toBeNull();
    expect(
      parseSurfacePlotSearch(
        new URLSearchParams('mode=3d&expression=x+y&xMin=5&xMax=-5'),
      ),
    ).toBeNull();
  });
});
