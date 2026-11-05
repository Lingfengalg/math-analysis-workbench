import { describe, expect, it } from 'vitest';
import { calculateTangent } from './tangent';

describe('切线计算（符号求导 + 白名单复校验）', () => {
  it('x^2 在 1 处斜率 2、切点值 1', () => {
    const { slope, value } = calculateTangent('x^2', 1);
    expect(slope).toBeCloseTo(2, 9);
    expect(value).toBeCloseTo(1, 9);
  });

  it('x^3 在 1 处斜率 3', () => {
    expect(calculateTangent('x^3', 1).slope).toBeCloseTo(3, 9);
  });

  it('sqrt(x) 在 4 处斜率 0.25', () => {
    const { slope, value } = calculateTangent('sqrt(x)', 4);
    expect(slope).toBeCloseTo(0.25, 9);
    expect(value).toBeCloseTo(2, 9);
  });

  it('exp(x) 在 0 处斜率 1', () => {
    const { slope, value } = calculateTangent('exp(x)', 0);
    expect(slope).toBeCloseTo(1, 9);
    expect(value).toBeCloseTo(1, 9);
  });

  it('常数表达式导数为 0，切线水平', () => {
    const { slope, value } = calculateTangent('5', 3);
    expect(slope).toBeCloseTo(0, 9);
    expect(value).toBeCloseTo(5, 9);
  });

  it('abs(x) 在 0 处不可导，给出明确提示', () => {
    expect(() => calculateTangent('abs(x)', 0)).toThrow('不可导');
  });

  it('导数超出白名单时明确提示：tan 的导函数含 sec', () => {
    expect(() => calculateTangent('tan(x)', 0)).toThrow(
      '切线无法显示：仅支持白名单内的单参数函数（不支持 sec）。',
    );
  });

  it('函数在切点处没有可显示的有限值时给出明确提示', () => {
    expect(() => calculateTangent('1/x', 0)).toThrow('没有可显示的有限值');
  });

  it('切点横坐标不是有限实数时报错', () => {
    expect(() => calculateTangent('x^2', Number.NaN)).toThrow(
      '切点横坐标须为有限实数',
    );
    expect(() => calculateTangent('x^2', Number.POSITIVE_INFINITY)).toThrow(
      '切点横坐标须为有限实数',
    );
  });
});
