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
});
