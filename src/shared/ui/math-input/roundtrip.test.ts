import { describe, expect, it } from 'vitest';
import { convertAsciiMathToLatex, convertLatexToAsciiMath } from 'mathlive/ssr';
import { compileExpression } from '@/shared/math/sample';
import { verifyEditorRoundtrip } from '@/shared/math/editorRoundtrip';
import { convertMathInput, toEditorAscii } from './conversion';

function convert(original: string, mode: 'function' | 'sequence') {
  const latex = convertAsciiMathToLatex(toEditorAscii(original));
  const converted = convertMathInput(
    latex,
    convertLatexToAsciiMath(latex),
    mode,
  );
  verifyEditorRoundtrip({
    original,
    converted,
    variable: mode === 'function' ? 'x' : 'n',
  });
  return converted;
}

describe('数学输入的受限双向转换', () => {
  it.each([
    ['(x+1)/(x-2)', [-1, 0, 1]],
    ['-x^2+2*x', [-1, 0, 1]],
    ['(-x)^2', [-1, 0, 1]],
    ['sin(x)+cos(x)', [-1, 0, 1]],
    ['asin(x)+acos(x)+atan(x)', [-0.5, 0, 0.5]],
    ['log(x)', [0.5, 1, 2]],
    ['sqrt(x)', [0, 1, 4]],
    ['pi*x/2', [-1, 0, 1]],
  ])('实际 MathLive 转换保留 %s 的结构与数值', (original, points) => {
    const converted = convert(original, 'function');
    const a = compileExpression(original);
    const b = compileExpression(converted);
    for (const point of points)
      expect(b(point)).toBeCloseTo(a(point) as number, 12);
  });
  it('数列变量 n 保持一致', () => {
    const original = '(n+1)/n';
    const converted = convert(original, 'sequence');
    for (const n of [1, 2, 10])
      expect(compileExpression(converted, 'n')(n)).toBeCloseTo(
        compileExpression(original, 'n')(n) as number,
      );
  });
  it('不将不同优先级当作等价，也不允许隐式乘法、越权语法或错变量', () => {
    expect(() =>
      verifyEditorRoundtrip({
        original: '-x^2',
        converted: '(-x)^2',
        variable: 'x',
      }),
    ).toThrow('结构');
    expect(() =>
      verifyEditorRoundtrip({
        original: '2x',
        converted: '2*x',
        variable: 'x',
      }),
    ).toThrow('隐式乘法');
    expect(() =>
      verifyEditorRoundtrip({ original: 'x=2', converted: 'x', variable: 'x' }),
    ).toThrow();
    expect(() =>
      verifyEditorRoundtrip({
        original: 'x+1',
        converted: 'x+1',
        variable: 'n',
      }),
    ).toThrow();
  });
  it('拒绝模糊底数、绝对值竖线、占位符和科学计数法', () => {
    for (const latex of [
      '\\log(x)',
      '\\left|x\\right|',
      '\\frac{\\placeholder{}}{2}',
    ])
      expect(() =>
        convertMathInput(latex, convertLatexToAsciiMath(latex), 'function'),
      ).toThrow();
    expect(() => toEditorAscii('1e-2*x')).toThrow('科学计数法');
    expect(() => convert('abs(x)', 'function')).toThrow();
  });
});
