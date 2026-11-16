import { describe, expect, it } from 'vitest';
import { compileVolumeExpression, sampleTripleIntegral } from './volume';

describe('三元实函数安全表达式编译器 compileVolumeExpression', () => {
  it.each([
    ['sin(x) * cos(y) + tan(z)', Math.PI / 2, 0, Math.PI / 4, 2],
    ['e^(-(x^2 + y^2 + z^2))', 1, 1, 0, Math.exp(-2)],
    ['2^(x + y - z)', 3, 2, 1, 16],
    ['(x^2 + y^2 + z^2)^(-1)', 1, 1, 2, 1 / 6],
    ['min(x, y) + max(y, z)', 3, -2, 5, -2 + 5],
    ['min(max(x + y + z, -1), 1)', -4, 1, 0, -1],
    ['ln(e^3) + lg(100) + log(e)', 0, 0, 0, 6],
    ['asin(0.5) + acos(0.5) + atan(z)', 0, 0, 1, Math.PI / 2 + Math.PI / 4],
    ['sinh(0) + cosh(0) + tanh(0)', 0, 0, 0, 1],
    ['abs(x - y) + sqrt(x + z) + cbrt(y * z)', 1, 8, 8, 7 + 3 + 4],
    ['sign(x * y * z) + floor(x) + ceil(y)', -1.2, 2.1, 3, -1 - 2 + 3],
  ])('表达式 %s 在 (%s, %s, %s) 处精确求值', (expr, x, y, z, expected) => {
    expect(compileVolumeExpression(expr)(x, y, z)).toBeCloseTo(expected, 10);
  });

  it('支持实奇次根有理分数幂与偶分母定义域裁剪', () => {
    const astroidSolid = compileVolumeExpression('x^(2/3) + y^(2/3) + z^(2/3)');
    expect(astroidSolid(-8, -27, 1)).toBeCloseTo(4 + 9 + 1, 10);
    expect(astroidSolid(0, 0, 0)).toBe(0);

    const reducedOdd = compileVolumeExpression('(x + y + z)^(2/6)');
    expect(reducedOdd(-10, 2, 0)).toBeCloseTo(-2, 10);

    const negativeOdd = compileVolumeExpression('(x - z)^(-(1/3))');
    expect(negativeOdd(0, 0, 8)).toBeCloseTo(-0.5, 10);
    expect(negativeOdd(3, 1, 3)).toBeNull();

    const evenDen = compileVolumeExpression('(x + y + z)^(3/4)');
    expect(evenDen(-2, 1, 0)).toBeNull();
    expect(evenDen(4, 4, 8)).toBeCloseTo(8, 10);
  });

  it('对奇点、定义域外、非有限输入与超限值统一返回 null', () => {
    expect(
      compileVolumeExpression('(x * y * z) / (x^2 + y^2 + z^2)')(0, 0, 0),
    ).toBeNull();
    expect(
      compileVolumeExpression('sqrt(1 - x^2 - y^2 - z^2)')(1, 1, 0),
    ).toBeNull();
    expect(compileVolumeExpression('ln(x * y * z)')(-1, 2, 1)).toBeNull();
    expect(compileVolumeExpression('exp(x + y + z)')(400, 400, 400)).toBeNull();
    expect(compileVolumeExpression('x + y + z')(Number.NaN, 1, 0)).toBeNull();
    expect(
      compileVolumeExpression('x + y + z')(1, 0, Number.POSITIVE_INFINITY),
    ).toBeNull();
  });

  it.each([
    'x^y',
    'x^z',
    '(x + y)^z',
    'z^z',
    '2^100',
    '(-2)^(x + z)',
    '0^(x + y + z)',
    '1001^(x + z)',
    'x^(21/3)',
    'z^(1/21)',
    'z^(1/0)',
    'eval("1")',
    'Function("return 1")()',
    'x = 2',
    '[x, y, z]',
    'z.constructor',
    'w + 1',
    'min(x)',
    'max(x, y, z)',
    'sin(x, y)',
    'x > z',
    'x; z',
  ])('静态白名单拦截非法或危险表达式：%s', (expr) => {
    expect(() => compileVolumeExpression(expr)).toThrow();
  });

  it('拦截空串、超长字符串与超限 AST 节点数', () => {
    expect(() => compileVolumeExpression('   ')).toThrow();
    expect(() => compileVolumeExpression('x'.repeat(161))).toThrow();
    const deepSum = Array.from({ length: 65 }, () => 'x').join('+');
    expect(deepSum.length).toBeLessThanOrEqual(160);
    expect(() => compileVolumeExpression(deepSum)).toThrow();
  });
});

