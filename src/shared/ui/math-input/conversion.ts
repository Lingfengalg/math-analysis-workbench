export type MathInputMode = 'function' | 'sequence' | 'numeric';

const supportedCommands = new Set([
  'frac',
  'sqrt',
  'sin',
  'cos',
  'tan',
  'pi',
  'cdot',
  'times',
  'left',
  'right',
]);

/** 只接受明确支持的 LaTeX 子集，避免把未知结构降级成含义不同的普通文本。 */
export function convertMathInput(
  latex: string,
  ascii: string,
  mode: MathInputMode,
): string {
  if (!latex || latex.length > 600 || ascii.length > 600)
    throw new Error('请输入不超过长度限制的完整公式。');
  const text = latex.replace(/\\([a-zA-Z]+|.)/g, (_, command: string) => {
    if (!supportedCommands.has(command))
      throw new Error(`暂不支持此数学符号或命令：\\${command}。`);
    return '';
  });
  if (!/^[\d.xn+\-*/^(){}\s]*$/.test(text))
    throw new Error('公式含有暂不支持的符号或不完整的占位符。');
  const candidate = ascii.replace(/\s+/g, '');
  if (!candidate || !/^[a-z0-9.+\-*/^()]+$/i.test(candidate))
    throw new Error('公式无法转换为支持的表达式。');
  if (mode === 'numeric') {
    if (
      /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(candidate) &&
      candidate.length <= 40
    )
      return candidate;
    const fraction = candidate.match(/^([+-]?)\(([+-]?\d+)\)\/\(([+-]?\d+)\)$/);
    if (!fraction) throw new Error('此题只接受整数、小数或整数分数。');
    const [, outside, numerator, denominator] = fraction;
    const negative =
      ((outside === '-') !== numerator.startsWith('-')) !==
      denominator.startsWith('-');
    const digits = numerator.replace(/^[+-]/, '');
    const result = `${negative ? '-' : ''}${digits}/${denominator.replace(/^[+-]/, '')}`;
    if (result.length > 40 || Number(denominator) === 0)
      throw new Error('答案过长或分母为零。');
    return result;
  }
  if (candidate.length > 160) throw new Error('表达式最多 160 个字符。');
  return candidate;
}
