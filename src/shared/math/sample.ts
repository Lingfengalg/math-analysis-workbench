import { parse, type MathNode } from 'mathjs/number';
import {
  plotRequestSchema,
  type PlotPoint,
  type PlotRequest,
  type PlotResult,
  type SecantLineResult,
  type SecantRequest,
} from '@/shared/contracts';

const UNARY_FUNCTIONS = new Map<string, (u: number) => number | null>([
  ['sin', (u) => Math.sin(u)],
  ['cos', (u) => Math.cos(u)],
  ['tan', (u) => Math.tan(u)],
  ['asin', (u) => (Math.abs(u) <= 1 ? Math.asin(u) : null)],
  ['acos', (u) => (Math.abs(u) <= 1 ? Math.acos(u) : null)],
  ['atan', (u) => Math.atan(u)],
  ['sinh', (u) => Math.sinh(u)],
  ['cosh', (u) => Math.cosh(u)],
  ['tanh', (u) => Math.tanh(u)],
  ['abs', (u) => Math.abs(u)],
  ['sqrt', (u) => (u >= 0 ? Math.sqrt(u) : null)],
  ['cbrt', (u) => Math.cbrt(u)],
  ['log', (u) => (u > 0 ? Math.log(u) : null)],
  ['ln', (u) => (u > 0 ? Math.log(u) : null)],
  ['lg', (u) => (u > 0 ? Math.log10(u) : null)],
  ['exp', (u) => Math.exp(u)],
  ['sign', (u) => Math.sign(u)],
  ['floor', (u) => Math.floor(u)],
  ['ceil', (u) => Math.ceil(u)],
]);

const OPERATORS = new Set(['+', '-', '*', '/', '^']);
const TYPES = new Set([
  'OperatorNode',
  'ParenthesisNode',
  'ConstantNode',
  'SymbolNode',
  'FunctionNode',
]);
const DISPLAY_LIMIT = 1e6;
const MAX_AST_NODES = 100;
const MAX_POWER_CONSTANT = 20;
const MAX_EXP_BASE = 1000;
const POINT_EPSILON = 1e-11;

type Evaluator = (x: number) => number | null;

function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}

function toDisplayValue(value: number | null): number | null {
  if (
    value === null ||
    !Number.isFinite(value) ||
    Math.abs(value) > DISPLAY_LIMIT
  ) {
    return null;
  }
  return normalizeZero(value);
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const remainder = x % y;
    x = y;
    y = remainder;
  }
  return x || 1;
}

function containsVariableX(node: MathNode): boolean {
  let found = false;
  node.traverse((child) => {
    if (child.type === 'SymbolNode') {
      const symbolName = (child as unknown as { name: string }).name;
      if (symbolName === 'x') {
        found = true;
      }
    }
  });
  return found;
}

function extractSignedLiteral(node: MathNode): number | null {
  let current = node;
  let sign = 1;
  while (true) {
    if (current.type === 'ParenthesisNode') {
      current = (current as unknown as { content: MathNode }).content;
      continue;
    }
    if (current.type === 'OperatorNode') {
      const opNode = current as unknown as { op: string; args: MathNode[] };
      if (
        opNode.args.length === 1 &&
        (opNode.op === '+' || opNode.op === '-')
      ) {
        if (opNode.op === '-') sign = -sign;
        current = opNode.args[0];
        continue;
      }
    }
    break;
  }
  if (current.type !== 'ConstantNode') {
    return null;
  }
  const value = (current as unknown as { value: unknown }).value;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return normalizeZero(sign * value);
}

