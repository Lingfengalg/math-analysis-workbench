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
