import { z } from 'zod';
import { createStorage } from '@/shared/storage';
import { reviewScheduleSchema } from './schedule';

/** 知识主题与知识导航保持同一套英文标识，另加“其他”兜底。 */
export const MISTAKE_TOPICS = [
  'limit',
  'continuity',
  'derivative',
  'other',
] as const;

export type MistakeTopic = (typeof MISTAKE_TOPICS)[number];

export const topicLabels: Record<MistakeTopic, string> = {
  limit: '极限',
  continuity: '连续',
  derivative: '导数',
  other: '其他',
};

/** 错因归类：可选字段，旧数据缺省按「未分类」展示。 */
export const MISTAKE_CAUSES = [
  'concept',
  'calculation',
  'reading',
  'other',
] as const;

export type MistakeCause = (typeof MISTAKE_CAUSES)[number];

export const causeLabels: Record<MistakeCause, string> = {
  concept: '概念不清',
  calculation: '计算错误',
  reading: '审题失误',
  other: '其他',
};

export const MISTAKE_LIMITS = {
  title: 120,
  problem: 2000,
  mistakeReason: 1000,
  correction: 4000,
  items: 200,
} as const;

// JavaScript Date 的可表示范围；防止损坏备份导致日期格式化异常。
const timestamp = z.number().int().nonnegative().max(8_640_000_000_000_000);

/** 单条错题。时间使用 epoch 毫秒，避免时区字符串带来的解析歧义。 */
export const mistakeSchema = z.object({
  id: z.string().min(1),
  title: z
    .string()
    .trim()
    .min(1, '请输入题目')
    .max(MISTAKE_LIMITS.title, `题目最多 ${MISTAKE_LIMITS.title} 个字符`),
  topic: z.enum(MISTAKE_TOPICS),
  /** 错因归类；旧数据没有该字段时保持 undefined（未分类）。 */
  cause: z.enum(MISTAKE_CAUSES).optional(),
  /** 手动关联的知识卡片 id（最多 5 个）；旧数据缺省表示未关联。 */
  knowledgeIds: z
    .array(z.string().trim().min(1).max(64))
    .max(5, '最多关联 5 张知识卡片')
    .optional(),
  problem: z
    .string()
    .trim()
    .max(
      MISTAKE_LIMITS.problem,
      `题目内容最多 ${MISTAKE_LIMITS.problem} 个字符`,
    ),
  mistakeReason: z
    .string()
    .trim()
    .max(
      MISTAKE_LIMITS.mistakeReason,
      `错误原因最多 ${MISTAKE_LIMITS.mistakeReason} 个字符`,
    ),
  correction: z
    .string()
    .trim()
    .max(
      MISTAKE_LIMITS.correction,
      `订正最多 ${MISTAKE_LIMITS.correction} 个字符`,
    ),
  createdAt: timestamp,
  updatedAt: timestamp,
  /** 最近一次复习时间；null 表示未复习。旧数据缺少该字段时按未复习处理。 */
  reviewedAt: timestamp.nullable().default(null),
  schedule: reviewScheduleSchema.optional(),
});

export type Mistake = z.infer<typeof mistakeSchema>;

/** 表单只负责可编辑字段，id 与时间由模块内部生成。 */
export const mistakeDraftSchema = mistakeSchema.pick({
  title: true,
  topic: true,
  cause: true,
  knowledgeIds: true,
  problem: true,
  mistakeReason: true,
  correction: true,
});

export type MistakeDraft = z.infer<typeof mistakeDraftSchema>;

export const mistakeListSchema = z
  .object({
    items: z
      .array(mistakeSchema)
      .max(MISTAKE_LIMITS.items, `本地最多保存 ${MISTAKE_LIMITS.items} 条错题`),
  })
  .refine(
    (data) =>
      new Set(data.items.map((item) => item.id)).size === data.items.length,
    { message: '错题 ID 不可重复。' },
  );

export type MistakeList = z.infer<typeof mistakeListSchema>;

export const EMPTY_MISTAKES: MistakeList = { items: [] };

/** 跨标签页 storage 事件按这个键筛选，需与 createStorage 的键前缀拼接结果一致。 */
export const MISTAKE_STORAGE_KEY = 'math-workbench:mistakes';

export const mistakeStorage = createStorage('mistakes', mistakeListSchema, {
  version: 2,
  readVersions: [1, 2],
});

function createMistakeId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createMistake(
  draft: MistakeDraft,
  now: number = Date.now(),
): Mistake {
  return {
    ...draft,
    id: createMistakeId(),
    createdAt: now,
    updatedAt: now,
    reviewedAt: null,
  };
}

export function updateMistake(
  item: Mistake,
  draft: MistakeDraft,
  now: number = Date.now(),
): Mistake {
  return { ...item, ...draft, updatedAt: now };
}

/** 最近更新的排前面；同一时刻按创建时间稳定排序，避免列表跳动。 */
export function sortMistakes(items: readonly Mistake[]): Mistake[] {
  return [...items].sort(
    (left, right) =>
      right.updatedAt - left.updatedAt || left.createdAt - right.createdAt,
  );
}

/** 标记或取消复习。复习会更新 updatedAt，但不改 createdAt。 */
export function markReviewed(
  item: Mistake,
  reviewed: boolean,
  now: number = Date.now(),
): Mistake {
  return { ...item, reviewedAt: reviewed ? now : null, updatedAt: now };
}

export function formatMistakeTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