function extractRationalFraction(
  node: MathNode,
): { p: number; q: number } | null {
  let current = node;
  let outerSign = 1;
  while (true) {
    if (current.type === 'ParenthesisNode') {
      current = (current as unknown as { content: MathNode }).content;
      continue;
    }
    if (current.type === 'OperatorNode') {
      const opNode = current as unknown as { op: string; args: MathNode[] };
      if (
        opNode.args.length === 1 &&
        (opNode.op === '+' || opNode.op === '-')
      ) {
        if (opNode.op === '-') outerSign = -outerSign;
        current = opNode.args[0];
        continue;
      }
    }
    break;
  }
  if (current.type !== 'OperatorNode') {
    return null;
  }
  const opNode = current as unknown as { op: string; args: MathNode[] };
  if (opNode.op !== '/' || opNode.args.length !== 2) {
    return null;
  }
  const rawNum = extractSignedLiteral(opNode.args[0]);
  const rawDen = extractSignedLiteral(opNode.args[1]);
  if (
    rawNum === null ||
    rawDen === null ||
    !Number.isInteger(rawNum) ||
    !Number.isInteger(rawDen)
  ) {
    return null;
  }
  if (rawDen === 0) {
    throw new Error('幂指数分母不能为 0。');
  }
  if (
    Math.abs(rawNum) > MAX_POWER_CONSTANT ||
    Math.abs(rawDen) > MAX_POWER_CONSTANT
  ) {
    throw new Error('有理分数幂指数的分子与分母绝对值均不得超过 20。');
  }
  const signFactor = outerSign * (rawDen < 0 ? -1 : 1);
  const signedNum = signFactor * rawNum;
  const positiveDen = Math.abs(rawDen);
  const divisor = gcd(Math.abs(signedNum), positiveDen);
  return {
    p: normalizeZero(signedNum / divisor),
    q: positiveDen / divisor,
  };
}

function evaluateRationalPower(
  base: number,
  p: number,
  q: number,
): number | null {
  if (p === 0) {
    return 1;
  }
  if (q === 1) {
    if (p < 0 && base === 0) return null;
    const value = Math.pow(base, p);
    return Number.isFinite(value) ? value : null;
  }
  if (base === 0) {
    return p > 0 ? 0 : null;
  }
  if (q % 2 === 1) {
    const oddRoot =
      q === 3
        ? Math.cbrt(base)
        : (base < 0 ? -1 : 1) * Math.pow(Math.abs(base), 1 / q);
    const value = Math.pow(oddRoot, p);
    return Number.isFinite(value) ? value : null;
  }
  if (base < 0) {
    return null;
  }
  const value = Math.pow(base, p / q);
  return Number.isFinite(value) ? value : null;
}

function evaluateConstantPower(base: number, exponent: number): number | null {
  if (exponent === 0) {
    return 1;
  }
  if (Number.isInteger(exponent)) {
    if (exponent < 0 && base === 0) return null;
    const value = Math.pow(base, exponent);
    return Number.isFinite(value) ? value : null;
  }
  if (base < 0) {
    return null;
  }
  if (base === 0) {
    return exponent > 0 ? 0 : null;
  }
  const value = Math.pow(base, exponent);
  return Number.isFinite(value) ? value : null;
}

function compilePowerNode(baseNode: MathNode, expNode: MathNode): Evaluator {
  const evalBase = compileNode(baseNode);
  const evalExp = compileNode(expNode);
  const baseHasX = containsVariableX(baseNode);
  const expHasX = containsVariableX(expNode);

  if (expHasX) {
    if (baseHasX) {
      throw new Error(
        '不支持底数与指数同时含变量 x 的幂运算，可改写为 exp(x * ln(x))。',
      );
    }
    const baseConst = evalBase(0);
    if (
      baseConst === null ||
      !Number.isFinite(baseConst) ||
      baseConst <= 0 ||
      baseConst > MAX_EXP_BASE
    ) {
      throw new Error('指数含变量 x 时，底数须为 (0, 1000] 内的有限正常数。');
    }
    return (x) => {
      const expVal = evalExp(x);
      if (expVal === null) return null;
      const result = Math.pow(baseConst, expVal);
      return Number.isFinite(result) ? result : null;
    };
  }

  const rational = extractRationalFraction(expNode);
  if (rational !== null) {
    const { p, q } = rational;
    return (x) => {
      const baseVal = evalBase(x);
      if (baseVal === null) return null;
      return evaluateRationalPower(baseVal, p, q);
    };
  }

  const expConst = evalExp(0);
  if (
    expConst === null ||
    !Number.isFinite(expConst) ||
    Math.abs(expConst) > MAX_POWER_CONSTANT
  ) {
    throw new Error('幂指数须为绝对值不超过 20 的数字常量。');
  }
  return (x) => {
    const baseVal = evalBase(x);
    if (baseVal === null) return null;
    return evaluateConstantPower(baseVal, expConst);
  };
}

