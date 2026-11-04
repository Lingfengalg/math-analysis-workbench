import { derivative, type MathNode } from 'mathjs';
import type { TangentResult } from '@/shared/contracts';
import {
  compileNode,
  parseValidatedExpression,
  validateMathNode,
} from './sample';

/**
 * 计算 f(x0) 与 f'(x0)：先按白名单解析原表达式，再用 mathjs 符号求导，
 * 导函数节点仍须通过同一白名单校验。斜率是符号导数在一点的数值，
 * 不构成极限证明；不可导或超出支持范围时给出明确错误而非静默失败。
 */
export function calculateTangent(
  expression: string,
  x0: number,
): TangentResult {
  if (!Number.isFinite(x0)) throw new Error('切点横坐标须为有限实数。');
  const root = parseValidatedExpression(expression);
  const evaluate = compileNode(root);
  const value = evaluate(x0);
  if (value === null)
    throw new Error(
      `函数在 x₀ = ${String(x0)} 处没有可显示的有限值，无法画切线。`,
    );
  let slopeNode: MathNode;
  try {
    slopeNode = derivative(root, 'x');
  } catch {
    throw new Error('无法对该表达式符号求导，切线不可用。');
  }
  let slope: number | null;
  try {
    validateMathNode(slopeNode);
    slope = compileNode(slopeNode)(x0);
  } catch (error) {
    throw new Error(
      `切线无法显示：${error instanceof Error ? error.message : '导函数超出支持范围。'}`,
      { cause: error },
    );
  }
  if (slope === null)
    throw new Error(`函数在 x₀ = ${String(x0)} 处不可导，或导数值无法计算。`);
  return { slope, value };
}
