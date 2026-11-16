import { z } from 'zod';

export const knowledgeTopicSchema = z.enum([
  'sequence',
  'limit',
  'continuity',
  'derivative',
  'integral',
]);
export type KnowledgeTopic = z.infer<typeof knowledgeTopicSchema>;

export const KNOWLEDGE_TOPIC_LABELS: Record<KnowledgeTopic, string> = {
  sequence: '数列极限',
  limit: '函数极限',
  continuity: '连续性',
  derivative: '导数与微分',
  integral: '积分学',
};

export const secantRequestSchema = z.object({
  x0: z.number().finite().min(-10000).max(10000),
  h: z
    .number()
    .finite()
    .min(-1000)
    .max(1000)
    .refine((value) => Math.abs(value) >= 1e-8, {
      message: '步长 h 不能为 0（绝对值至少 10⁻⁸）',
    }),
});
export type SecantRequest = z.infer<typeof secantRequestSchema>;

export const plotRequestSchema = z
  .object({
    expression: z
      .string()
      .trim()
      .min(1, '请输入函数表达式')
      .max(160, '表达式最多 160 个字符'),
    compareExpression: z
      .string()
      .trim()
      .min(1, '对比函数表达式不能为空')
      .max(160, '对比表达式最多 160 个字符')
      .optional(),
    xMin: z.number().finite().min(-10000).max(10000),
    xMax: z.number().finite().min(-10000).max(10000),
    yMin: z.number().finite().min(-1000000).max(1000000).optional(),
    yMax: z.number().finite().min(-1000000).max(1000000).optional(),
    secant: secantRequestSchema.optional(),
    sourceKnowledgeId: z.string().max(100).optional(),
    sourceMistakeId: z.string().max(100).optional(),
  })
  .refine((value) => value.xMin < value.xMax, {
    message: '左端点必须小于右端点',
    path: ['xMax'],
  })
  .refine(
    (value) =>
      value.yMin === undefined ||
      value.yMax === undefined ||
      value.yMin < value.yMax,
    {
      message: '纵轴下界必须小于纵轴上界',
      path: ['yMax'],
    },
  );

export type PlotRequest = z.infer<typeof plotRequestSchema>;
export type PlotPoint = [number, number | null];

export interface SecantLineResult {
  points: PlotPoint[];
  x0: number;
  y0: number | null;
  x1: number;
  y1: number | null;
  slope: number | null;
  leftSlope: number | null;
  rightSlope: number | null;
}

export interface PlotResult {
  points: PlotPoint[];
  gaps: number;
  comparePoints?: PlotPoint[];
  secantLine?: SecantLineResult;
}

export interface PlotWorkerRequest {
  requestId?: number;
  request: PlotRequest;
}

export type PlotWorkerResponse =
  | { requestId?: number; ok: true; data: PlotResult }
  | { requestId?: number; ok: false; error: string };

export const knowledgeExampleSchema = z.object({
  kind: z.enum(['example', 'counterexample']).optional(),
  explanation: z.string().min(1),
  plot: plotRequestSchema.optional(),
});
export type KnowledgeExample = z.infer<typeof knowledgeExampleSchema>;

export const knowledgeCardSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  topic: knowledgeTopicSchema,
  title: z.string().min(1),
  definition: z.string().min(1),
  formula: z.string().min(1),
  conditions: z.array(z.string()).min(1),
  examples: z.array(knowledgeExampleSchema).min(1),
  pitfalls: z.array(z.string()).min(1),
  references: z.array(z.string()).min(1),
  relatedIds: z.array(z.string().regex(/^[a-z][a-z0-9-]*$/)).default([]),
});
export type KnowledgeCard = z.infer<typeof knowledgeCardSchema>;

export const preferencesSchema = z.object({
  defaultPlot: plotRequestSchema,
});
export type Preferences = z.infer<typeof preferencesSchema>;

export const mistakeErrorTagSchema = z.enum([
  'domain-ignored',
  'condition-misused',
  'converse-fallacy',
  'limit-value-confused',
  'calculation-error',
  'visual-intuition-trap',
]);
export type MistakeErrorTag = z.infer<typeof mistakeErrorTagSchema>;

export const MISTAKE_ERROR_LABELS: Record<MistakeErrorTag, string> = {
  'domain-ignored': '忽略定义域/去心邻域',
  'condition-misused': '定理条件未满足强用',
  'converse-fallacy': '混淆命题与逆命题',
  'limit-value-confused': '混淆极限值与函数值',
  'calculation-error': '求导/积分/变形失误',
  'visual-intuition-trap': '仅凭局部图像臆断',
};

export const mistakeStatusSchema = z.enum([
  'unresolved',
  'reviewing',
  'mastered',
]);
export type MistakeStatus = z.infer<typeof mistakeStatusSchema>;

export const MISTAKE_STATUS_LABELS: Record<MistakeStatus, string> = {
  unresolved: '待攻克',
  reviewing: '复习中',
  mastered: '已掌握',
};

export const mistakeItemSchema = z.object({
  id: z.string().min(1).max(80),
  title: z
    .string()
    .trim()
    .min(1, '请输入错题标题')
    .max(120, '标题最多 120 个字符'),
  topic: knowledgeTopicSchema,
  errorTag: mistakeErrorTagSchema,
  status: mistakeStatusSchema,
  prompt: z
    .string()
    .trim()
    .min(1, '请输入题目或问题背景')
    .max(1000, '题目最多 1000 个字符'),
  formula: z.string().trim().max(300, '公式最多 300 个字符').optional(),
  myAttempt: z
    .string()
    .trim()
    .min(1, '请记录当时的错误思路')
    .max(1000, '错误思路最多 1000 个字符'),
  correction: z
    .string()
    .trim()
    .min(1, '请填写严谨订正与条件核查')
    .max(1500, '订正内容最多 1500 个字符'),
  relatedKnowledgeId: z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/)
    .optional(),
  counterexamplePlot: plotRequestSchema.optional(),
  createdAt: z.string().min(1).max(40),
  updatedAt: z.string().min(1).max(40),
});
export type MistakeItem = z.infer<typeof mistakeItemSchema>;

export const mistakesStoreSchema = z.object({
  items: z.array(mistakeItemSchema).max(500),
});
export type MistakesStore = z.infer<typeof mistakesStoreSchema>;
