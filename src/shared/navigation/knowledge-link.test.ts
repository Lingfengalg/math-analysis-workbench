import { describe, expect, it } from 'vitest';
import { createKnowledgeLink, parseKnowledgeSearch } from './knowledge-link';

describe('知识导航链接契约', () => {
  it('支持主题与卡片 id 往返序列化', () => {
    const link = createKnowledgeLink({
      topic: 'derivative',
      cardId: 'derivative-absolute',
    });
    expect(link).toBe('/knowledge?topic=derivative&card=derivative-absolute');
    expect(
      parseKnowledgeSearch(new URLSearchParams(link.split('?')[1])),
    ).toEqual({
      topic: 'derivative',
      cardId: 'derivative-absolute',
    });
  });

  it('非法主题与非法卡片 id 安全回退', () => {
    expect(
      parseKnowledgeSearch(new URLSearchParams('topic=invalid&card=BAD_ID!')),
    ).toEqual({
      topic: 'all',
      cardId: undefined,
    });
    expect(createKnowledgeLink()).toBe('/knowledge');
  });
});
