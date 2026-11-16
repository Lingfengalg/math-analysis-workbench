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
  'x-type',
  'y-type',
]);
export type IntegralRegionType = z.infer<typeof integralRegionTypeSchema>;

export const INTEGRAL_REGION_LABELS: Record<IntegralRegionType, string> = {
  rectangle: '矩形域 [a,b]×[c,d]',
  disk: '圆域（极坐标变换）',
  triangle: '三角形域（直线定限）',
  'x-type': 'X-型曲边域 φ₁(x)≤y≤φ₂(x)',
  'y-type': 'Y-型曲边域 ψ₁(y)≤x≤ψ₂(y)',
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
    yLowerExpr: z.string().trim().min(1).max(120).optional(),
    yUpperExpr: z.string().trim().min(1).max(120).optional(),
    xLowerExpr: z.string().trim().min(1).max(120).optional(),
    xUpperExpr: z.string().trim().min(1).max(120).optional(),
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
  boundaryCurveA?: PlotPoint[];
  boundaryCurveB?: PlotPoint[];
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

/* --- 3D Triple Integral Spatial Voxel & Cross-Section Contracts --- */

export const tripleRegionTypeSchema = z.enum([
  'box',
  'sphere',
  'cylinder',
  'tetrahedron',
  'paraboloid-cap',
]);
export type TripleRegionType = z.infer<typeof tripleRegionTypeSchema>;

export const TRIPLE_REGION_LABELS: Record<TripleRegionType, string> = {
  box: '长方体域 [x₀,x₁]×[y₀,y₁]×[z₀,z₁]',
  sphere: '球体域（球面坐标 ρ²sinφ）',
  cylinder: '圆柱体域（柱面坐标 r dr dθ dz）',
  tetrahedron: '四面体域（直角坐标三重累次）',
  'paraboloid-cap': '抛物面顶盖域（先二后一截面法）',
};

export const tripleIntegralRequestSchema = z
  .object({
    expression: z
      .string()
      .trim()
      .min(1, '请输入三元被积函数 f(x, y, z)')
      .max(160, '表达式最多 160 个字符'),
    regionType: tripleRegionTypeSchema,
    xMin: z.number().finite().min(-100).max(100),
    xMax: z.number().finite().min(-100).max(100),
    yMin: z.number().finite().min(-100).max(100),
    yMax: z.number().finite().min(-100).max(100),
    zMin: z.number().finite().min(-100).max(100),
    zMax: z.number().finite().min(-100).max(100),
    partitions: z.number().int().min(4).max(22).default(12),
    sliceZ: z.number().finite().min(-100).max(100).optional(),
    sourceKnowledgeId: z.string().max(100).optional(),
    sourceMistakeId: z.string().max(100).optional(),
  })
  .refine((v) => v.xMin < v.xMax, {
    message: 'x 下限必须小于上限',
    path: ['xMax'],
  })
  .refine((v) => v.yMin < v.yMax, {
    message: 'y 下限必须小于上限',
    path: ['yMax'],
  })
  .refine((v) => v.zMin < v.zMax, {
    message: 'z 下限必须小于上限',
    path: ['zMax'],
  });
export type TripleIntegralRequest = z.infer<typeof tripleIntegralRequestSchema>;

export interface TripleVoxel {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  value: number;
  inSlice: boolean;
}

export interface TripleIntegralResult {
  voxels: TripleVoxel[];
  riemannSum: number;
  referenceIntegral: number;
  absError: number;
  domainVolume: number;
  meanDensity: number | null;
  valueMin: number | null;
  valueMax: number | null;
  sliceInfo?: {
    z: number;
    area: number;
    sliceIntegral: number;
    voxelCount: number;
  };
}

export type PlotWorkerRequest =
  | { kind?: '1d'; requestId?: number; request: PlotRequest }
  | { kind: '3d'; requestId?: number; request: SurfacePlotRequest }
  | { kind: '3d-triple'; requestId?: number; request: TripleIntegralRequest };

export type PlotWorkerResponse =
  | { kind?: '1d'; requestId?: number; ok: true; data: PlotResult }
  | { kind: '3d'; requestId?: number; ok: true; data: SurfacePlotResult }
  | {
      kind: '3d-triple';
      requestId?: number;
      ok: true;
      data: TripleIntegralResult;
    }
  | {
      kind?: '1d' | '3d' | '3d-triple';
      requestId?: number;
      ok: false;
      error: string;
    };

/* --- Knowledge Graph Contracts --- */

export const knowledgeExampleSchema = z.object({
  kind: z.enum(['example', 'counterexample']).optional(),
  explanation: z.string().min(1),
  plot: plotRequestSchema.optional(),
  surfacePlot: surfacePlotRequestSchema.optional(),
  triplePlot: tripleIntegralRequestSchema.optional(),
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
  defaultTriplePlot: tripleIntegralRequestSchema.optional(),
});
export type Preferences = z.infer<typeof preferencesSchema>;

/* --- Mistakes Notebook Contracts --- */

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
  counterexampleTriplePlot: tripleIntegralRequestSchema.optional(),
  createdAt: z.string().min(1).max(40),
  updatedAt: z.string().min(1).max(40),
});
export type MistakeItem = z.infer<typeof mistakeItemSchema>;

export const mistakesStoreSchema = z.object({
  items: z.array(mistakeItemSchema).max(500),
});
export type MistakesStore = z.infer<typeof mistakesStoreSchema>;

/* --- Socratic AI Tutor Contracts (Server-Proxied, Zero Client Keys) --- */

export const assistantRoleSchema = z.enum(['user', 'assistant']);
export type AssistantRole = z.infer<typeof assistantRoleSchema>;

export const assistantContextSchema = z.object({
  kind: z.enum(['knowledge', 'mistake', 'plotting']),
  id: z.string().max(100).optional(),
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(800),
  formula: z.string().trim().max(300).optional(),
});
export type AssistantContext = z.infer<typeof assistantContextSchema>;

export const assistantMessageSchema = z.object({
  id: z.string().min(1).max(80),
  role: assistantRoleSchema,
  content: z.string().min(1).max(8000),
  createdAt: z.string().min(1).max(40),
  model: z.string().max(100).optional(),
});
export type AssistantMessage = z.infer<typeof assistantMessageSchema>;

export const assistantChatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: assistantRoleSchema,
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .min(1)
    .max(24),
  context: assistantContextSchema.optional(),
});
export type AssistantChatRequest = z.infer<typeof assistantChatRequestSchema>;

export const assistantHealthSchema = z.object({
  configured: z.boolean(),
  provider: z.string(),
  model: z.string(),
  privacyNotice: z.string(),
});
export type AssistantHealth = z.infer<typeof assistantHealthSchema>;

export const assistantChatResponseSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    reply: z.string().min(1),
    model: z.string(),
  }),
  z.object({
    ok: z.literal(false),
    code: z.string(),
    error: z.string(),
  }),
]);
export type AssistantChatResponse = z.infer<typeof assistantChatResponseSchema>;

export const assistantSessionSchema = z.object({
  messages: z.array(assistantMessageSchema).max(60),
  attachedContext: assistantContextSchema.optional(),
});
export type AssistantSession = z.infer<typeof assistantSessionSchema>;
