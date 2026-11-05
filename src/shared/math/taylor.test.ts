import { describe, expect, it } from 'vitest';
import type { PlotRequest } from '@/shared/contracts';
import { calculateTaylorPolynomial, TAYLOR_MAX_ORDER } from './taylor';

const request: PlotRequest = { expression: 'sin(x)', xMin: -5, xMax: 5 };

describe('泰勒多项式系数（反复符号求导 + 阶乘）', () => {
  it('sin 在 0 处的 T₃ 系数为 [0, 1, 0, −1/6]，即 x − x³/6', () => {
    const { coefficients } = calculateTaylorPolynomial(request, 0, 3);
    expect(coefficients).toHaveLength(4);
    expect(coefficients[0]).toBeCloseTo(0, 9);
    expect(coefficients[1]).toBeCloseTo(1, 9);
    expect(coefficients[2]).toBeCloseTo(0, 9);
    expect(coefficients[3]).toBeCloseTo(-1 / 6, 9);
  });

  it('exp 在 0 处的 T₂ 系数为 [1, 1, 1/2]', () => {
    const { coefficients } = calculateTaylorPolynomial(
      { ...request, expression: 'exp(x)' },
      0,
      2,
    );
    expect(coefficients[0]).toBeCloseTo(1, 9);
    expect(coefficients[1]).toBeCloseTo(1, 9);
    expect(coefficients[2]).toBeCloseTo(0.5, 9);
  });

  it('阶数越高在展开中心附近越接近原函数（数值断言，不声称收敛）', () => {
    const t3 = calculateTaylorPolynomial(request, 0, 3);
    const t5 = calculateTaylorPolynomial(request, 0, 5);
    const value = (coefficients: number[], x: number) =>
      coefficients.reduce((sum, coefficient, power) => {
        if (power === 0) return coefficient;
        return sum + coefficient * x ** power;
      }, 0);
    const probe = 0.1;
    const t3Error = Math.abs(value(t3.coefficients, probe) - Math.sin(probe));
    const t5Error = Math.abs(value(t5.coefficients, probe) - Math.sin(probe));
    expect(t5Error).toBeLessThan(t3Error);
  });

  it('图像点按观察区间采样，与系数直接求和一致', () => {
    const { coefficients, points } = calculateTaylorPolynomial(
      { ...request, expression: 'x^2' },
      1,
      2,
    );
    // 区间 [-5, 5] 的中点 x = 0；T₂ = 1 + 2(x − 1) + (x − 1)² 在该处等于 0
    const centerPoint = points[Math.floor((points.length - 1) / 2)];
    expect(centerPoint[0]).toBeCloseTo(0, 6);
    let y = 0;
    let power = 1;
    for (const coefficient of coefficients) {
      y += coefficient * power;
      power *= 0 - 1;
    }
    expect(centerPoint[1]).toBeCloseTo(y, 6);
  });

  it('任一步导函数超出白名单时提示并停止：tan 的一阶导数含 sec', () => {
    expect(() =>
      calculateTaylorPolynomial({ ...request, expression: 'tan(x)' }, 0, 1),
    ).toThrow('第 1 阶导数超出支持范围');
  });

  it('某阶导数在展开中心处不可求值时提示并停止', () => {
    expect(() =>
      calculateTaylorPolynomial({ ...request, expression: '1/x' }, 0, 1),
    ).toThrow('第 0 阶导数在展开中心处没有可显示的有限值');
  });

  it('非法阶数与展开中心报错', () => {
    expect(() => calculateTaylorPolynomial(request, 0, 0)).toThrow(
      '泰勒多项式阶数须为 1–8 之间的整数',
    );
    expect(() =>
      calculateTaylorPolynomial(request, 0, TAYLOR_MAX_ORDER + 1),
    ).toThrow('泰勒多项式阶数须为 1–8 之间的整数');
    expect(() => calculateTaylorPolynomial(request, Number.NaN, 3)).toThrow(
      '展开中心须为有限实数',
    );
  });
});
