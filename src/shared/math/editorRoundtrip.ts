import { z } from 'zod';
import { parseValidatedExpression } from './sample';
import type { MathNode } from 'mathjs';

/** 不把括号显示差异当作结构差异；不执行表达式或通过采样猜测等价。 */
function structure(node: MathNode): unknown {
  if (node.type === 'ParenthesisNode')
    return structure((node as unknown as { content: MathNode }).content);
  if (node.type === 'OperatorNode') {
    const op = node as unknown as {
      op: string;
      args: MathNode[];
      implicit?: boolean;
    };
    if (op.implicit)
      throw new Error('隐式乘法暂不支持载入，请先改用 * 明确相乘。');
    return ['op', op.op, ...op.args.map(structure)];
  }
  if (node.type === 'FunctionNode') {
    const fn = node as unknown as { fn: MathNode; args: MathNode[] };
    return ['fn', String(fn.fn), ...fn.args.map(structure)];
  }
  if (node.type === 'SymbolNode') return ['symbol', String(node)];
  if (node.type === 'ConstantNode')
    return ['constant', (node as unknown as { value: number }).value];
  throw new Error('表达式包含暂不支持载入的结构。');
}

const requestSchema = z.object({
  original: z.string().trim().min(1).max(160),
  converted: z.string().trim().min(1).max(160),
  variable: z.enum(['x', 'n']),
});

/** 严格比较两棵白名单 AST；不同结构即使偶然数值相同也拒绝。 */
export function verifyEditorRoundtrip(input: unknown): void {
  const result = requestSchema.safeParse(input);
  if (!result.success) throw new Error('表达式为空或超出长度限制。');
  const { original, converted, variable } = result.data;
  const a = structure(parseValidatedExpression(original, variable));
  const b = structure(parseValidatedExpression(converted, variable));
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error('转换后数学结构发生变化，未载入原输入。');
}
