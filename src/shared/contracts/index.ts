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

/* --- 3D Multivariable Surface & Double Integral Contracts --- */

export const integralRegionTypeSchema = z.enum([
  'rectangle',
  'disk',
  'triangle',
]);
export type IntegralRegionType = z.infer<typeof integralRegionTypeSchema>;

export const INTEGRAL_REGION_LABELS: Record<IntegralRegionType, string> = {
  rectangle: '矩形域 [a,b]×[c,d]',
  disk: '圆域（极坐标变换）',
  triangle: '三角形域（累次定限）',
};

export const riemannRuleSchema = z.enum([
  'midpoint',
  'lower-left',
  'upper-right',
]);
export type RiemannRule = z.infer<typeof riemannRuleSchema>;

export const RIEMANN_RULE_LABELS: Record<RiemannRule, string> = {
  midpoint: '中点取样',
  'lower-left': '左下端点',
  'upper-right': '右上端点',
};

export const surfaceIntegralConfigSchema = z
  .object({
    regionType: integralRegionTypeSchema,
    xStart: z.number().finite().min(-1000).max(1000),
    xEnd: z.number().finite().min(-1000).max(1000),
    yStart: z.number().finite().min(-1000).max(1000),
    yEnd: z.number().finite().min(-1000).max(1000),
    partitions: z.number().int().min(4).max(36),
    rule: riemannRuleSchema,
  })
  .refine((v) => v.xStart < v.xEnd, {
    message: '积分 x 下限必须小于上限',
    path: ['xEnd'],
  })
  .refine((v) => v.yStart < v.yEnd, {
    message: '积分 y 下限必须小于上限',
    path: ['yEnd'],
  });
export type SurfaceIntegralConfig = z.infer<typeof surfaceIntegralConfigSchema>;

export const surfaceProbeSchema = z.object({
  x0: z.number().finite().min(-1000).max(1000),
  y0: z.number().finite().min(-1000).max(1000),
});
export type SurfaceProbe = z.infer<typeof surfaceProbeSchema>;

export const surfacePlotRequestSchema = z
  .object({
    expression: z
      .string()
      .trim()
      .min(1, '请输入多元函数表达式 f(x, y)')
      .max(160, '表达式最多 160 个字符'),
    xMin: z.number().finite().min(-1000).max(1000),
    xMax: z.number().finite().min(-1000).max(1000),
    yDomainMin: z.number().finite().min(-1000).max(1000),
    yDomainMax: z.number().finite().min(-1000).max(1000),
    zMin: z.number().finite().min(-1000000).max(1000000).optional(),
    zMax: z.number().finite().min(-1000000).max(1000000).optional(),
    gridSize: z.number().int().min(16).max(96).default(56),
    integral: surfaceIntegralConfigSchema.optional(),
    probe: surfaceProbeSchema.optional(),
    sourceKnowledgeId: z.string().max(100).optional(),
    sourceMistakeId: z.string().max(100).optional(),
  })
  .refine((v) => v.xMin < v.xMax, {
    message: 'x 左端点必须小于右端点',
    path: ['xMax'],
  })
  .refine((v) => v.yDomainMin < v.yDomainMax, {
    message: 'y 下界必须小于上界',
    path: ['yDomainMax'],
  })
  .refine(
    (v) => v.zMin === undefined || v.zMax === undefined || v.zMin < v.zMax,
    {
      message: 'z 轴下界必须小于上界',
      path: ['zMax'],
    },
  );
export type SurfacePlotRequest = z.infer<typeof surfacePlotRequestSchema>;

export interface RiemannPrism {
  x: number;
  y: number;
  dx: number;
  dy: number;
  z: number;
}

export interface SurfaceIntegralResult {
  prisms: RiemannPrism[];
  riemannSum: number;
  positiveVolume: number;
  negativeVolume: number;
  referenceIntegral: number;
  absError: number;
  domainArea: number;
  meanValue: number | null;
}

export interface SurfaceProbeResult {
  x0: number;
  y0: number;
  z0: number | null;
  fx: number | null;
  fy: number | null;
  gradNorm: number | null;
  sliceX: PlotPoint[];
  sliceY: PlotPoint[];
}

export interface SurfacePlotResult {
  gridX: number[];
  gridY: number[];
  zValues: Array<number | null>;
  validCount: number;
  gaps: number;
  zDataMin: number | null;
  zDataMax: number | null;
  integralResult?: SurfaceIntegralResult;
  probeResult?: SurfaceProbeResult;
}

export type PlotWorkerRequest =
  | { kind?: '1d'; requestId?: number; request: PlotRequest }
  | { kind: '3d'; requestId?: number; request: SurfacePlotRequest };

export type PlotWorkerResponse =
  | { kind?: '1d'; requestId?: number; ok: true; data: PlotResult }
  | { kind: '3d'; requestId?: number; ok: true; data: SurfacePlotResult }
  | { kind?: '1d' | '3d'; requestId?: number; ok: false; error: string };

export const knowledgeExampleSchema = z.object({
  kind: z.enum(['example', 'counterexample']).optional(),
  explanation: z.string().min(1),
  plot: plotRequestSchema.optional(),
  surfacePlot: surfacePlotRequestSchema.optional(),
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
  defaultSurfacePlot: surfacePlotRequestSchema.optional(),
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
  counterexampleSurfacePlot: surfacePlotRequestSchema.optional(),
  createdAt: z.string().min(1).max(40),
  updatedAt: z.string().min(1).max(40),
});
export type MistakeItem = z.infer<typeof mistakeItemSchema>;

export const mistakesStoreSchema = z.object({
  items: z.array(mistakeItemSchema).max(500),
});
export type MistakesStore = z.infer<typeof mistakesStoreSchema>;
