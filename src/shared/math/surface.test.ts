import { describe, expect, it } from 'vitest';
import { compileSurfaceExpression, sampleSurface } from './surface';

describe('二元实函数安全表达式编译器 compileSurfaceExpression', () => {
  it.each([
    ['sin(x) * cos(y)', Math.PI / 2, 0, 1],
    ['e^(-(x^2 + y^2))', 1, 1, Math.exp(-2)],
    ['2^(x - y)', 4, 1, 8],
    ['(x^2 + y^2)^(-1)', 1, 1, 0.5],
    ['min(x, y)', 3, -2, -2],
    ['max(x^2, y + 5)', -3, 2, 9],
    ['min(max(x + y, -1), 1)', -4, 1, -1],
    ['ln(e^3) + lg(100) + log(e)', 0, 0, 6],
    ['asin(0.5) + acos(0.5)', 0, 0, Math.PI / 2],
    ['atan(y / x)', 1, 1, Math.PI / 4],
    ['sinh(0) + cosh(0) + tanh(0)', 0, 0, 1],
    ['abs(x - y) + sqrt(x + y) + cbrt(x * y)', 1, 8, 7 + 3 + 2],
    ['sign(x * y) + floor(x) + ceil(y)', -1.2, 2.1, -1 - 2 + 3],
  ])('表达式 %s 在 (%s, %s) 处精确求值', (expr, x, y, expected) => {
    expect(compileSurfaceExpression(expr)(x, y)).toBeCloseTo(expected, 10);
  });

  it('支持实奇次根有理分数幂（如 x^(2/3) + y^(2/3) 全平面连续）与偶分母定义域裁剪', () => {
    const astroidCap = compileSurfaceExpression('x^(2/3) + y^(2/3)');
    expect(astroidCap(-8, -27)).toBeCloseTo(4 + 9, 10);
    expect(astroidCap(0, 0)).toBe(0);
    expect(astroidCap(8, -8)).toBeCloseTo(8, 10);

    const reducedOdd = compileSurfaceExpression('(x + y)^(2/6)');
    expect(reducedOdd(-10, 2)).toBeCloseTo(-2, 10);

    const negativeOdd = compileSurfaceExpression('(x - y)^(-(1/3))');
    expect(negativeOdd(0, 8)).toBeCloseTo(-0.5, 10);
    expect(negativeOdd(3, 3)).toBeNull();

    const evenDen = compileSurfaceExpression('(x + y)^(3/4)');
    expect(evenDen(-2, 1)).toBeNull();
    expect(evenDen(8, 8)).toBeCloseTo(8, 10);
  });

  it('对奇点、定义域外与超出 1e6 的数值统一返回 null', () => {
    expect(compileSurfaceExpression('(x * y) / (x^2 + y^2)')(0, 0)).toBeNull();
    expect(compileSurfaceExpression('sqrt(4 - x^2 - y^2)')(2, 1)).toBeNull();
    expect(compileSurfaceExpression('ln(x * y)')(-1, 2)).toBeNull();
    expect(compileSurfaceExpression('exp(x + y)')(500, 500)).toBeNull();
    expect(compileSurfaceExpression('x + y')(Number.NaN, 1)).toBeNull();
    expect(
      compileSurfaceExpression('x + y')(1, Number.POSITIVE_INFINITY),
    ).toBeNull();
  });

  it.each([
    'x^y',
    'y^x',
    '(x + 1)^(y - 1)',
    'x^x',
    '2^100',
    '(-2)^(x + y)',
    '0^(x + y)',
    '1001^(x + y)',
    'x^(21/3)',
    'y^(1/21)',
    'x^(1/0)',
    'eval("1")',
    'Function("return 1")()',
    'x = 2',
    '[x, y]',
    'x.constructor',
    'z + 1',
    'min(x)',
    'max(x, y, 1)',
    'sin(x, y)',
    'x > y',
    'x; y',
  ])('静态白名单拦截非法或危险表达式：%s', (expr) => {
    expect(() => compileSurfaceExpression(expr)).toThrow();
  });

  it('拦截空串、超长字符串与超限 AST 节点数', () => {
    expect(() => compileSurfaceExpression('   ')).toThrow();
    expect(() => compileSurfaceExpression('x'.repeat(161))).toThrow();
    const deepSum = Array.from({ length: 65 }, () => 'x').join('+');
    expect(deepSum.length).toBeLessThanOrEqual(160);
    expect(() => compileSurfaceExpression(deepSum)).toThrow();
  });
});

