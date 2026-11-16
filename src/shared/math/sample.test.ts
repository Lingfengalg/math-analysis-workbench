import { describe, expect, it } from 'vitest';
import { compileExpression, sampleFunction } from './sample';

describe('受限表达式计算', () => {
  it.each([
    ['x^2', 3, 9],
    ['abs(x)', -2, 2],
    ['sin(pi/2)', 0, 1],
    ['sqrt(x)', 4, 2],
    ['x^-2', 2, 0.25],
    ['x^(-2)', -2, 0.25],
    ['x^(0.5)', 9, 3],
    ['ln(e^2)', 0, 2],
    ['log(e^3)', 0, 3],
    ['lg(1000)', 0, 3],
    ['cbrt(x)', -27, -3],
    ['sinh(0)', 0, 0],
    ['cosh(0)', 0, 1],
    ['tanh(0)', 0, 0],
    ['sign(x)', -5, -1],
    ['floor(x)', 2.8, 2],
    ['ceil(x)', -1.2, -1],
    ['x - x^3/6 + x^5/120 - x^7/5040', 1, 1 - 1 / 6 + 1 / 120 - 1 / 5040],
  ])('%s 在 x=%s 处求值正确', (expression, x, expected) => {
    expect(compileExpression(expression)(x)).toBeCloseTo(expected, 8);
  });

  it('支持实奇次根有理分数幂与指数函数', () => {
    const cbrtPow = compileExpression('x^(1/3)');
    expect(cbrtPow(-8)).toBeCloseTo(-2);
    expect(cbrtPow(0)).toBe(0);
    expect(cbrtPow(8)).toBeCloseTo(2);

    const twoThirds = compileExpression('x^(2/3)');
    expect(twoThirds(-8)).toBeCloseTo(4);
    expect(twoThirds(0)).toBe(0);
    expect(twoThirds(8)).toBeCloseTo(4);

    const negOneThird = compileExpression('x^(-1/3)');
    expect(negOneThird(-8)).toBeCloseTo(-0.5);
    expect(negOneThird(0)).toBeNull();
    expect(negOneThird(8)).toBeCloseTo(0.5);

    const negParenThird = compileExpression('x^(-(1/3))');
    expect(negParenThird(-27)).toBeCloseTo(-1 / 3);

    const reducedOdd = compileExpression('x^(2/6)');
    expect(reducedOdd(-8)).toBeCloseTo(-2);

    const evenRational = compileExpression('x^(3/4)');
    expect(evenRational(-1)).toBeNull();
    expect(evenRational(16)).toBeCloseTo(8);

    expect(compileExpression('2^x')(3)).toBeCloseTo(8);
    expect(compileExpression('2^(-x)')(2)).toBeCloseTo(0.25);
    expect(compileExpression('e^(-x^2)')(0)).toBeCloseTo(1);
    expect(compileExpression('e^(-x^2)')(1)).toBeCloseTo(Math.exp(-1));
  });

  it.each([
    'x=2',
    '[1,2]',
    'x.constructor',
    'import("x")',
    'random()',
    'unknown(x)',
    'x!',
    '2^100',
    'x^x',
    '(-2)^x',
    '0^x',
    '1001^x',
    'x^(21/3)',
    'x^(1/21)',
    'x^(1/0)',
    'f(x)=x',
    'sin(x,2)',
    'sin + 1',
    '1e100',
    'x > 1',
    'x;2',
  ])('拒绝 %s', (expression) => {
    expect(() => compileExpression(expression)).toThrow();
  });

  it('拒绝空输入和过长输入', () => {
    expect(() => compileExpression('')).toThrow();
    expect(() => compileExpression('x'.repeat(161))).toThrow();
  });

  it('非实数、非有限值以及超出显示上限的值留空', () => {
    expect(compileExpression('sqrt(x)')(-1)).toBeNull();
    expect(compileExpression('ln(x)')(0)).toBeNull();
    expect(compileExpression('ln(x)')(-2)).toBeNull();
    expect(compileExpression('lg(x)')(0)).toBeNull();
    expect(compileExpression('asin(x)')(1.5)).toBeNull();
    expect(compileExpression('acos(x)')(-1.2)).toBeNull();
    expect(compileExpression('1/x')(0)).toBeNull();
    expect(compileExpression('exp(x)')(1000)).toBeNull();
  });
});