function compileNode(node: MathNode): Evaluator {
  if (node.type === 'ParenthesisNode') {
    const inner = (node as unknown as { content: MathNode }).content;
    return compileNode(inner);
  }

  if (node.type === 'ConstantNode') {
    const value = (node as unknown as { value: unknown }).value;
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      Math.abs(value) > DISPLAY_LIMIT
    ) {
      throw new Error('常数必须是绝对值不超过 10⁶ 的有限实数。');
    }
    const constant = normalizeZero(value);
    return () => constant;
  }

  if (node.type === 'SymbolNode') {
    const name = (node as unknown as { name: string }).name;
    if (name === 'x') return (x) => x;
    if (name === 'pi') return () => Math.PI;
    if (name === 'e') return () => Math.E;
    throw new Error(`不支持的变量或函数：${name}。`);
  }

  if (node.type === 'FunctionNode') {
    const fn = node as unknown as { fn: MathNode; args: MathNode[] };
    if (fn.fn.type !== 'SymbolNode' || fn.args.length !== 1) {
      throw new Error('仅支持白名单内的单参数函数。');
    }
    const fnName = (fn.fn as unknown as { name: string }).name;
    const unaryFn = UNARY_FUNCTIONS.get(fnName);
    if (!unaryFn) {
      throw new Error(`不支持的函数：${fnName}。`);
    }
    const evalArg = compileNode(fn.args[0]);
    return (x) => {
      const arg = evalArg(x);
      if (arg === null || !Number.isFinite(arg)) return null;
      const value = unaryFn(arg);
      return value !== null && Number.isFinite(value) ? value : null;
    };
  }

  if (node.type === 'OperatorNode') {
    const operator = node as unknown as { op: string; args: MathNode[] };
    if (!OPERATORS.has(operator.op)) {
      throw new Error('仅支持 +、-、*、/、^ 运算。');
    }
    if (operator.args.length === 1) {
      if (operator.op !== '+' && operator.op !== '-') {
        throw new Error('仅支持单目正负号运算。');
      }
      const evalOperand = compileNode(operator.args[0]);
      if (operator.op === '+') return evalOperand;
      return (x) => {
        const value = evalOperand(x);
        return value === null ? null : -value;
      };
    }
    if (operator.args.length !== 2) {
      throw new Error('不支持的多元运算符。');
    }
    if (operator.op === '^') {
      return compilePowerNode(operator.args[0], operator.args[1]);
    }
    const evalLeft = compileNode(operator.args[0]);
    const evalRight = compileNode(operator.args[1]);
    switch (operator.op) {
      case '+':
        return (x) => {
          const left = evalLeft(x);
          const right = evalRight(x);
          if (left === null || right === null) return null;
          const sum = left + right;
          return Number.isFinite(sum) ? sum : null;
        };
      case '-':
        return (x) => {
          const left = evalLeft(x);
          const right = evalRight(x);
          if (left === null || right === null) return null;
          const diff = left - right;
          return Number.isFinite(diff) ? diff : null;
        };
      case '*':
        return (x) => {
          const left = evalLeft(x);
          const right = evalRight(x);
          if (left === null || right === null) return null;
          const product = left * right;
          return Number.isFinite(product) ? product : null;
        };
      case '/':
        return (x) => {
          const left = evalLeft(x);
          const right = evalRight(x);
          if (left === null || right === null || right === 0) return null;
          const quotient = left / right;
          return Number.isFinite(quotient) ? quotient : null;
        };
      default:
        throw new Error('仅支持 +、-、*、/、^ 运算。');
    }
  }

  throw new Error('仅支持简单的一元实函数，不支持赋值、数组或属性访问。');
}

export function compileExpression(
  expression: string,
): (x: number) => number | null {
  if (!expression.trim() || expression.length > 160) {
    throw new Error('表达式长度应为 1–160 个字符。');
  }
  let root: MathNode;
  try {
    root = parse(expression);
  } catch {
    throw new Error('表达式无法解析，请检查括号和运算符。');
  }
  let count = 0;
  root.traverse((node) => {
    count += 1;
    if (count > MAX_AST_NODES || !TYPES.has(node.type)) {
      throw new Error('仅支持简单的一元实函数，不支持赋值、数组或属性访问。');
    }
  });
  const evaluateAst = compileNode(root);
  return (x) => {
    if (!Number.isFinite(x)) return null;
    return toDisplayValue(evaluateAst(x));
  };
}

