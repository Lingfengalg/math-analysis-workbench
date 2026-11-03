import { z } from 'zod';

export const plotRequestSchema = z
  .object({
    expression: z
      .string()
      .trim()
      .min(1, '请输入函数表达式')
      .max(160, '表达式最多 160 个字符'),
    xMin: z.number().finite().min(-10000).max(10000),
    xMax: z.number().finite().min(-10000).max(10000),
    sourceKnowledgeId: z.string().max(100).optional(),
  })
  .refine((value) => value.xMin < value.xMax, {
    message: '左端点必须小于右端点',
    path: ['xMax'],
  });

export type PlotRequest = z.infer<typeof plotRequestSchema>;
export type PlotPoint = [number, number | null];
/** 水平渐近趋势候选：数值启发式结果，可能漏检或误判，不构成极限证明。 */
export interface HorizontalAsymptoteCandidate {
  side: 'left' | 'right';
  /** 候选水平线 y 值（尾部后半段均值，数值近似，不等于极限值）。 */
  y: number;
  /** 虚线绘制范围（该尾部的 x 跨度）。 */
  xFrom: number;
  xTo: number;
}
export interface PlotResult {
  points: PlotPoint[];
  gaps: number;
  /** 仅函数模式产生；数列模式不检测渐近趋势。 */
  asymptotes?: HorizontalAsymptoteCandidate[];
}
export type PlotWorkerResponse =
  { ok: true; data: PlotResult } | { ok: false; error: string };

export const knowledgeCardSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  topic: z.enum(['limit', 'continuity', 'derivative']),
  title: z.string().min(1),
  definition: z.string().min(1),
  formula: z.string().min(1),
  conditions: z.array(z.string()).min(1),
  examples: z
    .array(
      z.object({ explanation: z.string(), plot: plotRequestSchema.optional() }),
    )
    .min(1),
  pitfalls: z.array(z.string()).min(1),
  references: z.array(z.string()).min(1),
});
export type KnowledgeCard = z.infer<typeof knowledgeCardSchema>;

export const preferencesSchema = z.object({
  defaultPlot: plotRequestSchema,
});
export type Preferences = z.infer<typeof preferencesSchema>;
