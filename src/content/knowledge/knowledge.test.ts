import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { knowledgeCards } from './index';
import {
  KNOWLEDGE_TOPIC_LABELS,
  knowledgeCardSchema,
  surfacePlotRequestSchema,
  tripleIntegralRequestSchema,
  type KnowledgeTopic,
} from '@/shared/contracts';
import { compileExpression } from '@/shared/math/sample';
import { compileSurfaceExpression } from '@/shared/math/surface';

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
  'derivative-multivariable-limit',
  'integral-newton-leibniz',
  'integral-improper-p',
  'integral-double-riemann',
  'derivative-total-differential',
  'derivative-lagrange-extrema',
  'integral-triple-space',
  'integral-green-singularity',
];

describe('知识内容契约', () => {
  it('包含完整的 18 张核心知识卡片且覆盖全部 5 大数分板块，id 唯一且符合 schema', () => {
    expect(knowledgeCards).toHaveLength(18);
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

  it('一元、三维多元曲面与三重积分空间示例绘图均符合受限白名单与契约', () => {
    let tripleCount = 0;
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
        if (example.surfacePlot) {
          expect(
            surfacePlotRequestSchema.safeParse(example.surfacePlot).success,
          ).toBe(true);
          expect(() =>
            compileSurfaceExpression(example.surfacePlot!.expression),
          ).not.toThrow();
          expect(example.surfacePlot.sourceKnowledgeId).toBe(card.id);
        }
        if (example.triplePlot) {
          tripleCount += 1;
          expect(
            tripleIntegralRequestSchema.safeParse(example.triplePlot).success,
          ).toBe(true);
          expect(example.triplePlot.sourceKnowledgeId).toBe(card.id);
        }
      }
    }
    expect(tripleCount).toBeGreaterThanOrEqual(2);
  });

  it('全部 18 张卡片的 LaTeX 公式不含中文字符且在 KaTeX strict: error 模式下零报错渲染', () => {
    for (const card of knowledgeCards) {
      expect(card.formula).not.toMatch(/[\u4e00-\u9fff]/);
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
