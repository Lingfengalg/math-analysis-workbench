import { describe, expect, it } from 'vitest';
import { convertLatexToAsciiMath } from 'mathlive/ssr';
import { compileExpression } from '@/shared/math/sample';
import { convertMathInput } from './conversion';

describe('数学编辑器转换边界', () => {
  it('支持整数、小数和原样等价的整数分数', () => {
    expect(convertMathInput('0.5', '0.5', 'numeric')).toBe('0.5');
    expect(convertMathInput('\\frac{1}{2}', '(1)/(2)', 'numeric')).toBe('1/2');
    expect(convertMathInput('-\\frac{-1}{2}', '-(-1)/(2)', 'numeric')).toBe(
      '1/2',
    );
    expect(convertMathInput('\\frac{1}{-2}', '(1)/(-2)', 'numeric')).toBe(
      '-1/2',
    );
  });
  it('分母为零、变量和不完整公式不能写入答案', () => {
    expect(() =>
      convertMathInput('\\frac{1}{0}', '(1)/(0)', 'numeric'),
    ).toThrow();
    expect(() => convertMathInput('x', 'x', 'numeric')).toThrow();
    expect(() =>
      convertMathInput('\\frac{\\placeholder{}}{2}', '()/2', 'numeric'),
    ).toThrow();
  });
  it('支持常见函数与算式的 MathLive 输出', () => {
    expect(
      convertMathInput('\\frac{\\sin(x)}{2}', '(sin (x))/(2)', 'function'),
    ).toBe('(sin(x))/(2)');
    expect(convertMathInput('n^2', 'n^2', 'sequence')).toBe('n^2');
  });
  it('实际 MathLive 输出经原绘图解析器计算后保留基本算式的含义', () => {
    const samples = [
      { latex: '\\frac{x}{2}', at: 4, result: 2 },
      { latex: '\\sqrt{x}', at: 4, result: 2 },
      { latex: '\\sin\\left(x\\right)', at: 1, result: Math.sin(1) },
      { latex: 'x^{2}', at: 4, result: 16 },
    ];
    for (const sample of samples) {
      const ascii = convertLatexToAsciiMath(sample.latex);
      const expression = convertMathInput(sample.latex, ascii, 'function');
      expect(compileExpression(expression)(sample.at)).toBeCloseTo(
        sample.result,
      );
    }
  });
  it('拒绝未知命令、下标、积分与有根指数的根号', () => {
    for (const input of [
      'x_1',
      '\\int_0^1 x',
      '\\sqrt[3]{x}',
      '\\log(x)',
      '\\text{x}',
    ]) {
      expect(() => convertMathInput(input, 'x', 'function')).toThrow();
    }
  });
});