describe('三维曲面网格采样 sampleSurface', () => {
  it('按行主序（j 遍历 gridY，i 遍历 gridX）生成精确网格并统计极值与留空', () => {
    const res = sampleSurface({
      expression: '2 * x + 5 * y',
      xMin: -2,
      xMax: 2,
      yDomainMin: -1,
      yDomainMax: 3,
      gridSize: 16,
    });

    expect(res.gridX).toHaveLength(17);
    expect(res.gridY).toHaveLength(17);
    expect(res.zValues).toHaveLength(17 * 17);
    expect(res.validCount).toBe(289);
    expect(res.gaps).toBe(0);
    expect(res.zDataMin).toBeCloseTo(2 * -2 + 5 * -1, 10);
    expect(res.zDataMax).toBeCloseTo(2 * 2 + 5 * 3, 10);

    // 验证行主序索引 zValues[j * (N + 1) + i] = f(gridX[i], gridY[j])
    const i = 3;
    const j = 11;
    expect(res.zValues[j * 17 + i]).toBeCloseTo(
      2 * res.gridX[i] + 5 * res.gridY[j],
      10,
    );
  });

  it('含定义域留空或全空曲面时正确统计 validCount、gaps 与 zDataMin/zDataMax', () => {
    const partial = sampleSurface({
      expression: 'sqrt(1 - x^2 - y^2)',
      xMin: -2,
      xMax: 2,
      yDomainMin: -2,
      yDomainMax: 2,
      gridSize: 16,
    });
    expect(partial.validCount).toBeGreaterThan(0);
    expect(partial.gaps).toBeGreaterThan(0);
    expect(partial.validCount + partial.gaps).toBe(17 * 17);
    expect(partial.zDataMin).toBeGreaterThanOrEqual(0);
    expect(partial.zDataMax).toBeCloseTo(1, 5);

    const empty = sampleSurface({
      expression: 'sqrt(-1 - x^2 - y^2)',
      xMin: -2,
      xMax: 2,
      yDomainMin: -2,
      yDomainMax: 2,
      gridSize: 16,
    });
    expect(empty.validCount).toBe(0);
    expect(empty.gaps).toBe(289);
    expect(empty.zDataMin).toBeNull();
    expect(empty.zDataMax).toBeNull();
  });

  it('拒绝非法的定义域区间与网格参数', () => {
    expect(() =>
      sampleSurface({
        expression: 'x + y',
        xMin: 2,
        xMax: -2,
        yDomainMin: -1,
        yDomainMax: 1,
        gridSize: 16,
      }),
    ).toThrow();

    expect(() =>
      sampleSurface({
        expression: 'x + y',
        xMin: -2,
        xMax: 2,
        yDomainMin: 3,
        yDomainMax: 1,
        gridSize: 16,
      }),
    ).toThrow();
  });
});

