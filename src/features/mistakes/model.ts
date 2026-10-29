import { z } from 'zod';
import { createStorage } from '@/shared/storage';

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

export const MISTAKE_LIMITS = {
  title: 120,
  problem: 2000,
  mistakeReason: 1000,
  correction: 4000,
  items: 200,
} as const;

/** 单条错题。时间使用 epoch 毫秒，避免时区字符串带来的解析歧义。 */
export const mistakeSchema = z.object({
  id: z.string().min(1),
  title: z
    .string()
    .trim()
    .min(1, '请输入题目')
    .max(MISTAKE_LIMITS.title, `题目最多 ${MISTAKE_LIMITS.title} 个字符`),
  topic: z.enum(MISTAKE_TOPICS),
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
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type Mistake = z.infer<typeof mistakeSchema>;

/** 表单只负责可编辑字段，id 与时间由模块内部生成。 */
export const mistakeDraftSchema = mistakeSchema.pick({
  title: true,
  topic: true,
  problem: true,
  mistakeReason: true,
  correction: true,
});

export type MistakeDraft = z.infer<typeof mistakeDraftSchema>;

export const mistakeListSchema = z.object({
  items: z
    .array(mistakeSchema)
    .max(MISTAKE_LIMITS.items, `本地最多保存 ${MISTAKE_LIMITS.items} 条错题`),
});

export type MistakeList = z.infer<typeof mistakeListSchema>;

export const EMPTY_MISTAKES: MistakeList = { items: [] };

export const mistakeStorage = createStorage('mistakes', mistakeListSchema);

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
  return { ...draft, id: createMistakeId(), createdAt: now, updatedAt: now };
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