function buildSampleXSequence(
  xMin: number,
  xMax: number,
  samples: number,
): number[] {
  const candidates: number[] = [];
  if (xMax - xMin <= 40) {
    const startInt = Math.ceil(xMin);
    const endInt = Math.floor(xMax);
    for (let k = startInt; k <= endInt; k += 1) {
      if (k > xMin + POINT_EPSILON && k < xMax - POINT_EPSILON) {
        candidates.push(normalizeZero(k));
      }
    }
  } else if (0 > xMin + POINT_EPSILON && 0 < xMax - POINT_EPSILON) {
    candidates.push(0);
  }

  const grid: number[] = new Array<number>(samples);
  for (let i = 0; i < samples; i += 1) {
    if (i === 0) {
      grid[i] = normalizeZero(xMin);
    } else if (i === samples - 1) {
      grid[i] = normalizeZero(xMax);
    } else {
      let x = xMin + ((xMax - xMin) * i) / (samples - 1);
      for (const candidate of candidates) {
        if (Math.abs(x - candidate) <= POINT_EPSILON) {
          x = candidate;
          break;
        }
      }
      grid[i] = normalizeZero(x);
    }
  }

  if (candidates.length === 0) {
    return grid;
  }

  const sequence: number[] = [grid[0]];
  let candidateIndex = 0;
  for (let i = 1; i < grid.length; i += 1) {
    const prevX = grid[i - 1];
    const currX = grid[i];
    while (
      candidateIndex < candidates.length &&
      candidates[candidateIndex] <= prevX + POINT_EPSILON
    ) {
      candidateIndex += 1;
    }
    while (
      candidateIndex < candidates.length &&
      candidates[candidateIndex] < currX - POINT_EPSILON
    ) {
      sequence.push(candidates[candidateIndex]);
      candidateIndex += 1;
    }
    sequence.push(currX);
  }
  return sequence;
}

function isHeuristicDiscontinuity(
  evaluate: Evaluator,
  prevX: number,
  prevY: number,
  middleX: number,
  middleY: number | null,
  currX: number,
  currY: number,
): boolean {
  if (middleY === null) {
    return true;
  }

  const d1 = middleY - prevY;
  const d2 = currY - middleY;
  const scale = Math.max(1, Math.abs(currY), Math.abs(prevY));
  const chordDeviation = Math.abs(middleY - (currY + prevY) / 2);

  // Non-monotonic spike across midpoint (e.g., odd/even poles like 1/(x - c) or tan(x))
  if (d1 * d2 < 0) {
    return chordDeviation > 0.5 * scale;
  }

  // Monotonic interval: check for step/jump discontinuities (sign, floor, ceil)
  // while avoiding false positives on smooth steep monotonic functions (exp, x^n, ln).
  const totalDiff = Math.abs(currY - prevY);
  if (
    totalDiff >= 0.4 &&
    Math.min(Math.abs(d1), Math.abs(d2)) <= 0.08 * totalDiff
  ) {
    const checkLeftHalf = Math.abs(d1) >= Math.abs(d2);
    const subStartX = checkLeftHalf ? prevX : middleX;
    const subStartY = checkLeftHalf ? prevY : middleY;
    const subEndX = checkLeftHalf ? middleX : currX;
    const subEndY = checkLeftHalf ? middleY : currY;
    const quarterX = (subStartX + subEndX) / 2;
    const quarterY = evaluate(quarterX);
    if (quarterY === null) {
      return true;
    }
    const q1 = quarterY - subStartY;
    const q2 = subEndY - quarterY;
    if (q1 * q2 < 0) {
      return true;
    }
    const subDiff = Math.abs(subEndY - subStartY);
    if (
      currX - prevX <= 1 &&
      Math.min(Math.abs(q1), Math.abs(q2)) <= 0.08 * subDiff
    ) {
      return true;
    }
  }

  return false;
}

