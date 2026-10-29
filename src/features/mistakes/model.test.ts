import { describe, expect, it } from 'vitest';
import {
  createMistake,
  formatMistakeTime,
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
