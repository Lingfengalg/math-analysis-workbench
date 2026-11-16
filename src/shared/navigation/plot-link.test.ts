import { describe, expect, it } from 'vitest';
import {
  createPlotLink,
  createSurfacePlotLink,
  createTriplePlotLink,
  parsePlotSearch,
  parseSurfacePlotSearch,
  parseTriplePlotSearch,
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

  it('三维多元曲面与一般曲边域二重积分参数可往返传递', () => {
    const request = {
      expression: 'x + 2 * y',
      xMin: 0,
      xMax: 1,
      yDomainMin: 0,
      yDomainMax: 1,
      gridSize: 56,
      integral: {
        regionType: 'x-type' as const,
        xStart: 0,
        xEnd: 1,
        yStart: 0,
        yEnd: 1,
        yLowerExpr: 'x^2',
        yUpperExpr: 'sqrt(x)',
        partitions: 16,
        rule: 'midpoint' as const,
      },
      probe: { x0: 0.5, y0: 0.5 },
      sourceKnowledgeId: 'integral-double-riemann',
    };
    const link = createSurfacePlotLink(request);
    const search = new URLSearchParams(link.split('?')[1]);
    expect(parsePlotSearch(search)).toBeNull();
    expect(parseSurfacePlotSearch(search)).toEqual(request);
  });

  it('三重积分空间区域与截面参数可往返传递', () => {
    const request = {
      expression: 'x^2 + y^2 + z',
      regionType: 'paraboloid-cap' as const,
      xMin: -2,
      xMax: 2,
      yMin: -2,
      yMax: 2,
      zMin: 0,
      zMax: 4,
      partitions: 14,
      sliceZ: 2,
      sourceKnowledgeId: 'integral-triple-space',
    };
    const link = createTriplePlotLink(request);
    const search = new URLSearchParams(link.split('?')[1]);
    expect(parsePlotSearch(search)).toBeNull();
    expect(parseTriplePlotSearch(search)).toEqual(request);
  });

  it('没有表达式或参数错误时返回 null', () => {
    expect(parsePlotSearch(new URLSearchParams())).toBeNull();
    expect(
      parsePlotSearch(new URLSearchParams('expression=x&xMin=NaN')),
    ).toBeNull();
    expect(
      parseSurfacePlotSearch(
        new URLSearchParams('mode=3d&expression=x+y&xMin=5&xMax=-5'),
      ),
    ).toBeNull();
    expect(
      parseTriplePlotSearch(
        new URLSearchParams('mode=3d-triple&expression=1&zMin=5&zMax=-5'),
      ),
    ).toBeNull();
  });
});