function sampleSeries(
  evaluate: Evaluator,
  xSequence: readonly number[],
): { points: PlotPoint[]; gaps: number } {
  const points: PlotPoint[] = [];
  let gaps = 0;
  let previous: PlotPoint | undefined;

  for (const x of xSequence) {
    const y = evaluate(x);
    if (previous && previous[1] !== null && y !== null) {
      const middleX = normalizeZero((previous[0] + x) / 2);
      const middleY = evaluate(middleX);
      // Conservative midpoint heuristic, not a symbolic discontinuity detector.
      if (
        isHeuristicDiscontinuity(
          evaluate,
          previous[0],
          previous[1],
          middleX,
          middleY,
          x,
          y,
        )
      ) {
        points.push([middleX, null]);
        gaps += 1;
      }
    }
    if (y === null) {
      gaps += 1;
    }
    points.push([x, y]);
    previous = [x, y];
  }

  return { points, gaps };
}

function computeDifferenceQuotient(
  ya: number | null,
  yb: number | null,
  step: number,
): number | null {
  if (ya === null || yb === null || step === 0) {
    return null;
  }
  const quotient = (yb - ya) / step;
  if (!Number.isFinite(quotient)) {
    return null;
  }
  return normalizeZero(quotient);
}

function buildSecantPoints(
  x0: number,
  y0: number,
  slope: number,
  xMin: number,
  xMax: number,
): PlotPoint[] {
  if (slope === 0) {
    return Math.abs(y0) <= DISPLAY_LIMIT
      ? [
          [normalizeZero(xMin), normalizeZero(y0)],
          [normalizeZero(xMax), normalizeZero(y0)],
        ]
      : [];
  }

  const tLower = (-DISPLAY_LIMIT - y0) / slope;
  const tUpper = (DISPLAY_LIMIT - y0) / slope;
  const xa = Math.max(xMin, x0 + Math.min(tLower, tUpper));
  const xb = Math.min(xMax, x0 + Math.max(tLower, tUpper));

  if (!Number.isFinite(xa) || !Number.isFinite(xb) || xa > xb) {
    return [];
  }

  const clampY = (x: number) =>
    normalizeZero(
      Math.max(-DISPLAY_LIMIT, Math.min(DISPLAY_LIMIT, y0 + slope * (x - x0))),
    );

  if (xa === xb) {
    return [[normalizeZero(xa), clampY(xa)]];
  }

  return [
    [normalizeZero(xa), clampY(xa)],
    [normalizeZero(xb), clampY(xb)],
  ];
}

function computeSecantLine(
  evaluate: Evaluator,
  secant: SecantRequest,
  xMin: number,
  xMax: number,
): SecantLineResult {
  const x0 = normalizeZero(secant.x0);
  const { h } = secant;
  const x1 = normalizeZero(x0 + h);
  const y0 = evaluate(x0);
  const y1 = evaluate(x1);
  const slope = computeDifferenceQuotient(y0, y1, h);

  const delta = Math.abs(h);
  const yRight = evaluate(x0 + delta);
  const yLeft = evaluate(x0 - delta);
  const rightSlope = computeDifferenceQuotient(y0, yRight, delta);
  const leftSlope = computeDifferenceQuotient(yLeft, y0, delta);

  const points =
    y0 !== null && slope !== null
      ? buildSecantPoints(x0, y0, slope, xMin, xMax)
      : [];

  return {
    points,
    x0,
    y0,
    x1,
    y1,
    slope,
    leftSlope,
    rightSlope,
  };
}

export function sampleFunction(
  request: PlotRequest,
  samples = 801,
): PlotResult {
  const valid = plotRequestSchema.safeParse(request);
  if (!valid.success) {
    throw new Error(valid.error.issues[0].message);
  }
  if (!Number.isInteger(samples) || samples < 3 || samples > 1201) {
    throw new Error('采样数量须为 3–1201 之间的整数。');
  }

  const { expression, compareExpression, xMin, xMax, secant } = valid.data;
  const evaluate = compileExpression(expression);
  const xSequence = buildSampleXSequence(xMin, xMax, samples);
  const { points, gaps } = sampleSeries(evaluate, xSequence);

  const result: PlotResult = { points, gaps };

  if (compareExpression !== undefined) {
    const compareEvaluate = compileExpression(compareExpression);
    result.comparePoints = sampleSeries(compareEvaluate, xSequence).points;
  }

  if (secant !== undefined) {
    result.secantLine = computeSecantLine(evaluate, secant, xMin, xMax);
  }

  return result;
}
