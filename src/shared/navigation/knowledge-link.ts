import { z } from 'zod';
import { knowledgeTopicSchema, type KnowledgeTopic } from '@/shared/contracts';

const cardIdSchema = z.string().regex(/^[a-z][a-z0-9-]*$/);

export interface KnowledgeLinkQuery {
  topic?: KnowledgeTopic;
  cardId?: string;
}

export function createKnowledgeLink(query: KnowledgeLinkQuery = {}): string {
  const search = new URLSearchParams();
  if (query.topic) {
    search.set('topic', knowledgeTopicSchema.parse(query.topic));
  }
  if (query.cardId) {
    search.set('card', cardIdSchema.parse(query.cardId));
  }
  const serialized = search.toString();
  return serialized ? `/knowledge?${serialized}` : '/knowledge';
}

export function parseKnowledgeSearch(search: URLSearchParams): {
  topic: KnowledgeTopic | 'all';
  cardId?: string;
} {
  const rawTopic = search.get('topic');
  const topicResult = knowledgeTopicSchema.safeParse(rawTopic);
  const rawCard = search.get('card');
  const cardResult = cardIdSchema.safeParse(rawCard);
  return {
    topic: topicResult.success ? topicResult.data : 'all',
    cardId: cardResult.success ? cardResult.data : undefined,
  };
}
