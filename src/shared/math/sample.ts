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

type Evaluator = (x: number) => number | null;

// Interior probes between two adjacent finite samples.
const PROBE_COUNT = 4;
// Bisection refinement cap; enough for sub-pixel chart precision.
const BISECT_STEPS = 40;
// A sign flip counts as a pole only when the values around it clearly
// outgrow the neighbouring samples; smaller flips fall through to the
// deviation rule below.
const POLE_BLOWUP = 2;
// Conservative deviation tolerance kept from the previous midpoint
// heuristic: probes that leave the linear interpolation between the
// endpoints beyond this share of the local scale cut the line.
const DEVIATION_TOLERANCE = 0.75;

// Halve [left, right] around a sign change, keeping f(a) on the
// `leftPositive` side. Stops early when a probe lands exactly on the
// discontinuity (non-finite value).
function bisectSignChange(
  evaluate: Evaluator,
  left: number,
  leftPositive: boolean,
  right: number,
): number {
  let a = left;
  const aPositive = leftPositive;
  let b = right;
  for (let i = 0; i < BISECT_STEPS; i += 1) {
    const mid = (a + b) / 2;
    const value = evaluate(mid);
    if (value === null) return mid;
    if (value > 0 === aPositive) a = mid;
    else b = mid;
  }
  return (a + b) / 2;
}

// Halve [finiteX, nullX] around a finite/non-finite transition.
function bisectNullBoundary(
  evaluate: Evaluator,
  finiteX: number,
  nullX: number,
): number {
  let a = finiteX;
  let b = nullX;
  for (let i = 0; i < BISECT_STEPS; i += 1) {
    const mid = (a + b) / 2;
    if (evaluate(mid) === null) b = mid;
    else a = mid;
  }
  return (a + b) / 2;
}

/**
 * Inspect the open interval between two finite samples for a discontinuity.
 * Returns the x where the line should be cut, or null when the segment
 * looks continuous. Sampling heuristics, not symbolic analysis: domain
 * holes are located by bisection, poles by sign flip with magnitude
 * blowup, and remaining jumps by conservative deviation from linear
 * interpolation.
 */
function findGap(
  evaluate: Evaluator,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number | null {
  const probeX: number[] = [];
  const probeY: Array<number | null> = [];
  for (let k = 1; k <= PROBE_COUNT; k += 1) {
    const x = x0 + ((x1 - x0) * k) / (PROBE_COUNT + 1);
    probeX.push(x);
    probeY.push(evaluate(x));
  }
  const xs = [x0, ...probeX, x1];
  const ys: Array<number | null> = [y0, ...probeY, y1];

  // 1. Domain hole: a non-finite probe between finite endpoints.
  for (let i = 0; i + 1 < ys.length; i += 1) {
    if ((ys[i] === null) !== (ys[i + 1] === null)) {
      const finiteSide = ys[i] === null ? i + 1 : i;
      const nullSide = finiteSide === i ? i + 1 : i;
      return bisectNullBoundary(evaluate, xs[finiteSide], xs[nullSide]);
    }
  }

  const scale = Math.max(1, Math.abs(y0), Math.abs(y1));

  // 2. Pole: opposite-sign neighbours whose magnitudes clearly outgrow
  // the surrounding samples.
  for (let i = 0; i + 1 < ys.length; i += 1) {
    const a = ys[i];
    const b = ys[i + 1];
    if (
      a !== null &&
      b !== null &&
      a !== 0 &&
      b !== 0 &&
      a > 0 !== b > 0 &&
      Math.max(Math.abs(a), Math.abs(b)) > POLE_BLOWUP * scale
    ) {
      return bisectSignChange(evaluate, xs[i], a > 0, xs[i + 1]);
    }
  }

  // 3. Conservative deviation check: cut the line at the probe that
  // deviates most from the linear interpolation between the endpoints.
  let gapX: number | null = null;
  let worst = 0;
  for (let k = 0; k < probeY.length; k += 1) {
    const y = probeY[k];
    if (y === null) continue;
    const interpolated = y0 + ((y1 - y0) * (k + 1)) / (PROBE_COUNT + 1);
    const deviation = Math.abs(y - interpolated);
    if (deviation > DEVIATION_TOLERANCE * scale && deviation > worst) {
      worst = deviation;
      gapX = probeX[k];
    }
  }
  return gapX;
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
      const gapX = findGap(evaluate, previous[0], previous[1], x, y);
      if (gapX !== null) {
        points.push([gapX, null]);
        gaps += 1;
      }
    }
    if (y === null) gaps += 1;
    points.push([x, y]);
    previous = [x, y];
  }
  return { points, gaps };
}
