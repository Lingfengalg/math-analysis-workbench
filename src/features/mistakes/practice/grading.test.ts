import { describe, expect, it } from 'vitest';
import { gradePractice } from './grading';
import { practiceQuestions } from './questions';

describe('Perseus 评分适配', () => {
  const numeric = practiceQuestions.find(
    (item) => item.id === 'limit-trigonometric-half',
  )!;
  const choice = practiceQuestions.find(
    (item) => item.id === 'derivative-absolute-zero',
  )!;
  it('支持等值分数、小数，拒绝不正确结果', () => {
    expect(gradePractice(numeric, '1/2')).toBe('correct');
    expect(gradePractice(numeric, '0.5')).toBe('correct');
    expect(gradePractice(numeric, '2')).toBe('incorrect');
  });
  it('空值、零分母、表达式和过长输入不会记为错误答案', () => {
    for (const input of ['', '1/0', '2+2', 'eval(1)', '1'.repeat(41)]) {
      expect(gradePractice(numeric, input)).toBe('invalid');
    }
  });
  it('选择题由 Perseus 判断，非法选项不计分', () => {
    expect(gradePractice(choice, 'no')).toBe('correct');
    expect(gradePractice(choice, 'yes')).toBe('incorrect');
    expect(gradePractice(choice, 'unknown')).toBe('invalid');
  });
  it('题目标识唯一且每题只有一个正确选项', () => {
    expect(new Set(practiceQuestions.map((item) => item.id)).size).toBe(
      practiceQuestions.length,
    );
    for (const question of practiceQuestions) {
      if (question.kind === 'choice')
        expect(
          question.options.filter((option) => option.correct),
        ).toHaveLength(1);
    }
  });
});
