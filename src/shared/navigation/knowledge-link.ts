import { knowledgeCardSchema, type KnowledgeCard } from '@/shared/contracts';

/** 只传递已知主题，不能把错题正文等本地数据放入 URL。 */
export function createKnowledgeTopicLink(topic: unknown): string | null {
  const parsed = knowledgeCardSchema.shape.topic.safeParse(topic);
  if (!parsed.success) return null;
  const search = new URLSearchParams({ topic: parsed.data });
  return `/knowledge?${search.toString()}`;
}

/** 仅携带知识主题，不在 URL 中携带用户错题或笔记。 */
export function createMistakeTopicLink(topic: KnowledgeCard['topic']): string {
  const search = new URLSearchParams({ topic });
  return `/mistakes?${search.toString()}`;
}

/** 只携带知识卡片 id（如 `limit-square`），用于从错题定位到具体卡片。 */
export function createKnowledgeCardLink(cardId: string): string {
  const search = new URLSearchParams({ focus: cardId });
  return `/knowledge?${search.toString()}`;
}
