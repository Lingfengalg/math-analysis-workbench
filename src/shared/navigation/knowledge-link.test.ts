import { describe, expect, it } from 'vitest';
import {
  createKnowledgeTopicLink,
  createMistakeTopicLink,
} from './knowledge-link';

describe('知识主题链接', () => {
  it.each(['limit', 'continuity', 'derivative'] as const)(
    '对已有主题 %s 生成筛选链接',
    (topic) => {
      expect(createKnowledgeTopicLink(topic)).toBe(`/knowledge?topic=${topic}`);
    },
  );
  it.each(['other', '', 'limit&query=private', null, undefined, 42])(
    '不为无对应知识页或无效主题 %s 生成链接',
    (topic) => {
      expect(createKnowledgeTopicLink(topic)).toBeNull();
    },
  );
});

describe('错题主题链接', () => {
  it.each(['limit', 'continuity', 'derivative'] as const)(
    '只传递主题 %s',
    (topic) => {
      expect(createMistakeTopicLink(topic)).toBe(`/mistakes?topic=${topic}`);
    },
  );
});
