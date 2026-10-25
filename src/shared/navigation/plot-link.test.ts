import { describe, expect, it } from 'vitest';
import { createPlotLink, parsePlotSearch } from './plot-link';

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
  it('没有表达式或参数错误时返回 null', () => {
    expect(parsePlotSearch(new URLSearchParams())).toBeNull();
    expect(
      parsePlotSearch(new URLSearchParams('expression=x&xMin=NaN')),
    ).toBeNull();
    expect(
      parsePlotSearch(new URLSearchParams('expression=x&xMin=5&xMax=-5')),
    ).toBeNull();
    expect(
      parsePlotSearch(new URLSearchParams('expression=x&xMin=&xMax=2')),
    ).toBeNull();
  });
});
