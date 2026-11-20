import { describe, expect, it } from 'vitest';
import {
  appendReviewLog,
  createMistake,
  formatMistakeTime,
  REVIEW_LOG_LIMIT,
  undoReviewLog,
  mistakeListSchema,
  mistakeSchema,
  sortMistakes,
  updateMistake,
} from './model';

const draft = {
  title: '1/x 在 0 处连续吗',
  topic: 'continuity' as const,
  problem: '讨论 1/x 在 x = 0 处的连续性。',
  mistakeReason: '把它当成定义域内的点。',
  correction: '0 不在定义域内，先看定义域再谈连续。',
};

describe('错题数据结构', () => {
  it('新增时生成唯一 id 与时间戳', () => {
    const first = createMistake(draft, 1000);
    const second = createMistake(draft, 1000);
    expect(first.id).not.toBe(second.id);
    expect(first.createdAt).toBe(1000);
    expect(first.updatedAt).toBe(1000);
    expect(first.topic).toBe('continuity');
  });

  it('编辑只更新内容与 updatedAt，保留创建时间', () => {
    const created = createMistake(draft, 1000);
    const updated = updateMistake(
      created,
      { ...draft, title: '修改后的题目' },
      2000,
    );
    expect(updated.id).toBe(created.id);
    expect(updated.createdAt).toBe(1000);
    expect(updated.updatedAt).toBe(2000);
    expect(updated.title).toBe('修改后的题目');
  });

  it('按最近更新倒序排列且不修改原数组', () => {
    const older = createMistake({ ...draft, title: '旧' }, 1000);
    const newer = createMistake({ ...draft, title: '新' }, 2000);
    const source = [older, newer];
    expect(sortMistakes(source).map((item) => item.title)).toEqual([
      '新',
      '旧',
    ]);
    expect(source.map((item) => item.title)).toEqual(['旧', '新']);
  });

  it('拒绝空题目、超长内容和未知主题', () => {
    expect(mistakeSchema.safeParse({ ...draft, title: '   ' }).success).toBe(
      false,
    );
    expect(
      mistakeSchema.safeParse({ ...draft, title: 'x'.repeat(121) }).success,
    ).toBe(false);
    expect(
      mistakeSchema.safeParse({ ...draft, topic: 'algebra' }).success,
    ).toBe(false);
  });

  it('列表最多接受 200 条并保留字段', () => {
    const item = createMistake(draft, 1000);
    expect(mistakeListSchema.safeParse({ items: [item] }).success).toBe(true);
    expect(
      mistakeListSchema.safeParse({
        items: Array.from({ length: 201 }, () => item),
      }).success,
    ).toBe(false);
  });

  it('时间格式化不返回空串', () => {
    expect(formatMistakeTime(1000).length).toBeGreaterThan(0);
  });
});

it('拒绝超出 JavaScript 日期范围的时间戳', () => {
  const item = createMistake(draft, 1000);
  for (const field of ['createdAt', 'updatedAt', 'reviewedAt'] as const)
    expect(
      mistakeSchema.safeParse({ ...item, [field]: 8640000000000001 }).success,
    ).toBe(false);
});

describe('错因归类字段（#68）', () => {
  it('旧数据缺少错因字段时仍可解析', () => {
    const legacy = { ...createMistake(draft, 1000) };
    delete (legacy as { cause?: string }).cause;
    const parsed = mistakeSchema.safeParse(legacy);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.cause).toBeUndefined();
  });

  it('接受合法错因并拒绝未知取值', () => {
    expect(
      mistakeSchema.safeParse({
        ...createMistake(draft, 1000),
        cause: 'concept',
      }).success,
    ).toBe(true);
    expect(
      mistakeSchema.safeParse({ ...createMistake(draft, 1000), cause: 'guess' })
        .success,
    ).toBe(false);
  });

  it('新增时保留传入的错因', () => {
    const item = createMistake({ ...draft, cause: 'calculation' }, 1000);
    expect(item.cause).toBe('calculation');
  });
});

describe('关联知识卡片字段（#70）', () => {
  it('旧数据缺少关联字段时仍可解析', () => {
    const legacy = { ...createMistake(draft, 1000) };
    delete (legacy as { knowledgeIds?: string[] }).knowledgeIds;
    expect(mistakeSchema.safeParse(legacy).success).toBe(true);
  });

  it('接受 1–5 个卡片 id，拒绝超过 5 个或空字符串', () => {
    const base = createMistake(draft, 1000);
    expect(
      mistakeSchema.safeParse({ ...base, knowledgeIds: ['limit-square'] })
        .success,
    ).toBe(true);
    expect(
      mistakeSchema.safeParse({
        ...base,
        knowledgeIds: ['a', 'b', 'c', 'd', 'e', 'f'],
      }).success,
    ).toBe(false);
    expect(
      mistakeSchema.safeParse({ ...base, knowledgeIds: [''] }).success,
    ).toBe(false);
  });
});

describe('复习记录与撤销（#83）', () => {
  const entry = (at: number) => ({
    at,
    rating: 3 as const,
    beforeReviewedAt: null,
    dueAfter: at + 1000,
  });

  it('追加记录并保留最近 REVIEW_LOG_LIMIT 条', () => {
    let item = createMistake(draft, 0);
    for (let index = 1; index <= REVIEW_LOG_LIMIT + 2; index += 1) {
      item = appendReviewLog(item, entry(index));
    }
    expect(item.reviewLog).toHaveLength(REVIEW_LOG_LIMIT);
    expect(item.reviewLog?.at(-1)?.at).toBe(REVIEW_LOG_LIMIT + 2);
  });

  it('撤销恢复评分前的计划与复习标记，并移除该条记录', () => {
    const schedule = {
      version: 1 as const,
      algorithm: 'FSRS-6' as const,
      due: 5000,
      lastReview: 1000,
      stability: 1,
      difficulty: 1,
      elapsedDays: 0,
      scheduledDays: 0,
      learningSteps: 0,
      reps: 1,
      lapses: 0,
      state: 2 as const,
      lastRating: 3 as const,
    };
    const item = appendReviewLog(
      {
        ...createMistake(draft, 0),
        schedule,
        reviewedAt: 1000,
      },
      {
        at: 2000,
        rating: 3 as const,
        beforeSchedule: undefined,
        beforeReviewedAt: null,
        dueAfter: 3000,
      },
    );
    const undone = undoReviewLog(item, 4000);
    expect(undone?.schedule).toBeUndefined();
    expect(undone?.reviewedAt).toBeNull();
    expect(undone?.reviewLog).toHaveLength(0);
    expect(undone?.updatedAt).toBe(4000);
  });

  it('没有记录时撤销返回 null', () => {
    expect(undoReviewLog(createMistake(draft, 0), 1)).toBeNull();
  });
});
