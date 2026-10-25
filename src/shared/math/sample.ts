import { parse, type MathNode } from 'mathjs';
import {
  plotRequestSchema,
  type PlotRequest,
  type PlotResult,
} from '@/shared/contracts';

const FUNCTIONS = new Set([
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'abs',
  'sqrt',
  'log',
  'exp',
]);
const SYMBOLS = new Set(['x', 'pi', 'e', ...FUNCTIONS]);
const OPERATORS = new Set(['+', '-', '*', '/', '^']);
const TYPES = new Set([
  'OperatorNode',
  'ParenthesisNode',
  'ConstantNode',
  'SymbolNode',
  'FunctionNode',
]);

export function compileExpression(
  expression: string,
): (x: number) => number | null {
  if (!expression.trim() || expression.length > 160)
    throw new Error('表达式长度应为 1–160 个字符。');
  let root: MathNode;
  try {
    root = parse(expression);
  } catch {
    throw new Error('表达式无法解析，请检查括号和运算符。');
  }
  let count = 0;
  root.traverse((node) => {
    count += 1;
    if (count > 80 || !TYPES.has(node.type))
      throw new Error('仅支持简单的一元实函数，不支持赋值、数组或属性访问。');
    if (node.type === 'SymbolNode' && !SYMBOLS.has(String(node)))
      throw new Error(`不支持的变量或函数：${String(node)}。`);
    if (node.type === 'FunctionNode') {
      const fn = node as unknown as { fn: MathNode; args: MathNode[] };
      if (
        fn.fn.type !== 'SymbolNode' ||
        !FUNCTIONS.has(String(fn.fn)) ||
        fn.args.length !== 1
      )
        throw new Error('仅支持白名单内的单参数函数。');
    }
    if (node.type === 'ConstantNode') {
      const value = (node as unknown as { value: unknown }).value;
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        Math.abs(value) > 1e6
      )
        throw new Error('常数必须是绝对值不超过 10⁶ 的有限实数。');
    }
    if (node.type === 'OperatorNode') {
      const operator = node as unknown as { op: string; args: MathNode[] };
      if (!OPERATORS.has(operator.op))
        throw new Error('仅支持 +、-、*、/、^ 运算。');
      if (operator.op === '^') {
        const exponent = operator.args[1].toString();
        if (
          !/^-?\d+(\.\d+)?$/.test(exponent) ||
          Math.abs(Number(exponent)) > 20
        )
          throw new Error('幂指数须为绝对值不超过 20 的数字常量。');
      }
    }
  });
  const compiled = root.compile();
  return (x) => {
    try {
      const result: unknown = compiled.evaluate({ x });
      return typeof result === 'number' &&
        Number.isFinite(result) &&
        Math.abs(result) <= 1e6
        ? result
        : null;
    } catch {
      return null;
    }
  };
}

export function sampleFunction(
  request: PlotRequest,
  samples = 801,
): PlotResult {
  const valid = plotRequestSchema.safeParse(request);
  if (!valid.success) throw new Error(valid.error.issues[0].message);
  if (!Number.isInteger(samples) || samples < 3 || samples > 1201)
    throw new Error('采样数量须为 3–1201 之间的整数。');
  const { expression, xMin, xMax } = valid.data;
  const evaluate = compileExpression(expression);
  const points: PlotResult['points'] = [];
  let gaps = 0;
  let previous: [number, number | null] | undefined;
  for (let i = 0; i < samples; i += 1) {
    const x = xMin + ((xMax - xMin) * i) / (samples - 1);
    const y = evaluate(x);
    if (previous && previous[1] !== null && y !== null) {
      const middleX = (previous[0] + x) / 2;
      const middleY = evaluate(middleX);
      // Conservative midpoint heuristic, not a symbolic discontinuity detector.
      const scale = Math.max(1, Math.abs(y), Math.abs(previous[1]));
      if (
        middleY === null ||
        Math.abs(middleY - (y + previous[1]) / 2) > 0.75 * scale
      ) {
        points.push([middleX, null]);
        gaps += 1;
      }
    }
    if (y === null) gaps += 1;
    points.push([x, y]);
    previous = [x, y];
  }
  return { points, gaps };
}