describe('二重积分黎曼柱体仿真与高精度参考积分', () => {
  it('矩形域线性函数积分：∬_{[0,2]×[0,2]} (x + 2y + 1) dx dy 精确等于 16', () => {
    const res = sampleSurface({
      expression: 'x + 2 * y + 1',
      xMin: -1,
      xMax: 3,
      yDomainMin: -1,
      yDomainMax: 3,
      gridSize: 20,
      integral: {
        regionType: 'rectangle',
        xStart: 0,
        xEnd: 2,
        yStart: 0,
        yEnd: 2,
        partitions: 10,
        rule: 'midpoint',
      },
    });

    const integral = res.integralResult!;
    expect(integral).toBeDefined();
    expect(integral.prisms).toHaveLength(100);
    expect(integral.riemannSum).toBeCloseTo(16, 12);
    expect(integral.referenceIntegral).toBeCloseTo(16, 12);
    expect(integral.absError).toBeCloseTo(0, 12);
    expect(integral.domainArea).toBeCloseTo(4, 12);
    expect(integral.meanValue).toBeCloseTo(4, 12);
    expect(integral.positiveVolume).toBeCloseTo(16, 12);
    expect(integral.negativeVolume).toBe(0);
  });

  it('支持左下端点/右上端点取样、开定义域边界回退及正负有符号体积分解', () => {
    const lowerRes = sampleSurface({
      expression: 'x + 2 * y + 1',
      xMin: 0,
      xMax: 2,
      yDomainMin: 0,
      yDomainMax: 2,
      gridSize: 16,
      integral: {
        regionType: 'rectangle',
        xStart: 0,
        xEnd: 2,
        yStart: 0,
        yEnd: 2,
        partitions: 8,
        rule: 'lower-left',
      },
    });
    const upperRes = sampleSurface({
      expression: 'x + 2 * y + 1',
      xMin: 0,
      xMax: 2,
      yDomainMin: 0,
      yDomainMax: 2,
      gridSize: 16,
      integral: {
        regionType: 'rectangle',
        xStart: 0,
        xEnd: 2,
        yStart: 0,
        yEnd: 2,
        partitions: 8,
        rule: 'upper-right',
      },
    });
    expect(lowerRes.integralResult!.riemannSum).toBeLessThan(16);
    expect(upperRes.integralResult!.riemannSum).toBeGreaterThan(16);

    // 边界 x=0, y=0 不在 ln(x + y) 开定义域内，lower-left 自动回退至子元中心
    const openBoundary = sampleSurface({
      expression: 'ln(x + y)',
      xMin: 0,
      xMax: 2,
      yDomainMin: 0,
      yDomainMax: 2,
      gridSize: 16,
      integral: {
        regionType: 'rectangle',
        xStart: 0,
        xEnd: 2,
        yStart: 0,
        yEnd: 2,
        partitions: 8,
        rule: 'lower-left',
      },
    });
    expect(openBoundary.integralResult!.prisms).toHaveLength(64);
    expect(
      openBoundary.integralResult!.positiveVolume +
        openBoundary.integralResult!.negativeVolume,
    ).toBe(openBoundary.integralResult!.riemannSum);
    expect(openBoundary.integralResult!.positiveVolume).toBeGreaterThan(0);
    expect(openBoundary.integralResult!.negativeVolume).toBeLessThan(0);
  });

  it('圆域极坐标积分：上半球体积 ∬_{x²+y²≤4} √(4-x²-y²) dx dy ≈ 16π/3 且面积 ≈ 4π', () => {
    const exactVolume = (16 * Math.PI) / 3;
    const exactArea = 4 * Math.PI;

    const res = sampleSurface({
      expression: 'sqrt(4 - x^2 - y^2)',
      xMin: -2.5,
      xMax: 2.5,
      yDomainMin: -2.5,
      yDomainMax: 2.5,
      gridSize: 32,
      integral: {
        regionType: 'disk',
        xStart: -2,
        xEnd: 2,
        yStart: -2,
        yEnd: 2,
        partitions: 36,
        rule: 'midpoint',
      },
    });

    const integral = res.integralResult!;
    expect(Math.abs(integral.referenceIntegral - exactVolume)).toBeLessThan(
      0.01,
    );
    expect(Math.abs(integral.domainArea - exactArea)).toBeLessThan(0.01);
    expect(Math.abs(integral.riemannSum - exactVolume)).toBeLessThan(0.05);
    expect(integral.meanValue).toBeCloseTo(exactVolume / exactArea, 3);
  });

  it('三角形域定限累次积分：∬_{0≤x≤2, 0≤y≤x} x dx dy = 8/3', () => {
    const exact = 8 / 3;
    const coarse = sampleSurface({
      expression: 'x',
      xMin: 0,
      xMax: 2,
      yDomainMin: 0,
      yDomainMax: 2,
      gridSize: 16,
      integral: {
        regionType: 'triangle',
        xStart: 0,
        xEnd: 2,
        yStart: 0,
        yEnd: 2,
        partitions: 8,
        rule: 'midpoint',
      },
    });
    const fine = sampleSurface({
      expression: 'x',
      xMin: 0,
      xMax: 2,
      yDomainMin: 0,
      yDomainMax: 2,
      gridSize: 16,
      integral: {
        regionType: 'triangle',
        xStart: 0,
        xEnd: 2,
        yStart: 0,
        yEnd: 2,
        partitions: 36,
        rule: 'midpoint',
      },
    });

    expect(fine.integralResult!.referenceIntegral).toBeCloseTo(exact, 12);
    expect(fine.integralResult!.domainArea).toBeCloseTo(2, 12);
    expect(fine.integralResult!.meanValue).toBeCloseTo(4 / 3, 12);
    expect(fine.integralResult!.absError).toBeLessThan(0.06);
    expect(fine.integralResult!.absError).toBeLessThan(
      coarse.integralResult!.absError,
    );
  });
});

