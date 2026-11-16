import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { knowledgeCards } from './index';
import {
  KNOWLEDGE_TOPIC_LABELS,
  knowledgeCardSchema,
  type KnowledgeTopic,
} from '@/shared/contracts';
import { compileExpression } from '@/shared/math/sample';

const EXPECTED_CARD_IDS = [
  'sequence-monotone-bounded',
  'sequence-squeeze',
  'limit-square',
  'limit-infinitesimal-equiv',
  'continuity-reciprocal',
  'continuity-discontinuity-types',
  'derivative-absolute',
  'derivative-mean-value',
  'derivative-lhopital',
  'derivative-taylor',
  'integral-newton-leibniz',
  'integral-improper-p',
];

describe('知识内容契约', () => {
  it('包含完整的 12 张核心知识卡片且覆盖全部 5 大数分板块，id 唯一且符合 schema', () => {
    expect(knowledgeCards).toHaveLength(12);
    const ids = knowledgeCards.map((card) => card.id);
    expect(new Set(ids).size).toBe(knowledgeCards.length);
    expect(ids).toEqual(EXPECTED_CARD_IDS);

    const topics = new Set(knowledgeCards.map((card) => card.topic));
    for (const topic of Object.keys(
      KNOWLEDGE_TOPIC_LABELS,
    ) as KnowledgeTopic[]) {
      expect(topics.has(topic)).toBe(true);
    }

    for (const card of knowledgeCards) {
      expect(knowledgeCardSchema.safeParse(card).success).toBe(true);
    }
  });

  it('所有 relatedIds 均指向有效知识卡片且不自指', () => {
    const idSet = new Set(knowledgeCards.map((card) => card.id));
    for (const card of knowledgeCards) {
      expect(card.relatedIds.length).toBeGreaterThanOrEqual(2);
      expect(new Set(card.relatedIds).size).toBe(card.relatedIds.length);
      for (const relatedId of card.relatedIds) {
        expect(relatedId).not.toBe(card.id);
        expect(idSet.has(relatedId)).toBe(true);
      }
    }
  });

  it('示例绘图表达式与对比表达式均符合受限白名单', () => {
    for (const card of knowledgeCards) {
      for (const example of card.examples) {
        if (example.plot) {
          expect(() =>
            compileExpression(example.plot!.expression),
          ).not.toThrow();
          if (example.plot.compareExpression) {
            expect(() =>
              compileExpression(example.plot!.compareExpression!),
            ).not.toThrow();
          }
          expect(example.plot.sourceKnowledgeId).toBe(card.id);
        }
      }
    }
  });

  it('全部 12 张卡片的 LaTeX 公式在 KaTeX strict: error 模式下零报错渲染', () => {
    for (const card of knowledgeCards) {
      expect(() =>
        katex.renderToString(card.formula, {
          throwOnError: true,
          trust: false,
          strict: 'error',
          maxExpand: 100,
          maxSize: 10,
        }),
      ).not.toThrow();
    }
  });
});
