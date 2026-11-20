import { describe, expect, it } from 'vitest';
import { knowledgeCards } from './index';
import { knowledgeCardSchema } from '@/shared/contracts';
import { compileExpression } from '@/shared/math/sample';

describe('知识内容契约', () => {
  it('卡片 id 唯一，内容符合结构约定', () => {
    expect(new Set(knowledgeCards.map((card) => card.id)).size).toBe(
      knowledgeCards.length,
    );
    knowledgeCards.forEach((card) =>
      expect(knowledgeCardSchema.safeParse(card).success).toBe(true),
    );
  });
  it('示例绘图表达式符合白名单', () => {
    for (const card of knowledgeCards)
      for (const example of card.examples)
        if (example.plot)
          expect(() =>
            compileExpression(example.plot!.expression),
          ).not.toThrow();
  });
  it('连续性卡片区分定义域聚点与孤立点', () => {
    const card = knowledgeCards.find(
      (item) => item.id === 'continuity-reciprocal',
    );
    expect(card).toBeDefined();
    expect(card!.definition).toContain('定义域内');
    expect(card!.conditions.join(' ')).toContain('定义域的聚点');
    expect(card!.conditions.join(' ')).toContain('孤立点');
    expect(
      card!.examples.some((example) => example.explanation.includes('孤立点')),
    ).toBe(true);
  });
});

describe('知识卡片互链（#66）', () => {
  const baseCard = {
    id: 'limit-square',
    topic: 'limit' as const,
    title: '标题',
    definition: '定义',
    formula: 'x',
    conditions: ['条件'],
    examples: [{ explanation: '例子' }],
    pitfalls: ['误区'],
    references: ['参考'],
  };

  it('related 只指向存在的卡片，且不自指、不超过 5 个', () => {
    const ids = new Set(knowledgeCards.map((card) => card.id));
    for (const card of knowledgeCards) {
      for (const target of card.related ?? []) {
        expect(ids.has(target)).toBe(true);
        expect(target).not.toBe(card.id);
      }
      expect((card.related ?? []).length).toBeLessThanOrEqual(5);
    }
  });

  it('旧数据缺少 related 字段仍可解析', () => {
    const parsed = knowledgeCardSchema.safeParse(baseCard);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.related).toBeUndefined();
  });

  it('拒绝非法 id 格式与超过 5 个的互链', () => {
    expect(
      knowledgeCardSchema.safeParse({ ...baseCard, related: ['Bad_Id'] })
        .success,
    ).toBe(false);
    expect(
      knowledgeCardSchema.safeParse({
        ...baseCard,
        related: ['a', 'b', 'c', 'd', 'e', 'f'],
      }).success,
    ).toBe(false);
  });
});
