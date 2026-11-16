import { parse, type MathNode } from 'mathjs/number';
import {
  surfacePlotRequestSchema,
  type IntegralRegionType,
  type PlotPoint,
  type RiemannPrism,
  type SurfaceIntegralConfig,
  type SurfaceIntegralResult,
  type SurfacePlotRequest,
  type SurfacePlotResult,
  type SurfaceProbe,
  type SurfaceProbeResult,
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

const BINARY_FUNCTIONS = new Map<string, (a: number, b: number) => number>([
  ['min', (a, b) => Math.min(a, b)],
  ['max', (a, b) => Math.max(a, b)],
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
const MAX_AST_NODES = 120;
const MAX_POWER_CONSTANT = 20;
const MAX_EXP_BASE = 1000;
const REGION_EPSILON = 1e-12;
const SNAP_EPSILON = 1e-12;
const REFERENCE_FINE_GRID = 120;
const GAUSS_OFFSET = 1 / (2 * Math.sqrt(3));
const SLICE_SAMPLE_COUNT = 101;
const PARTIAL_BASE_STEP = 1e-5;

type SurfaceEvaluator = (x: number, y: number) => number | null;

function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}

function snapNearInteger(value: number): number {
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) <= SNAP_EPSILON) {
    return normalizeZero(rounded);
  }
  return normalizeZero(value);
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

function containsVariables(node: MathNode): boolean {
  let found = false;
  node.traverse((child) => {
    if (child.type === 'SymbolNode') {
      const symbolName = (child as unknown as { name: string }).name;
      if (symbolName === 'x' || symbolName === 'y') {
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

function compilePowerNode(
  baseNode: MathNode,
  expNode: MathNode,
): SurfaceEvaluator {
  const evalBase = compileSurfaceNode(baseNode);
  const evalExp = compileSurfaceNode(expNode);
  const baseHasVars = containsVariables(baseNode);
  const expHasVars = containsVariables(expNode);

  if (expHasVars) {
    if (baseHasVars) {
      throw new Error(
        '不支持底数与指数同时含变量的幂运算，可改写为 exp(y * ln(x))。',
      );
    }
    const baseConst = evalBase(0, 0);
    if (
      baseConst === null ||
      !Number.isFinite(baseConst) ||
      baseConst <= 0 ||
      baseConst > MAX_EXP_BASE
    ) {
      throw new Error('指数含变量时，底数须为 (0, 1000] 内的有限正常数。');
    }
    return (x, y) => {
      const expVal = evalExp(x, y);
      if (expVal === null) return null;
      const result = Math.pow(baseConst, expVal);
      return Number.isFinite(result) ? result : null;
    };
  }

  const rational = extractRationalFraction(expNode);
  if (rational !== null) {
    const { p, q } = rational;
    return (x, y) => {
      const baseVal = evalBase(x, y);
      if (baseVal === null) return null;
      return evaluateRationalPower(baseVal, p, q);
    };
  }

  const expConst = evalExp(0, 0);
  if (
    expConst === null ||
    !Number.isFinite(expConst) ||
    Math.abs(expConst) > MAX_POWER_CONSTANT
  ) {
    throw new Error('幂指数须为绝对值不超过 20 的数字常量。');
  }
  return (x, y) => {
    const baseVal = evalBase(x, y);
    if (baseVal === null) return null;
    return evaluateConstantPower(baseVal, expConst);
  };
}

function compileSurfaceNode(node: MathNode): SurfaceEvaluator {
  if (node.type === 'ParenthesisNode') {
    const inner = (node as unknown as { content: MathNode }).content;
    return compileSurfaceNode(inner);
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
    if (name === 'y') return (_x, y) => y;
    if (name === 'pi') return () => Math.PI;
    if (name === 'e') return () => Math.E;
    throw new Error(`不支持的变量或函数：${name}。`);
  }

  if (node.type === 'FunctionNode') {
    const fn = node as unknown as { fn: MathNode; args: MathNode[] };
    if (fn.fn.type !== 'SymbolNode') {
      throw new Error('仅支持白名单内的初等实函数。');
    }
    const fnName = (fn.fn as unknown as { name: string }).name;

    const unaryFn = UNARY_FUNCTIONS.get(fnName);
    if (unaryFn) {
      if (fn.args.length !== 1) {
        throw new Error(`单参数函数 ${fnName} 仅接受 1 个参数。`);
      }
      const evalArg = compileSurfaceNode(fn.args[0]);
      return (x, y) => {
        const arg = evalArg(x, y);
        if (arg === null || !Number.isFinite(arg)) return null;
        const value = unaryFn(arg);
        return value !== null && Number.isFinite(value) ? value : null;
      };
    }

    const binaryFn = BINARY_FUNCTIONS.get(fnName);
    if (binaryFn) {
      if (fn.args.length !== 2) {
        throw new Error(`双参数函数 ${fnName} 需要恰好 2 个参数。`);
      }
      const evalFirst = compileSurfaceNode(fn.args[0]);
      const evalSecond = compileSurfaceNode(fn.args[1]);
      return (x, y) => {
        const first = evalFirst(x, y);
        const second = evalSecond(x, y);
        if (
          first === null ||
          second === null ||
          !Number.isFinite(first) ||
          !Number.isFinite(second)
        ) {
          return null;
        }
        const value = binaryFn(first, second);
        return Number.isFinite(value) ? value : null;
      };
    }

    throw new Error(`不支持的函数：${fnName}。`);
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
      const evalOperand = compileSurfaceNode(operator.args[0]);
      if (operator.op === '+') return evalOperand;
      return (x, y) => {
        const value = evalOperand(x, y);
        return value === null ? null : -value;
      };
    }
    if (operator.args.length !== 2) {
      throw new Error('不支持的多元运算符。');
    }
    if (operator.op === '^') {
      return compilePowerNode(operator.args[0], operator.args[1]);
    }
    const evalLeft = compileSurfaceNode(operator.args[0]);
    const evalRight = compileSurfaceNode(operator.args[1]);
    switch (operator.op) {
      case '+':
        return (x, y) => {
          const left = evalLeft(x, y);
          const right = evalRight(x, y);
          if (left === null || right === null) return null;
          const sum = left + right;
          return Number.isFinite(sum) ? sum : null;
        };
      case '-':
        return (x, y) => {
          const left = evalLeft(x, y);
          const right = evalRight(x, y);
          if (left === null || right === null) return null;
          const diff = left - right;
          return Number.isFinite(diff) ? diff : null;
        };
      case '*':
        return (x, y) => {
          const left = evalLeft(x, y);
          const right = evalRight(x, y);
          if (left === null || right === null) return null;
          const product = left * right;
          return Number.isFinite(product) ? product : null;
        };
      case '/':
        return (x, y) => {
          const left = evalLeft(x, y);
          const right = evalRight(x, y);
          if (left === null || right === null || right === 0) return null;
          const quotient = left / right;
          return Number.isFinite(quotient) ? quotient : null;
        };
      default:
        throw new Error('仅支持 +、-、*、/、^ 运算。');
    }
  }

  throw new Error('仅支持简单的二元实函数，不支持赋值、数组或属性访问。');
}

export function compileSurfaceExpression(expression: string): SurfaceEvaluator {
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
      throw new Error('仅支持简单的二元实函数，不支持赋值、数组或属性访问。');
    }
  });
  const evaluateAst = compileSurfaceNode(root);
  return (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return toDisplayValue(evaluateAst(x, y));
  };
}

function buildUniformGrid(
  min: number,
  max: number,
  divisions: number,
): number[] {
  const grid = new Array<number>(divisions + 1);
  const span = max - min;
  for (let i = 0; i <= divisions; i += 1) {
    if (i === 0) {
      grid[i] = normalizeZero(min);
    } else if (i === divisions) {
      grid[i] = normalizeZero(max);
    } else {
      grid[i] = snapNearInteger(min + (span * i) / divisions);
    }
  }
  return grid;
}

function createRegionPredicate(
  regionType: IntegralRegionType,
  xStart: number,
  xEnd: number,
  yStart: number,
  yEnd: number,
): (x: number, y: number) => boolean {
  const lx = xEnd - xStart;
  const ly = yEnd - yStart;
  const inBox = (x: number, y: number) =>
    x >= xStart - REGION_EPSILON &&
    x <= xEnd + REGION_EPSILON &&
    y >= yStart - REGION_EPSILON &&
    y <= yEnd + REGION_EPSILON;

  if (regionType === 'rectangle') {
    return inBox;
  }

  if (regionType === 'disk') {
    const cx = (xStart + xEnd) / 2;
    const cy = (yStart + yEnd) / 2;
    const rx = lx / 2;
    const ry = ly / 2;
    return (x, y) => {
      if (!inBox(x, y)) return false;
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      return nx * nx + ny * ny <= 1 + REGION_EPSILON;
    };
  }

  return (x, y) => {
    if (!inBox(x, y)) return false;
    return y <= yStart + (ly * (x - xStart)) / lx + REGION_EPSILON;
  };
}

function computeReferenceIntegral(
  evaluate: SurfaceEvaluator,
  config: SurfaceIntegralConfig,
): { referenceIntegral: number; domainArea: number } {
  const { regionType, xStart, xEnd, yStart, yEnd } = config;
  const lx = xEnd - xStart;
  const ly = yEnd - yStart;
  const m = REFERENCE_FINE_GRID;
  const totalSubNodes = 2 * m;
  const unitNodes = new Float64Array(totalSubNodes);

  for (let idx = 0; idx < m; idx += 1) {
    unitNodes[2 * idx] = (idx + 0.5 - GAUSS_OFFSET) / m;
    unitNodes[2 * idx + 1] = (idx + 0.5 + GAUSS_OFFSET) / m;
  }

  const unitWeight = 1 / (4 * m * m);
  let domainArea = 0;
  let referenceIntegral = 0;

  if (regionType === 'rectangle') {
    const subArea = lx * ly * unitWeight;
    for (let j = 0; j < totalSubNodes; j += 1) {
      const y = yStart + unitNodes[j] * ly;
      let rowValid = 0;
      let rowZSum = 0;
      for (let i = 0; i < totalSubNodes; i += 1) {
        const x = xStart + unitNodes[i] * lx;
        const z = evaluate(x, y);
        if (z !== null) {
          rowValid += 1;
          rowZSum += z;
        }
      }
      domainArea += rowValid * subArea;
      referenceIntegral += rowZSum * subArea;
    }
  } else if (regionType === 'disk') {
    const cx = (xStart + xEnd) / 2;
    const cy = (yStart + yEnd) / 2;
    const rx = lx / 2;
    const ry = ly / 2;
    const cosTheta = new Float64Array(totalSubNodes);
    const sinTheta = new Float64Array(totalSubNodes);
    for (let j = 0; j < totalSubNodes; j += 1) {
      const theta = 2 * Math.PI * unitNodes[j];
      cosTheta[j] = Math.cos(theta);
      sinTheta[j] = Math.sin(theta);
    }
    const polarBaseFactor = 2 * Math.PI * rx * ry * unitWeight;
    for (let i = 0; i < totalSubNodes; i += 1) {
      const r = unitNodes[i];
      const subArea = polarBaseFactor * r;
      const rRx = r * rx;
      const rRy = r * ry;
      let rowValid = 0;
      let rowZSum = 0;
      for (let j = 0; j < totalSubNodes; j += 1) {
        const x = cx + rRx * cosTheta[j];
        const y = cy + rRy * sinTheta[j];
        const z = evaluate(x, y);
        if (z !== null) {
          rowValid += 1;
          rowZSum += z;
        }
      }
      domainArea += rowValid * subArea;
      referenceIntegral += rowZSum * subArea;
    }
  } else {
    const triBaseFactor = lx * ly * unitWeight;
    for (let i = 0; i < totalSubNodes; i += 1) {
      const u = unitNodes[i];
      const x = xStart + u * lx;
      const subArea = triBaseFactor * u;
      const uLy = u * ly;
      let rowValid = 0;
      let rowZSum = 0;
      for (let j = 0; j < totalSubNodes; j += 1) {
        const y = yStart + unitNodes[j] * uLy;
        const z = evaluate(x, y);
        if (z !== null) {
          rowValid += 1;
          rowZSum += z;
        }
      }
      domainArea += rowValid * subArea;
      referenceIntegral += rowZSum * subArea;
    }
  }

  return {
    referenceIntegral: normalizeZero(referenceIntegral),
    domainArea: normalizeZero(domainArea),
  };
}

function computeDoubleIntegral(
  evaluate: SurfaceEvaluator,
  config: SurfaceIntegralConfig,
): SurfaceIntegralResult {
  const { regionType, xStart, xEnd, yStart, yEnd, partitions, rule } = config;
  const lx = xEnd - xStart;
  const ly = yEnd - yStart;
  const dx = lx / partitions;
  const dy = ly / partitions;
  const dA = dx * dy;
  const inRegion = createRegionPredicate(
    regionType,
    xStart,
    xEnd,
    yStart,
    yEnd,
  );

  const prisms: RiemannPrism[] = [];
  let positiveVolume = 0;
  let negativeVolume = 0;

  for (let j = 0; j < partitions; j += 1) {
    const yc = normalizeZero(yStart + (j + 0.5) * dy);
    for (let i = 0; i < partitions; i += 1) {
      const xc = normalizeZero(xStart + (i + 0.5) * dx);
      if (!inRegion(xc, yc)) {
        continue;
      }

      let xs = xc;
      let ys = yc;
      if (rule === 'lower-left') {
        xs = normalizeZero(xStart + i * dx);
        ys = normalizeZero(yStart + j * dy);
      } else if (rule === 'upper-right') {
        xs = normalizeZero(xStart + (i + 1) * dx);
        ys = normalizeZero(yStart + (j + 1) * dy);
      }

      let z = evaluate(xs, ys);
      if (z === null && rule !== 'midpoint') {
        z = evaluate(xc, yc);
      }
      if (z === null) {
        continue;
      }

      prisms.push({ x: xc, y: yc, dx, dy, z });
      const vol = z * dA;
      if (vol >= 0) {
        positiveVolume += vol;
      } else {
        negativeVolume += vol;
      }
    }
  }

  positiveVolume = normalizeZero(positiveVolume);
  negativeVolume = normalizeZero(negativeVolume);
  const riemannSum = normalizeZero(positiveVolume + negativeVolume);

  const { referenceIntegral, domainArea } = computeReferenceIntegral(
    evaluate,
    config,
  );
  const absError = normalizeZero(Math.abs(riemannSum - referenceIntegral));
  const meanValue =
    domainArea > 0 ? normalizeZero(referenceIntegral / domainArea) : null;

  return {
    prisms,
    riemannSum,
    positiveVolume,
    negativeVolume,
    referenceIntegral,
    absError,
    domainArea,
    meanValue,
  };
}

function estimatePartialDerivative(
  evalAlongAxis: (t: number) => number | null,
  t0: number,
  z0: number,
): number | null {
  const h1 = PARTIAL_BASE_STEP * Math.max(1, Math.abs(t0));
  const h2 = h1 / 5;

  const fPlus1 = evalAlongAxis(t0 + h1);
  const fMinus1 = evalAlongAxis(t0 - h1);
  const fPlus2 = evalAlongAxis(t0 + h2);
  const fMinus2 = evalAlongAxis(t0 - h2);

  if (
    fPlus1 !== null &&
    fMinus1 !== null &&
    fPlus2 !== null &&
    fMinus2 !== null
  ) {
    const right1 = (fPlus1 - z0) / h1;
    const left1 = (z0 - fMinus1) / h1;
    const right2 = (fPlus2 - z0) / h2;
    const left2 = (z0 - fMinus2) / h2;

    const extrapRight = (5 * right2 - right1) / 4;
    const extrapLeft = (5 * left2 - left1) / 4;
    const central1 = (fPlus1 - fMinus1) / (2 * h1);
    const central2 = (fPlus2 - fMinus2) / (2 * h2);

    const scale = Math.max(
      1,
      Math.abs(central2),
      Math.abs(extrapRight),
      Math.abs(extrapLeft),
    );
    if (
      !Number.isFinite(central1) ||
      !Number.isFinite(central2) ||
      Math.abs(extrapRight - extrapLeft) > 1e-2 * scale ||
      Math.abs(central2 - central1) > 1e-2 * scale ||
      Math.abs(central1) > DISPLAY_LIMIT
    ) {
      return null;
    }
    return normalizeZero(central1);
  }

  if (fPlus1 !== null && fPlus2 !== null) {
    const right1 = (fPlus1 - z0) / h1;
    const right2 = (fPlus2 - z0) / h2;
    const extrap = (5 * right2 - right1) / 4;
    const scale = Math.max(1, Math.abs(extrap));
    if (
      !Number.isFinite(extrap) ||
      Math.abs(right2 - right1) > 2e-2 * scale ||
      Math.abs(extrap) > DISPLAY_LIMIT
    ) {
      return null;
    }
    return normalizeZero(extrap);
  }

  if (fMinus1 !== null && fMinus2 !== null) {
    const left1 = (z0 - fMinus1) / h1;
    const left2 = (z0 - fMinus2) / h2;
    const extrap = (5 * left2 - left1) / 4;
    const scale = Math.max(1, Math.abs(extrap));
    if (
      !Number.isFinite(extrap) ||
      Math.abs(left2 - left1) > 2e-2 * scale ||
      Math.abs(extrap) > DISPLAY_LIMIT
    ) {
      return null;
    }
    return normalizeZero(extrap);
  }

  return null;
}

function computeSurfaceProbe(
  evaluate: SurfaceEvaluator,
  probe: SurfaceProbe,
  xMin: number,
  xMax: number,
  yDomainMin: number,
  yDomainMax: number,
): SurfaceProbeResult {
  const x0 = normalizeZero(probe.x0);
  const y0 = normalizeZero(probe.y0);
  const z0 = evaluate(x0, y0);

  let fx: number | null = null;
  let fy: number | null = null;
  let gradNorm: number | null = null;

  if (z0 !== null) {
    fx = estimatePartialDerivative((x) => evaluate(x, y0), x0, z0);
    fy = estimatePartialDerivative((y) => evaluate(x0, y), y0, z0);
    if (fx !== null && fy !== null) {
      const norm = Math.hypot(fx, fy);
      gradNorm =
        Number.isFinite(norm) && norm <= DISPLAY_LIMIT
          ? normalizeZero(norm)
          : null;
    }
  }

  const sliceXCoords = buildUniformGrid(xMin, xMax, SLICE_SAMPLE_COUNT - 1);
  const sliceX: PlotPoint[] = sliceXCoords.map((x) => [x, evaluate(x, y0)]);

  const sliceYCoords = buildUniformGrid(
    yDomainMin,
    yDomainMax,
    SLICE_SAMPLE_COUNT - 1,
  );
  const sliceY: PlotPoint[] = sliceYCoords.map((y) => [y, evaluate(x0, y)]);

  return {
    x0,
    y0,
    z0,
    fx,
    fy,
    gradNorm,
    sliceX,
    sliceY,
  };
}

export function sampleSurface(request: SurfacePlotRequest): SurfacePlotResult {
  const valid = surfacePlotRequestSchema.safeParse(request);
  if (!valid.success) {
    throw new Error(valid.error.issues[0].message);
  }

  const {
    expression,
    xMin,
    xMax,
    yDomainMin,
    yDomainMax,
    gridSize,
    integral,
    probe,
  } = valid.data;

  const evaluate = compileSurfaceExpression(expression);
  const gridX = buildUniformGrid(xMin, xMax, gridSize);
  const gridY = buildUniformGrid(yDomainMin, yDomainMax, gridSize);
  const sideLength = gridSize + 1;
  const totalPoints = sideLength * sideLength;
  const zValues = new Array<number | null>(totalPoints);

  let validCount = 0;
  let gaps = 0;
  let zDataMin = Number.POSITIVE_INFINITY;
  let zDataMax = Number.NEGATIVE_INFINITY;

  for (let j = 0; j < sideLength; j += 1) {
    const y = gridY[j];
    const rowOffset = j * sideLength;
    for (let i = 0; i < sideLength; i += 1) {
      const z = evaluate(gridX[i], y);
      zValues[rowOffset + i] = z;
      if (z === null) {
        gaps += 1;
      } else {
        validCount += 1;
        if (z < zDataMin) zDataMin = z;
        if (z > zDataMax) zDataMax = z;
      }
    }
  }

  const result: SurfacePlotResult = {
    gridX,
    gridY,
    zValues,
    validCount,
    gaps,
    zDataMin: validCount > 0 ? normalizeZero(zDataMin) : null,
    zDataMax: validCount > 0 ? normalizeZero(zDataMax) : null,
  };

  if (integral !== undefined) {
    result.integralResult = computeDoubleIntegral(evaluate, integral);
  }

  if (probe !== undefined) {
    result.probeResult = computeSurfaceProbe(
      evaluate,
      probe,
      xMin,
      xMax,
      yDomainMin,
      yDomainMax,
    );
  }

  return result;
}