describe('函数采样', () => {
  it('平方函数包含端点', () => {
    const { points, gaps } = sampleFunction(
      { expression: 'x^2', xMin: -2, xMax: 2 },
      5,
    );
    expect(points).toEqual([
      [-2, 4],
      [-1, 1],
      [0, 0],
      [1, 1],
      [2, 4],
    ]);
    expect(gaps).toBe(0);
  });

  it('1/x 在 0 留空', () => {
    const { points, gaps } = sampleFunction(
      { expression: '1/x', xMin: -1, xMax: 1 },
      5,
    );
    expect(points).toContainEqual([0, null]);
    expect(gaps).toBeGreaterThan(0);
  });

  it('非对称区间补采关键整数奇点，使可去间断点精确留空', () => {
    const sinc = sampleFunction(
      { expression: 'sin(x)/x', xMin: -2, xMax: 3 },
      40,
    );
    expect(sinc.points).toContainEqual([0, null]);
    expect(sinc.gaps).toBeGreaterThan(0);

    const removable = sampleFunction(
      { expression: '(x^2 - 1)/(x - 1)', xMin: -2, xMax: 3 },
      40,
    );
    expect(removable.points).toContainEqual([1, null]);
    expect(removable.gaps).toBeGreaterThan(0);
  });

  it('极点位于采样点之间时进行中点检查', () => {
    const { points } = sampleFunction(
      { expression: '1/(x-0.25)', xMin: 0, xMax: 1 },
      3,
    );
    expect(points).toContainEqual([0.25, null]);
  });

  it('识别阶跃间断且不对平滑陡峭单调函数误判缺口', () => {
    const stepSign = sampleFunction({
      expression: 'sign(x)',
      xMin: -2,
      xMax: 2,
    });
    expect(stepSign.gaps).toBeGreaterThan(0);

    const stepFloor = sampleFunction({
      expression: 'floor(x)',
      xMin: -2,
      xMax: 2,
    });
    expect(stepFloor.gaps).toBeGreaterThanOrEqual(3);

    const smoothExp = sampleFunction({
      expression: 'exp(x)',
      xMin: -5,
      xMax: 8,
    });
    expect(smoothExp.gaps).toBe(0);

    const smoothPoly = sampleFunction({
      expression: 'x^9',
      xMin: -2,
      xMax: 2,
    });
    expect(smoothPoly.gaps).toBe(0);
  });

  it('定义域外留空', () => {
    const { points } = sampleFunction(
      { expression: 'sqrt(x)', xMin: -1, xMax: 1 },
      3,
    );
    expect(points[0]).toEqual([-1, null]);
  });

  it('支持对比函数 compareExpression 同步采样', () => {
    const result = sampleFunction(
      {
        expression: 'sin(x)',
        compareExpression: 'x - x^3/6',
        xMin: -2,
        xMax: 2,
      },
      5,
    );
    expect(result.comparePoints).toBeDefined();
    expect(result.comparePoints).toHaveLength(5);
    expect(result.comparePoints?.[2]).toEqual([0, 0]);
  });

  it('支持差商与割线 secant 计算（含尖点左右差商对比）', () => {
    const smooth = sampleFunction({
      expression: 'x^2',
      xMin: -3,
      xMax: 3,
      secant: { x0: 1, h: 0.5 },
    });
    expect(smooth.secantLine).toBeDefined();
    expect(smooth.secantLine?.y0).toBeCloseTo(1);
    expect(smooth.secantLine?.x1).toBeCloseTo(1.5);
    expect(smooth.secantLine?.y1).toBeCloseTo(2.25);
    expect(smooth.secantLine?.slope).toBeCloseTo(2.5);
    expect(smooth.secantLine?.rightSlope).toBeCloseTo(2.5);
    expect(smooth.secantLine?.leftSlope).toBeCloseTo(1.5);
    expect(smooth.secantLine?.points).toEqual([
      [-3, -9],
      [3, 6],
    ]);

    const corner = sampleFunction({
      expression: 'abs(x)',
      xMin: -2,
      xMax: 2,
      secant: { x0: 0, h: -0.5 },
    });
    expect(corner.secantLine?.slope).toBeCloseTo(-1);
    expect(corner.secantLine?.leftSlope).toBeCloseTo(-1);
    expect(corner.secantLine?.rightSlope).toBeCloseTo(1);

    const singular = sampleFunction({
      expression: '1/x',
      xMin: -2,
      xMax: 2,
      secant: { x0: 0, h: 0.5 },
    });
    expect(singular.secantLine?.y0).toBeNull();
    expect(singular.secantLine?.slope).toBeNull();
    expect(singular.secantLine?.points).toEqual([]);
  });

  it('拒绝非法区间和过量采样', () => {
    expect(() =>
      sampleFunction({ expression: 'x', xMin: 1, xMax: -1 }),
    ).toThrow();
    expect(() =>
      sampleFunction({ expression: 'x', xMin: 0, xMax: 1 }, 5000),
    ).toThrow();
  });
});
