import { derivative, type MathNode } from 'mathjs';
import {
  plotRequestSchema,
  type PlotPoint,
  type PlotRequest,
  type TaylorResult,
} from '@/shared/contracts';
import {
  compileNode,
  parseValidatedExpression,
  validateMathNode,
} from './sample';

export const TAYLOR_MAX_ORDER = 8;

function factorial(n: number): number {
  let product = 1;
  for (let k = 2; k <= n; k += 1) product *= k;
  return product;
}

/**
 * 反复符号求导得到各阶系数 c_k = f⁽ᵏ⁾(a) / k!，再按与主曲线相同的采样
 * 规则计算 T_n(x) 在观察区间上的图像点。每一步导函数仍须通过白名单校验，
 * 任一步求导或求值失败时给出明确错误并停止。系数是符号求导在一点的数值，
 * 泰勒多项式仅在收敛区间内近似原函数，图像不等于证明。
 */
export function calculateTaylorPolynomial(
  request: PlotRequest,
  center: number,
  order: number,
  samples = 801,
): TaylorResult {
  if (!Number.isInteger(order) || order < 1 || order > TAYLOR_MAX_ORDER)
    throw new Error('泰勒多项式阶数须为 1–8 之间的整数。');
  if (!Number.isFinite(center)) throw new Error('展开中心须为有限实数。');
  const valid = plotRequestSchema.safeParse(request);
  if (!valid.success) throw new Error(valid.error.issues[0].message);
  const { expression, xMin, xMax } = valid.data;
  const root = parseValidatedExpression(expression);
  let node: MathNode = root;
  const coefficients: number[] = [];
  for (let k = 0; k <= order; k += 1) {
    if (k > 0) {
      try {
        node = derivative(node, 'x');
      } catch (error) {
        throw new Error(`无法计算第 ${k} 阶导数，泰勒多项式不可用。`, {
          cause: error,
        });
      }
      try {
        validateMathNode(node);
      } catch (error) {
        throw new Error(
          `第 ${k} 阶导数超出支持范围：${error instanceof Error ? error.message : '未知原因'}。`,
          { cause: error },
        );
      }
    }
    const derivativeValue = compileNode(node)(center);
    if (derivativeValue === null)
      throw new Error(`第 ${k} 阶导数在展开中心处没有可显示的有限值。`);
    coefficients.push(derivativeValue / factorial(k));
  }
  const points: PlotPoint[] = [];
  for (let i = 0; i < samples; i += 1) {
    const x = xMin + ((xMax - xMin) * i) / (samples - 1);
    let y = 0;
    let power = 1;
    for (let k = 0; k < coefficients.length; k += 1) {
      y += coefficients[k] * power;
      power *= x - center;
    }
    points.push([x, Number.isFinite(y) && Math.abs(y) <= 1e6 ? y : null]);
  }
  return { coefficients, points };
}
