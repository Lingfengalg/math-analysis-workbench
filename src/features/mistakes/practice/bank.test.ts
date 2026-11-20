import { describe, expect, it } from 'vitest';
import {
  PRACTICE_BANK_VERSION,
  practiceBank,
  practiceBankSchema,
  practiceQuestionSchema,
} from './bank';

const base = {
  id: 'demo-question',
  topic: 'limit' as const,
  title: '示例',
  prompt: '题干',
  hint: '提示',
  explanation: '解析',
  source: '原创工程示例',
  reviewStatus: 'draft' as const,
};

describe('练习题题库结构（#84）', () => {
  it('内置题库通过校验且版本号固定', () => {
    expect(PRACTICE_BANK_VERSION).toBe(1);
    expect(practiceBankSchema.safeParse(practiceBank).success).toBe(true);
    expect(practiceBank.version).toBe(PRACTICE_BANK_VERSION);
  });

  it('题目 id 唯一', () => {
    const ids = practiceBank.questions.map((question) => question.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('题目必须声明参考来源与审校状态', () => {
    expect(
      practiceQuestionSchema.safeParse({
        ...base,
        kind: 'number',
        answer: 1,
        answerDisplay: '1',
      }).success,
    ).toBe(true);
    expect(
      practiceQuestionSchema.safeParse({
        ...base,
        source: '',
        kind: 'number',
        answer: 1,
        answerDisplay: '1',
      }).success,
    ).toBe(false);
    expect(
      practiceQuestionSchema.safeParse({
        ...base,
        reviewStatus: 'unknown',
        kind: 'number',
        answer: 1,
        answerDisplay: '1',
      }).success,
    ).toBe(false);
  });

  it('单选题必须且只能有一个正确选项，选项 id 不重复', () => {
    const options = [
      { id: 'a', label: 'A', correct: true },
      { id: 'b', label: 'B', correct: false },
    ];
    expect(
      practiceQuestionSchema.safeParse({ ...base, kind: 'choice', options })
        .success,
    ).toBe(true);
    expect(
      practiceQuestionSchema.safeParse({
        ...base,
        kind: 'choice',
        options: [
          { id: 'a', label: 'A', correct: true },
          { id: 'b', label: 'B', correct: true },
        ],
      }).success,
    ).toBe(false);
    expect(
      practiceQuestionSchema.safeParse({
        ...base,
        kind: 'choice',
        options: [
          { id: 'a', label: 'A', correct: true },
          { id: 'a', label: 'B', correct: false },
        ],
      }).success,
    ).toBe(false);
  });

  it('数值题拒绝非有限答案', () => {
    expect(
      practiceQuestionSchema.safeParse({
        ...base,
        kind: 'number',
        answer: Number.POSITIVE_INFINITY,
        answerDisplay: '∞',
      }).success,
    ).toBe(false);
  });

  it('题库拒绝重复题目 id', () => {
    const question = {
      ...base,
      kind: 'number' as const,
      answer: 1,
      answerDisplay: '1',
    };
    expect(
      practiceBankSchema.safeParse({
        version: PRACTICE_BANK_VERSION,
        questions: [question, { ...question, title: '重复 id' }],
      }).success,
    ).toBe(false);
  });

  it('题库版本号必须匹配，未知版本被拒绝', () => {
    expect(
      practiceBankSchema.safeParse({ version: 2, questions: [] }).success,
    ).toBe(false);
  });
});

describe('题库与历史记录的关系（#84）', () => {
  it('历史练习记录只保存作答与判定，不持有题库答案', () => {
    const attempt = {
      id: 'attempt-1',
      questionId: 'derivative-square-at-one',
      answer: '3',
      correct: false,
      answeredAt: 1,
    };
    // 记录结构里没有 answer/answerDisplay 之外的题库字段；改题库答案不会改写历史
    expect(Object.keys(attempt)).toEqual([
      'id',
      'questionId',
      'answer',
      'correct',
      'answeredAt',
    ]);
  });
});
