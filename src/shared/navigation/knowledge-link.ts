import { knowledgeCardSchema } from '@/shared/contracts';

/** 只传递已知主题，不能把错题正文等本地数据放入 URL。 */
export function createKnowledgeTopicLink(topic: unknown): string | null {
  const parsed = knowledgeCardSchema.shape.topic.safeParse(topic);
  if (!parsed.success) return null;
  const search = new URLSearchParams({ topic: parsed.data });
  return `/knowledge?${search.toString()}`;
}