describe('三重积分体素仿真与高精度 3D Gauss-Legendre 求积 sampleTripleIntegral', () => {
  it('长方体域 box：∭_{[0,1]×[0,2]×[0,3]} (x + 2y + 3z) dV = 42，体积 6', () => {
    const res = sampleTripleIntegral({
      expression: 'x + 2 * y + 3 * z',
      regionType: 'box',
      xMin: 0,
      xMax: 1,
      yMin: 0,
      yMax: 2,
      zMin: 0,
      zMax: 3,
      partitions: 8,
    });

    expect(res.voxels).toHaveLength(512);
    expect(res.voxels.every((v) => v.inSlice === false)).toBe(true);
    expect(res.domainVolume).toBeCloseTo(6, 10);
    expect(res.referenceIntegral).toBeCloseTo(42, 10);
    expect(res.riemannSum).toBeCloseTo(42, 10);
    expect(res.absError).toBeCloseTo(0, 10);
    expect(res.meanDensity).toBeCloseTo(7, 10);
    expect(res.valueMin).toBeGreaterThan(0);
    expect(res.valueMax).toBeLessThan(14);
    expect(res.sliceInfo).toBeUndefined();
  });

  it('球体/椭球域 sphere：单位球 ∭_{x²+y²+z²≤1} (x²+y²+z²) dV = 4π/5，椭球体积 (4/3)πabc', () => {
    const ball = sampleTripleIntegral({
      expression: 'x^2 + y^2 + z^2',
      regionType: 'sphere',
      xMin: -1,
      xMax: 1,
      yMin: -1,
      yMax: 1,
      zMin: -1,
      zMax: 1,
      partitions: 16,
    });
    expect(ball.domainVolume).toBeCloseTo((4 * Math.PI) / 3, 8);
    expect(ball.referenceIntegral).toBeCloseTo((4 * Math.PI) / 5, 8);
    expect(ball.meanDensity).toBeCloseTo(0.6, 8);
    expect(Math.abs(ball.riemannSum - ball.referenceIntegral)).toBeLessThan(
      0.15,
    );

    const ellipsoid = sampleTripleIntegral({
      expression: '1',
      regionType: 'sphere',
      xMin: -2,
      xMax: 2,
      yMin: -1,
      yMax: 1,
      zMin: -3,
      zMax: 3,
      partitions: 10,
    });
    expect(ellipsoid.domainVolume).toBeCloseTo(8 * Math.PI, 8);
    expect(ellipsoid.referenceIntegral).toBeCloseTo(8 * Math.PI, 8);
  });

  it('圆柱域 cylinder：∭_{x²+y²≤4, 0≤z≤3} z*(x²+y²) dV = 36π 且体积 12π', () => {
    const res = sampleTripleIntegral({
      expression: 'z * (x^2 + y^2)',
      regionType: 'cylinder',
      xMin: -2,
      xMax: 2,
      yMin: -2,
      yMax: 2,
      zMin: 0,
      zMax: 3,
      partitions: 14,
      sliceZ: 2,
    });

    expect(res.domainVolume).toBeCloseTo(12 * Math.PI, 8);
    expect(res.referenceIntegral).toBeCloseTo(36 * Math.PI, 7);
    expect(res.sliceInfo).toBeDefined();
    expect(res.sliceInfo!.z).toBe(2);
    expect(res.sliceInfo!.area).toBeCloseTo(4 * Math.PI, 8);
    // z=2 截面上 ∫∫_{r≤2} 2 r^2 r dr dθ = 2 * 2π * (16/4) = 16π
    expect(res.sliceInfo!.sliceIntegral).toBeCloseTo(16 * Math.PI, 8);
  });

  it('四面体域 tetrahedron：∭_{x,y,z≥0, x+y+z≤1} (x+y+z) dV = 1/8 且体积 1/6', () => {
    const res = sampleTripleIntegral({
      expression: 'x + y + z',
      regionType: 'tetrahedron',
      xMin: 0,
      xMax: 1,
      yMin: 0,
      yMax: 1,
      zMin: 0,
      zMax: 1,
      partitions: 12,
      sliceZ: 0.4,
    });

    expect(res.domainVolume).toBeCloseTo(1 / 6, 10);
    expect(res.referenceIntegral).toBeCloseTo(1 / 8, 10);
    expect(res.meanDensity).toBeCloseTo(0.75, 10);
    // z = 0.4 截面为 x + y <= 0.6 (x,y >= 0)，面积 0.5 * 0.6^2 = 0.18
    expect(res.sliceInfo!.area).toBeCloseTo(0.18, 10);
    // ∫_0^0.6 dx ∫_0^{0.6-x} (x + y + 0.4) dy = 0.18 * (0.2 + 0.2 + 0.4) = 0.144
    expect(res.sliceInfo!.sliceIntegral).toBeCloseTo(0.144, 10);
  });

  it('抛物面顶盖域 paraboloid-cap：[-2,2]×[-2,2]×[0,4] 上体积 8π，截面 z_s=2 面积 2π 且精准高亮最近层', () => {
    const res = sampleTripleIntegral({
      expression: 'x^2 + y^2 + z',
      regionType: 'paraboloid-cap',
      xMin: -2,
      xMax: 2,
      yMin: -2,
      yMax: 2,
      zMin: 0,
      zMax: 4,
      partitions: 12,
      sliceZ: 2,
    });

    expect(res.domainVolume).toBeCloseTo(8 * Math.PI, 8);
    // ∭ (r^2 + z) dV on r^2 <= z <= 4: ∫_0^4 dz ∫_0^{√z} (r^2 + z) 2π r dr = 2π ∫_0^4 (z^2/4 + z^2/2) dz = 3π/2 * 64/3 = 32π
    expect(res.referenceIntegral).toBeCloseTo(32 * Math.PI, 7);

    // 验证截面信息：z=2 时截面圆 x^2+y^2 <= 2，面积 2π，截面二重积分 6π
    expect(res.sliceInfo).toBeDefined();
    expect(res.sliceInfo!.z).toBe(2);
    expect(res.sliceInfo!.area).toBeCloseTo(2 * Math.PI, 8);
    expect(res.sliceInfo!.sliceIntegral).toBeCloseTo(6 * Math.PI, 8);

    const highlighted = res.voxels.filter((v) => v.inSlice);
    expect(highlighted.length).toBe(res.sliceInfo!.voxelCount);
    expect(highlighted.length).toBeGreaterThan(0);

    // 所有高亮体素位于同一 z 层，且为离 sliceZ=2 最近的层
    const uniqueZ = new Set(highlighted.map((v) => v.z));
    expect(uniqueZ.size).toBe(1);
    const sliceLayerZ = highlighted[0].z;
    const allLayerZs = Array.from(new Set(res.voxels.map((v) => v.z)));
    const minDist = Math.min(...allLayerZs.map((z) => Math.abs(z - 2)));
    expect(Math.abs(sliceLayerZ - 2)).toBeCloseTo(minDist, 12);

    // 校验所有体素均满足抛物面不等式 z >= zMin + (zMax-zMin)*(((x-cx)/rx)^2 + ((y-cy)/ry)^2)
    for (const v of res.voxels) {
      expect(v.z).toBeGreaterThanOrEqual(v.x * v.x + v.y * v.y - 1e-12);
    }
  });

  it('sliceZ 越界或被积函数全空时安全降级，不崩溃', () => {
    const outOfSlice = sampleTripleIntegral({
      expression: '1',
      regionType: 'box',
      xMin: 0,
      xMax: 1,
      yMin: 0,
      yMax: 1,
      zMin: 0,
      zMax: 1,
      partitions: 4,
      sliceZ: 5,
    });
    expect(outOfSlice.sliceInfo).toBeUndefined();
    expect(outOfSlice.voxels.every((v) => !v.inSlice)).toBe(true);

    const empty = sampleTripleIntegral({
      expression: 'sqrt(-1 - x^2 - y^2 - z^2)',
      regionType: 'box',
      xMin: -1,
      xMax: 1,
      yMin: -1,
      yMax: 1,
      zMin: -1,
      zMax: 1,
      partitions: 4,
      sliceZ: 0,
    });
    expect(empty.voxels).toHaveLength(0);
    expect(empty.domainVolume).toBe(0);
    expect(empty.meanDensity).toBeNull();
    expect(empty.valueMin).toBeNull();
    expect(empty.valueMax).toBeNull();
    expect(empty.sliceInfo).toEqual({
      z: 0,
      area: 0,
      sliceIntegral: 0,
      voxelCount: 0,
    });
  });

  it('拒绝非法区间与分割数参数', () => {
    expect(() =>
      sampleTripleIntegral({
        expression: '1',
        regionType: 'box',
        xMin: 2,
        xMax: 1,
        yMin: 0,
        yMax: 1,
        zMin: 0,
        zMax: 1,
        partitions: 8,
      }),
    ).toThrow();

    expect(() =>
      sampleTripleIntegral({
        expression: '1',
        regionType: 'box',
        xMin: 0,
        xMax: 1,
        yMin: 0,
        yMax: 1,
        zMin: 0,
        zMax: 1,
        partitions: 24,
      }),
    ).toThrow();
  });
});
