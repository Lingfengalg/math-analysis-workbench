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
export interface PlotResult {
  points: PlotPoint[];
  gaps: number;
}

/** 数列绘图请求：通项表达式写作 a_n（变量用 n 表示项序号），计算前 terms 项。 */
export const sequenceRequestSchema = z.object({
  expression: z
    .string()
    .trim()
    .min(1, '请输入通项表达式')
    .max(160, '表达式最多 160 个字符'),
  terms: z
    .number()
    .int('项数须为整数')
    .min(2, '项数至少为 2')
    .max(1000, '项数最多为 1000'),
});

export type SequenceRequest = z.infer<typeof sequenceRequestSchema>;

/** Worker 协议：按 kind 区分函数采样与数列采样，响应格式相同。 */
export type PlotWorkerMessage =
  | { kind: 'function'; request: PlotRequest }
  | { kind: 'sequence'; request: SequenceRequest };

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
