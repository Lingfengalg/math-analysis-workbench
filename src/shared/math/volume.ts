import { parse, type MathNode } from 'mathjs/number';
import {
  tripleIntegralRequestSchema,
  type TripleIntegralRequest,
  type TripleIntegralResult,
  type TripleRegionType,
  type TripleVoxel,
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
const TRIPLE_GL4_SEGMENTS = 8;
const SLICE_GL4_SEGMENTS = 16;

const GL4_X1 = Math.sqrt(3 / 7 + (2 / 7) * Math.sqrt(6 / 5));
const GL4_X2 = Math.sqrt(3 / 7 - (2 / 7) * Math.sqrt(6 / 5));
const GL4_W1 = (18 - Math.sqrt(30)) / 36;
const GL4_W2 = (18 + Math.sqrt(30)) / 36;
const GL4_OFFSETS = [-GL4_X1, -GL4_X2, GL4_X2, GL4_X1] as const;
const GL4_HALF_WEIGHTS = [
  GL4_W1 / 2,
  GL4_W2 / 2,
  GL4_W2 / 2,
  GL4_W1 / 2,
] as const;

export type VolumeEvaluator = (
  x: number,
  y: number,
  z: number,
) => number | null;

interface BoundingBox3D {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
  lx: number;
  ly: number;
  lz: number;
  rx: number;
  ry: number;
  rz: number;
  cx: number;
  cy: number;
  cz: number;
}

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

function containsVariables(node: MathNode): boolean {
  let found = false;
  node.traverse((child) => {
    if (child.type === 'SymbolNode') {
      const symbolName = (child as unknown as { name: string }).name;
      if (symbolName === 'x' || symbolName === 'y' || symbolName === 'z') {
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
): VolumeEvaluator {
  const evalBase = compileVolumeNode(baseNode);
  const evalExp = compileVolumeNode(expNode);
  const baseHasVars = containsVariables(baseNode);
  const expHasVars = containsVariables(expNode);

  if (expHasVars) {
    if (baseHasVars) {
      throw new Error(
        '不支持底数与指数同时含变量的幂运算，可改写为 exp(z * ln(x))。',
      );
    }
    const baseConst = evalBase(0, 0, 0);
    if (
      baseConst === null ||
      !Number.isFinite(baseConst) ||
      baseConst <= 0 ||
      baseConst > MAX_EXP_BASE
    ) {
      throw new Error('指数含变量时，底数须为 (0, 1000] 内的有限正常数。');
    }
    return (x, y, z) => {
      const expVal = evalExp(x, y, z);
      if (expVal === null) return null;
      const result = Math.pow(baseConst, expVal);
      return Number.isFinite(result) ? result : null;
    };
  }

  const rational = extractRationalFraction(expNode);
  if (rational !== null) {
    const { p, q } = rational;
    return (x, y, z) => {
      const baseVal = evalBase(x, y, z);
      if (baseVal === null) return null;
      return evaluateRationalPower(baseVal, p, q);
    };
  }

  const expConst = evalExp(0, 0, 0);
  if (
    expConst === null ||
    !Number.isFinite(expConst) ||
    Math.abs(expConst) > MAX_POWER_CONSTANT
  ) {
    throw new Error('幂指数须为绝对值不超过 20 的数字常量。');
  }
  return (x, y, z) => {
    const baseVal = evalBase(x, y, z);
    if (baseVal === null) return null;
    return evaluateConstantPower(baseVal, expConst);
  };
}

function compileVolumeNode(node: MathNode): VolumeEvaluator {
  if (node.type === 'ParenthesisNode') {
    const inner = (node as unknown as { content: MathNode }).content;
    return compileVolumeNode(inner);
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
    if (name === 'z') return (_x, _y, z) => z;
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
      const evalArg = compileVolumeNode(fn.args[0]);
      return (x, y, z) => {
        const arg = evalArg(x, y, z);
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
      const evalFirst = compileVolumeNode(fn.args[0]);
      const evalSecond = compileVolumeNode(fn.args[1]);
      return (x, y, z) => {
        const first = evalFirst(x, y, z);
        const second = evalSecond(x, y, z);
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
      const evalOperand = compileVolumeNode(operator.args[0]);
      if (operator.op === '+') return evalOperand;
      return (x, y, z) => {
        const value = evalOperand(x, y, z);
        return value === null ? null : -value;
      };
    }
    if (operator.args.length !== 2) {
      throw new Error('不支持的多元运算符。');
    }
    if (operator.op === '^') {
      return compilePowerNode(operator.args[0], operator.args[1]);
    }
    const evalLeft = compileVolumeNode(operator.args[0]);
    const evalRight = compileVolumeNode(operator.args[1]);
    switch (operator.op) {
      case '+':
        return (x, y, z) => {
          const left = evalLeft(x, y, z);
          const right = evalRight(x, y, z);
          if (left === null || right === null) return null;
          const sum = left + right;
          return Number.isFinite(sum) ? sum : null;
        };
      case '-':
        return (x, y, z) => {
          const left = evalLeft(x, y, z);
          const right = evalRight(x, y, z);
          if (left === null || right === null) return null;
          const diff = left - right;
          return Number.isFinite(diff) ? diff : null;
        };
      case '*':
        return (x, y, z) => {
          const left = evalLeft(x, y, z);
          const right = evalRight(x, y, z);
          if (left === null || right === null) return null;
          const product = left * right;
          return Number.isFinite(product) ? product : null;
        };
      case '/':
        return (x, y, z) => {
          const left = evalLeft(x, y, z);
          const right = evalRight(x, y, z);
          if (left === null || right === null || right === 0) return null;
          const quotient = left / right;
          return Number.isFinite(quotient) ? quotient : null;
        };
      default:
        throw new Error('仅支持 +、-、*、/、^ 运算。');
    }
  }

  throw new Error('仅支持简单的三元实函数，不支持赋值、数组或属性访问。');
}

export function compileVolumeExpression(expression: string): VolumeEvaluator {
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
      throw new Error('仅支持简单的三元实函数，不支持赋值、数组或属性访问。');
    }
  });
  const evaluateAst = compileVolumeNode(root);
  return (x, y, z) => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return null;
    }
    return toDisplayValue(evaluateAst(x, y, z));
  };
}

function buildLinearGaussLegendreRule(segments: number): {
  nodes: Float64Array;
  weights: Float64Array;
} {
  const count = 4 * segments;
  const nodes = new Float64Array(count);
  const weights = new Float64Array(count);
  for (let s = 0; s < segments; s += 1) {
    for (let r = 0; r < 4; r += 1) {
      const idx = 4 * s + r;
      nodes[idx] = (s + 0.5 + 0.5 * GL4_OFFSETS[r]) / segments;
      weights[idx] = GL4_HALF_WEIGHTS[r] / segments;
    }
  }
  return { nodes, weights };
}

function createOmegaPredicate(
  regionType: TripleRegionType,
  box: BoundingBox3D,
): (x: number, y: number, z: number) => boolean {
  const {
    xMin,
    xMax,
    yMin,
    yMax,
    zMin,
    zMax,
    lx,
    ly,
    lz,
    rx,
    ry,
    rz,
    cx,
    cy,
    cz,
  } = box;
  const inBox = (x: number, y: number, z: number) =>
    x >= xMin - REGION_EPSILON &&
    x <= xMax + REGION_EPSILON &&
    y >= yMin - REGION_EPSILON &&
    y <= yMax + REGION_EPSILON &&
    z >= zMin - REGION_EPSILON &&
    z <= zMax + REGION_EPSILON;

  if (regionType === 'box') {
    return inBox;
  }

  if (regionType === 'sphere') {
    return (x, y, z) => {
      if (!inBox(x, y, z)) return false;
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      const nz = (z - cz) / rz;
      return nx * nx + ny * ny + nz * nz <= 1 + REGION_EPSILON;
    };
  }

  if (regionType === 'cylinder') {
    return (x, y, z) => {
      if (!inBox(x, y, z)) return false;
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      return nx * nx + ny * ny <= 1 + REGION_EPSILON;
    };
  }

  if (regionType === 'tetrahedron') {
    return (x, y, z) => {
      if (!inBox(x, y, z)) return false;
      return (
        (x - xMin) / lx + (y - yMin) / ly + (z - zMin) / lz <=
        1 + REGION_EPSILON
      );
    };
  }

  return (x, y, z) => {
    if (!inBox(x, y, z)) return false;
    const nx = (x - cx) / rx;
    const ny = (y - cy) / ry;
    return nx * nx + ny * ny <= (z - zMin) / lz + REGION_EPSILON;
  };
}

function computeTripleReference(
  evaluate: VolumeEvaluator,
  regionType: TripleRegionType,
  box: BoundingBox3D,
): { referenceIntegral: number; domainVolume: number } {
  const { xMin, yMin, zMin, lx, ly, lz, rx, ry, rz, cx, cy, cz } = box;
  const { nodes, weights } = buildLinearGaussLegendreRule(TRIPLE_GL4_SEGMENTS);
  const n = nodes.length;

  let domainVolume = 0;
  let referenceIntegral = 0;

  if (regionType === 'box') {
    const scale = lx * ly * lz;
    for (let k = 0; k < n; k += 1) {
      const z = zMin + nodes[k] * lz;
      const wk = scale * weights[k];
      for (let j = 0; j < n; j += 1) {
        const y = yMin + nodes[j] * ly;
        const wkj = wk * weights[j];
        for (let i = 0; i < n; i += 1) {
          const x = xMin + nodes[i] * lx;
          const val = evaluate(x, y, z);
          if (val !== null) {
            const dW = wkj * weights[i];
            domainVolume += dW;
            referenceIntegral += val * dW;
          }
        }
      }
    }
  } else if (regionType === 'sphere') {
    const rho = new Float64Array(n);
    const wRho = new Float64Array(n);
    const sinPhi = new Float64Array(n);
    const cosPhi = new Float64Array(n);
    const wPhi = new Float64Array(n);
    const cosTheta = new Float64Array(n);
    const sinTheta = new Float64Array(n);
    const wTheta = new Float64Array(n);

    for (let idx = 0; idx < n; idx += 1) {
      const u = nodes[idx];
      const wu = weights[idx];
      const halfPiU = 0.5 * Math.PI * u;
      const rVal = Math.sin(halfPiU);
      rho[idx] = rVal;
      wRho[idx] = rVal * rVal * 0.5 * Math.PI * Math.cos(halfPiU) * wu;

      const phi = Math.PI * u;
      sinPhi[idx] = Math.sin(phi);
      cosPhi[idx] = Math.cos(phi);
      wPhi[idx] = Math.PI * sinPhi[idx] * wu;

      const theta = 2 * Math.PI * u;
      cosTheta[idx] = Math.cos(theta);
      sinTheta[idx] = Math.sin(theta);
      wTheta[idx] = 2 * Math.PI * wu;
    }

    const scale = rx * ry * rz;
    for (let i = 0; i < n; i += 1) {
      const rVal = rho[i];
      const wi = scale * wRho[i];
      for (let j = 0; j < n; j += 1) {
        const z = cz + rz * rVal * cosPhi[j];
        const rSinPhi = rVal * sinPhi[j];
        const wij = wi * wPhi[j];
        for (let k = 0; k < n; k += 1) {
          const x = cx + rx * rSinPhi * cosTheta[k];
          const y = cy + ry * rSinPhi * sinTheta[k];
          const val = evaluate(x, y, z);
          if (val !== null) {
            const dW = wij * wTheta[k];
            domainVolume += dW;
            referenceIntegral += val * dW;
          }
        }
      }
    }
  } else if (regionType === 'cylinder') {
    const rad = new Float64Array(n);
    const wRad = new Float64Array(n);
    const cosTheta = new Float64Array(n);
    const sinTheta = new Float64Array(n);
    const wTheta = new Float64Array(n);
    const zCoord = new Float64Array(n);
    const wZ = new Float64Array(n);

    for (let idx = 0; idx < n; idx += 1) {
      const u = nodes[idx];
      const wu = weights[idx];
      const halfPiU = 0.5 * Math.PI * u;
      const rVal = Math.sin(halfPiU);
      rad[idx] = rVal;
      wRad[idx] = rVal * 0.5 * Math.PI * Math.cos(halfPiU) * wu;

      const theta = 2 * Math.PI * u;
      cosTheta[idx] = Math.cos(theta);
      sinTheta[idx] = Math.sin(theta);
      wTheta[idx] = 2 * Math.PI * wu;

      const piU = Math.PI * u;
      zCoord[idx] = zMin + 0.5 * (1 - Math.cos(piU)) * lz;
      wZ[idx] = lz * 0.5 * Math.PI * Math.sin(piU) * wu;
    }

    const xyScale = rx * ry;
    for (let k = 0; k < n; k += 1) {
      const z = zCoord[k];
      const wk = xyScale * wZ[k];
      for (let i = 0; i < n; i += 1) {
        const rRx = rx * rad[i];
        const rRy = ry * rad[i];
        const wki = wk * wRad[i];
        for (let j = 0; j < n; j += 1) {
          const x = cx + rRx * cosTheta[j];
          const y = cy + rRy * sinTheta[j];
          const val = evaluate(x, y, z);
          if (val !== null) {
            const dW = wki * wTheta[j];
            domainVolume += dW;
            referenceIntegral += val * dW;
          }
        }
      }
    }
  } else if (regionType === 'tetrahedron') {
    const scale = lx * ly * lz;
    for (let i = 0; i < n; i += 1) {
      const u = nodes[i];
      const oneMinusU = 1 - u;
      const x = xMin + lx * u;
      const wi = scale * oneMinusU * oneMinusU * weights[i];
      for (let j = 0; j < n; j += 1) {
        const v = nodes[j];
        const oneMinusV = 1 - v;
        const y = yMin + ly * oneMinusU * v;
        const wij = wi * oneMinusV * weights[j];
        const zSpan = lz * oneMinusU * oneMinusV;
        for (let k = 0; k < n; k += 1) {
          const z = zMin + zSpan * nodes[k];
          const val = evaluate(x, y, z);
          if (val !== null) {
            const dW = wij * weights[k];
            domainVolume += dW;
            referenceIntegral += val * dW;
          }
        }
      }
    }
  } else {
    const rad = new Float64Array(n);
    const wRad = new Float64Array(n);
    const cosTheta = new Float64Array(n);
    const sinTheta = new Float64Array(n);
    const wTheta = new Float64Array(n);
    const sqrtS = new Float64Array(n);
    const zCoord = new Float64Array(n);
    const wHeight = new Float64Array(n);

    for (let idx = 0; idx < n; idx += 1) {
      const u = nodes[idx];
      const wu = weights[idx];
      const halfPiU = 0.5 * Math.PI * u;
      const rVal = Math.sin(halfPiU);
      rad[idx] = rVal;
      wRad[idx] = rVal * 0.5 * Math.PI * Math.cos(halfPiU) * wu;

      const theta = 2 * Math.PI * u;
      cosTheta[idx] = Math.cos(theta);
      sinTheta[idx] = Math.sin(theta);
      wTheta[idx] = 2 * Math.PI * wu;

      const sRoot = rVal;
      const sVal = sRoot * sRoot;
      sqrtS[idx] = sRoot;
      zCoord[idx] = zMin + lz * sVal;
      wHeight[idx] = lz * sVal * 0.5 * Math.PI * Math.sin(Math.PI * u) * wu;
    }

    const xyScale = rx * ry;
    for (let k = 0; k < n; k += 1) {
      const z = zCoord[k];
      const hRoot = sqrtS[k];
      const wk = xyScale * wHeight[k];
      for (let i = 0; i < n; i += 1) {
        const effRx = rx * hRoot * rad[i];
        const effRy = ry * hRoot * rad[i];
        const wki = wk * wRad[i];
        for (let j = 0; j < n; j += 1) {
          const x = cx + effRx * cosTheta[j];
          const y = cy + effRy * sinTheta[j];
          const val = evaluate(x, y, z);
          if (val !== null) {
            const dW = wki * wTheta[j];
            domainVolume += dW;
            referenceIntegral += val * dW;
          }
        }
      }
    }
  }

  return {
    referenceIntegral: normalizeZero(referenceIntegral),
    domainVolume: normalizeZero(domainVolume),
  };
}

function integrateEllipseSlice(
  evaluate: VolumeEvaluator,
  z: number,
  cx: number,
  cy: number,
  semiA: number,
  semiB: number,
  nodes: Float64Array,
  weights: Float64Array,
): { area: number; sliceIntegral: number } {
  if (semiA <= 0 || semiB <= 0) {
    return { area: 0, sliceIntegral: 0 };
  }
  const n = nodes.length;
  const cosTheta = new Float64Array(n);
  const sinTheta = new Float64Array(n);
  const wTheta = new Float64Array(n);
  for (let j = 0; j < n; j += 1) {
    const theta = 2 * Math.PI * nodes[j];
    cosTheta[j] = Math.cos(theta);
    sinTheta[j] = Math.sin(theta);
    wTheta[j] = 2 * Math.PI * weights[j];
  }

  let area = 0;
  let sliceIntegral = 0;
  const scale = semiA * semiB;

  for (let i = 0; i < n; i += 1) {
    const halfPiU = 0.5 * Math.PI * nodes[i];
    const r = Math.sin(halfPiU);
    const wRad = scale * r * 0.5 * Math.PI * Math.cos(halfPiU) * weights[i];
    const rA = semiA * r;
    const rB = semiB * r;
    for (let j = 0; j < n; j += 1) {
      const x = cx + rA * cosTheta[j];
      const y = cy + rB * sinTheta[j];
      const val = evaluate(x, y, z);
      if (val !== null) {
        const dW = wRad * wTheta[j];
        area += dW;
        sliceIntegral += val * dW;
      }
    }
  }

  return {
    area: normalizeZero(area),
    sliceIntegral: normalizeZero(sliceIntegral),
  };
}

function computeSliceQuadrature(
  evaluate: VolumeEvaluator,
  regionType: TripleRegionType,
  box: BoundingBox3D,
  z: number,
): { area: number; sliceIntegral: number } {
  const { xMin, yMin, zMin, zMax, lx, ly, lz, rx, ry, rz, cx, cy, cz } = box;
  const zClamped = Math.min(zMax, Math.max(zMin, z));
  const { nodes, weights } = buildLinearGaussLegendreRule(SLICE_GL4_SEGMENTS);
  const n = nodes.length;

  if (regionType === 'box') {
    let area = 0;
    let sliceIntegral = 0;
    const scale = lx * ly;
    for (let j = 0; j < n; j += 1) {
      const y = yMin + nodes[j] * ly;
      const wj = scale * weights[j];
      for (let i = 0; i < n; i += 1) {
        const x = xMin + nodes[i] * lx;
        const val = evaluate(x, y, zClamped);
        if (val !== null) {
          const dW = wj * weights[i];
          area += dW;
          sliceIntegral += val * dW;
        }
      }
    }
    return {
      area: normalizeZero(area),
      sliceIntegral: normalizeZero(sliceIntegral),
    };
  }

  if (regionType === 'cylinder') {
    return integrateEllipseSlice(
      evaluate,
      zClamped,
      cx,
      cy,
      rx,
      ry,
      nodes,
      weights,
    );
  }

  if (regionType === 'sphere') {
    const nz = (zClamped - cz) / rz;
    const q = 1 - nz * nz;
    if (q <= 0) {
      return { area: 0, sliceIntegral: 0 };
    }
    const rootQ = Math.sqrt(q);
    return integrateEllipseSlice(
      evaluate,
      zClamped,
      cx,
      cy,
      rx * rootQ,
      ry * rootQ,
      nodes,
      weights,
    );
  }

  if (regionType === 'paraboloid-cap') {
    const s = (zClamped - zMin) / lz;
    if (s <= 0) {
      return { area: 0, sliceIntegral: 0 };
    }
    const rootS = Math.sqrt(s);
    return integrateEllipseSlice(
      evaluate,
      zClamped,
      cx,
      cy,
      rx * rootS,
      ry * rootS,
      nodes,
      weights,
    );
  }

  const tau = (zMax - zClamped) / lz;
  if (tau <= 0) {
    return { area: 0, sliceIntegral: 0 };
  }
  const legX = tau * lx;
  const legY = tau * ly;
  const scale = legX * legY;
  let area = 0;
  let sliceIntegral = 0;
  for (let i = 0; i < n; i += 1) {
    const u = nodes[i];
    const oneMinusU = 1 - u;
    const x = xMin + legX * u;
    const wi = scale * oneMinusU * weights[i];
    for (let j = 0; j < n; j += 1) {
      const y = yMin + legY * oneMinusU * nodes[j];
      const val = evaluate(x, y, zClamped);
      if (val !== null) {
        const dW = wi * weights[j];
        area += dW;
        sliceIntegral += val * dW;
      }
    }
  }
  return {
    area: normalizeZero(area),
    sliceIntegral: normalizeZero(sliceIntegral),
  };
}

export function sampleTripleIntegral(
  request: TripleIntegralRequest,
): TripleIntegralResult {
  const valid = tripleIntegralRequestSchema.safeParse(request);
  if (!valid.success) {
    throw new Error(valid.error.issues[0].message);
  }

  const {
    expression,
    regionType,
    xMin,
    xMax,
    yMin,
    yMax,
    zMin,
    zMax,
    partitions,
    sliceZ,
  } = valid.data;

  const evaluate = compileVolumeExpression(expression);

  const lx = xMax - xMin;
  const ly = yMax - yMin;
  const lz = zMax - zMin;
  const box: BoundingBox3D = {
    xMin,
    xMax,
    yMin,
    yMax,
    zMin,
    zMax,
    lx,
    ly,
    lz,
    rx: lx / 2,
    ry: ly / 2,
    rz: lz / 2,
    cx: (xMin + xMax) / 2,
    cy: (yMin + yMax) / 2,
    cz: (zMin + zMax) / 2,
  };

  const inOmega = createOmegaPredicate(regionType, box);

  const dx = lx / partitions;
  const dy = ly / partitions;
  const dz = lz / partitions;
  const dV = dx * dy * dz;

  const hasValidSlice =
    sliceZ !== undefined &&
    sliceZ >= zMin - REGION_EPSILON &&
    sliceZ <= zMax + REGION_EPSILON;

  let kSlice = -1;
  if (hasValidSlice && sliceZ !== undefined) {
    let bestDist = Number.POSITIVE_INFINITY;
    for (let k = 0; k < partitions; k += 1) {
      const zc = zMin + (k + 0.5) * dz;
      const dist = Math.abs(zc - sliceZ);
      if (dist < bestDist - REGION_EPSILON) {
        bestDist = dist;
        kSlice = k;
      }
    }
  }

  const voxels: TripleVoxel[] = [];
  let riemannSum = 0;
  let valueMin = Number.POSITIVE_INFINITY;
  let valueMax = Number.NEGATIVE_INFINITY;
  let sliceVoxelCount = 0;

  for (let k = 0; k < partitions; k += 1) {
    const zc = normalizeZero(zMin + (k + 0.5) * dz);
    const inSlice = k === kSlice;
    for (let j = 0; j < partitions; j += 1) {
      const yc = normalizeZero(yMin + (j + 0.5) * dy);
      for (let i = 0; i < partitions; i += 1) {
        const xc = normalizeZero(xMin + (i + 0.5) * dx);
        if (!inOmega(xc, yc, zc)) {
          continue;
        }
        const val = evaluate(xc, yc, zc);
        if (val === null) {
          continue;
        }
        if (inSlice) {
          sliceVoxelCount += 1;
        }
        voxels.push({
          x: xc,
          y: yc,
          z: zc,
          dx,
          dy,
          dz,
          value: val,
          inSlice,
        });
        riemannSum += val * dV;
        if (val < valueMin) valueMin = val;
        if (val > valueMax) valueMax = val;
      }
    }
  }

  riemannSum = normalizeZero(riemannSum);

  const { referenceIntegral, domainVolume } = computeTripleReference(
    evaluate,
    regionType,
    box,
  );
  const absError = normalizeZero(Math.abs(riemannSum - referenceIntegral));
  const meanDensity =
    domainVolume > 0 ? normalizeZero(referenceIntegral / domainVolume) : null;

  const result: TripleIntegralResult = {
    voxels,
    riemannSum,
    referenceIntegral,
    absError,
    domainVolume,
    meanDensity,
    valueMin: voxels.length > 0 ? normalizeZero(valueMin) : null,
    valueMax: voxels.length > 0 ? normalizeZero(valueMax) : null,
  };

  if (hasValidSlice && sliceZ !== undefined) {
    const { area, sliceIntegral } = computeSliceQuadrature(
      evaluate,
      regionType,
      box,
      sliceZ,
    );
    result.sliceInfo = {
      z: normalizeZero(sliceZ),
      area,
      sliceIntegral,
      voxelCount: sliceVoxelCount,
    };
  }

  return result;
}
