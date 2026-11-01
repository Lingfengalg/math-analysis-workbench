import { describe, expect, it } from 'vitest';
import { knowledgeCards } from '@/content/knowledge';
import type { KnowledgeCard } from '@/shared/contracts';
import {
  knowledgeSearchText,
  matchesKnowledgeQuery,
  tokenizeKnowledgeQuery,
} from './search';

const byId = (id: string) => {
  const card = knowledgeCards.find((item) => item.id === id);
  if (!card) throw new Error(`missing card ${id}`);
  return card;
};

const derivative = byId('derivative-absolute');
const continuity = byId('continuity-reciprocal');
const limit = byId('limit-square');

describe('知识搜索字段覆盖', () => {
  it('标题与定义可命中', () => {
    expect(matchesKnowledgeQuery(derivative, '逆命题')).toBe(true);
    expect(matchesKnowledgeQuery(derivative, '差商的极限')).toBe(true);
  });

  it('适用条件可命中', () => {
    expect(matchesKnowledgeQuery(continuity, '区间端点')).toBe(true);
    expect(matchesKnowledgeQuery(derivative, '左右极限存在')).toBe(true);
  });

  it('例题说明可命中', () => {
    // 「左导数」只出现在可导卡的例题里
    expect(matchesKnowledgeQuery(derivative, '左导数')).toBe(true);
    expect(matchesKnowledgeQuery(continuity, '左导数')).toBe(false);
  });

  it('常见误区可命中', () => {
    // 「倒过来」只出现在可导卡的误区里
    expect(matchesKnowledgeQuery(derivative, '倒过来')).toBe(true);
    expect(matchesKnowledgeQuery(limit, '倒过来')).toBe(false);
  });

  it('参考说明可命中', () => {
    expect(matchesKnowledgeQuery(continuity, '教材')).toBe(true);
    expect(matchesKnowledgeQuery(limit, 'ε-δ')).toBe(true);
  });

  it('公式源码不参与搜索', () => {
    // formula 里的 LaTeX 片段不应命中
    expect(matchesKnowledgeQuery(limit, '\\lim_{x\\to a}')).toBe(false);
    expect(knowledgeSearchText(limit)).not.toContain('\\lim');
  });
});

describe('知识搜索输入处理', () => {
  it('空白与仅空格输入视为不过滤', () => {
    expect(tokenizeKnowledgeQuery('')).toEqual([]);
    expect(tokenizeKnowledgeQuery('   ')).toEqual([]);
    expect(tokenizeKnowledgeQuery('\n\t')).toEqual([]);
    expect(matchesKnowledgeQuery(derivative, '   ')).toBe(true);
  });

  it('大小写不敏感并压缩空白', () => {
    const card: KnowledgeCard = {
      ...derivative,
      definition: 'Limit of the difference quotient exists.',
    };
    expect(matchesKnowledgeQuery(card, 'LIMIT')).toBe(true);
    expect(matchesKnowledgeQuery(card, '  difference   quotient  ')).toBe(true);
  });

  it('多个关键词需要全部命中', () => {
    expect(matchesKnowledgeQuery(limit, '极限 采样')).toBe(true);
    expect(matchesKnowledgeQuery(limit, '极限 倒过来')).toBe(false);
  });
});