describe('多元偏导数、梯度模长与三维截痕曲线 probeResult', () => {
  it('光滑马鞍面 x^2 - y^2 在 (1, 2) 处精确计算偏导 fx=2, fy=-4、梯度与 101 点截痕', () => {
    const res = sampleSurface({
      expression: 'x^2 - y^2',
      xMin: -3,
      xMax: 3,
      yDomainMin: -3,
      yDomainMax: 3,
      gridSize: 24,
      probe: { x0: 1, y0: 2 },
    });

    const probe = res.probeResult!;
    expect(probe).toBeDefined();
    expect(probe.x0).toBe(1);
    expect(probe.y0).toBe(2);
    expect(probe.z0).toBeCloseTo(-3, 10);
    expect(probe.fx).toBeCloseTo(2, 6);
    expect(probe.fy).toBeCloseTo(-4, 6);
    expect(probe.gradNorm).toBeCloseTo(Math.hypot(2, -4), 6);
    expect(probe.sliceX).toHaveLength(101);
    expect(probe.sliceY).toHaveLength(101);
    expect(probe.sliceX[0]).toEqual([-3, 9 - 4]);
    expect(probe.sliceY[0]).toEqual([-3, 1 - 9]);
  });

  it('对二元极限反例 (x*y)/(x^2+y^2)、圆锥尖点 sqrt(x^2+y^2) 与尖脊 x^(2/3)+y^(2/3) 安全识别不可偏导', () => {
    const singular = sampleSurface({
      expression: '(x * y) / (x^2 + y^2)',
      xMin: -2,
      xMax: 2,
      yDomainMin: -2,
      yDomainMax: 2,
      gridSize: 20,
      probe: { x0: 0, y0: 0 },
    });
    expect(singular.probeResult!.z0).toBeNull();
    expect(singular.probeResult!.fx).toBeNull();
    expect(singular.probeResult!.fy).toBeNull();
    expect(singular.probeResult!.gradNorm).toBeNull();
    expect(singular.probeResult!.sliceX).toHaveLength(101);
    expect(singular.probeResult!.sliceX[50]).toEqual([0, null]);

    const cone = sampleSurface({
      expression: 'sqrt(x^2 + y^2)',
      xMin: -2,
      xMax: 2,
      yDomainMin: -2,
      yDomainMax: 2,
      gridSize: 20,
      probe: { x0: 0, y0: 0 },
    });
    expect(cone.probeResult!.z0).toBe(0);
    expect(cone.probeResult!.fx).toBeNull();
    expect(cone.probeResult!.fy).toBeNull();
    expect(cone.probeResult!.gradNorm).toBeNull();

    const cuspRidge = sampleSurface({
      expression: 'x^(2/3) + y^(2/3)',
      xMin: -2,
      xMax: 2,
      yDomainMin: -2,
      yDomainMax: 2,
      gridSize: 20,
      probe: { x0: 0, y0: 1 },
    });
    expect(cuspRidge.probeResult!.z0).toBeCloseTo(1, 10);
    expect(cuspRidge.probeResult!.fx).toBeNull();
    expect(cuspRidge.probeResult!.fy).toBeCloseTo(2 / 3, 5);
    expect(cuspRidge.probeResult!.gradNorm).toBeNull();
  });

  it('单侧越出定义域时自动退化为单侧差商求导', () => {
    const boundary = sampleSurface({
      expression: '3 * x + y * sqrt(y)',
      xMin: -2,
      xMax: 2,
      yDomainMin: 0,
      yDomainMax: 2,
      gridSize: 16,
      probe: { x0: 1, y0: 0 },
    });
    expect(boundary.probeResult!.z0).toBeCloseTo(3, 10);
    expect(boundary.probeResult!.fx).toBeCloseTo(3, 6);
    expect(boundary.probeResult!.fy).toBeCloseTo(0, 2);
    expect(boundary.probeResult!.gradNorm).toBeCloseTo(3, 2);
  });
});
