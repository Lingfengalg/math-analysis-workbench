import { z } from 'zod';
import type { MistakeTopic } from '../model';

/**
 * 题库版本与数据结构（#84）。
 *
 * 约定：
 * - `version` 只在结构发生不兼容变化时 +1；新增可选字段不升版本。
 * - 题目 id 是稳定标识，练习记录与错题通过 `practice:<id>` 关联，**不要改已发布题目的 id**。
 * - 已发布题目修改答案不会改写历史练习记录：记录里保存的是当时的作答文本与判定结果，
 *   重新作答才按新答案评分（见 `practice/progress.ts` 的 attempt 结构）。
 * - `reviewStatus` 由课程组维护；`draft` 表示内容尚未审校，不代表结论正确。
 */

export const PRACTICE_BANK_VERSION = 1;

const idPattern = /^[a-z][a-z0-9-]*$/;

const commonFields = {
  id: z
    .string()
    .regex(idPattern, '题目 id 需为小写字母开头的短横线分词')
    .max(80),
  topic: z.enum(['limit', 'continuity', 'derivative']),
  title: z.string().min(1).max(120),
  prompt: z.string().min(1).max(500),
  hint: z.string().min(1).max(300),
  explanation: z.string().min(1).max(1000),
  /** 参考来源：只写可公开引用或「原创示例」说明，不转载未授权教材。 */
  source: z.string().min(1).max(200),
  reviewStatus: z.enum(['draft', 'reviewed']),
  reviewedBy: z.string().min(1).max(60).optional(),
  reviewedAt: z
    .number()
    .int()
    .nonnegative()
    .max(8_640_000_000_000_000)
    .optional(),
};

export const numericQuestionSchema = z
  .object({
    ...commonFields,
    kind: z.literal('number'),
    answer: z.number().finite(),
    answerDisplay: z.string().min(1).max(40),
  })
  .strict();

export const choiceQuestionSchema = z
  .object({
    ...commonFields,
    kind: z.literal('choice'),
    options: z
      .array(
        z
          .object({
            id: z.string().regex(idPattern).max(40),
            label: z.string().min(1).max(200),
            correct: z.boolean(),
          })
          .strict(),
      )
      .min(2)
      .max(6),
  })
  .strict()
  .refine(
    (question) =>
      question.options.filter((option) => option.correct).length === 1,
    { message: '单选题必须且只能有一个正确选项' },
  )
  .refine(
    (question) =>
      new Set(question.options.map((option) => option.id)).size ===
      question.options.length,
    { message: '选项 id 不可重复' },
  );

export const practiceQuestionSchema = z.discriminatedUnion('kind', [
  numericQuestionSchema,
  choiceQuestionSchema,
]);

export type NumericQuestion = z.infer<typeof numericQuestionSchema>;
export type ChoiceQuestion = z.infer<typeof choiceQuestionSchema>;
export type PracticeQuestion = z.infer<typeof practiceQuestionSchema>;

export const practiceBankSchema = z
  .object({
    version: z.literal(PRACTICE_BANK_VERSION),
    questions: z.array(practiceQuestionSchema).min(1).max(200),
  })
  .strict()
  .refine(
    (bank) =>
      new Set(bank.questions.map((question) => question.id)).size ===
      bank.questions.length,
    { message: '题目 id 不可重复' },
  );

export type PracticeBank = z.infer<typeof practiceBankSchema>;

/** 原创工程示例；课程组审校后把 reviewStatus 改为 reviewed 并补 reviewedBy/At。 */
export const practiceBank: PracticeBank = practiceBankSchema.parse({
  version: PRACTICE_BANK_VERSION,
  questions: [
    {
      id: 'derivative-square-at-one',
      topic: 'derivative',
      title: '求二次函数在一点的导数',
      prompt: '设 f(x) = x²，求 f′(1)。',
      kind: 'number',
      answer: 2,
      answerDisplay: '2',
      hint: '先求 f′(x)，或者从差商定义出发。',
      explanation: 'f′(x) = 2x，故 f′(1) = 2。',
      source: '原创工程示例，待课程组审校',
      reviewStatus: 'draft',
    },
    {
      id: 'derivative-absolute-zero',
      topic: 'derivative',
      title: '连续与可导',
      prompt: '函数 f(x) = |x| 在 x = 0 处是否可导？',
      kind: 'choice',
      options: [
        { id: 'yes', label: '可导，因为它在该点连续', correct: false },
        { id: 'no', label: '不可导，左右导数不相等', correct: true },
        {
          id: 'undefined',
          label: '无法讨论，因为 f(0) 无定义',
          correct: false,
        },
      ],
      hint: '分别计算 h 从左、右趋近 0 时的差商。',
      explanation: '|x| 在 0 处连续，但左导数为 −1、右导数为 1，因此不可导。',
      source: '原创工程示例，待课程组审校',
      reviewStatus: 'draft',
    },
    {
      id: 'limit-trigonometric-half',
      topic: 'limit',
      title: '三角函数极限',
      prompt: '角度以弧度计，求 x 趋近 0 时 sin(2x)/(4x) 的极限。',
      kind: 'number',
      answer: 0.5,
      answerDisplay: '1/2',
      hint: '将式子写成 sin(2x)/(2x) 再乘常数。',
      explanation: 'sin(2x)/(4x) = ½·sin(2x)/(2x)，由基本极限可得 1/2。',
      source: '原创工程示例，待课程组审校',
      reviewStatus: 'draft',
    },
    {
      id: 'continuity-reciprocal-zero',
      topic: 'continuity',
      title: '连续性与定义域',
      prompt: '关于 f(x) = 1/x 在 x = 0 处的连续性，哪一项正确？',
      kind: 'choice',
      options: [
        { id: 'continuous', label: '在 0 处连续', correct: false },
        {
          id: 'not-defined',
          label: '0 不在定义域内，不能说它在该点连续',
          correct: true,
        },
        {
          id: 'removable',
          label: '在 0 处有可去间断，只需补充函数值',
          correct: false,
        },
      ],
      hint: '先判断函数在该点是否有定义，再分析两侧极限。',
      explanation: '1/x 在 0 处没有定义，且两侧不存在相同的有限极限。',
      source: '原创工程示例，待课程组审校',
      reviewStatus: 'draft',
    },
  ],
});

export const practiceQuestions: readonly PracticeQuestion[] =
  practiceBank.questions;

export function findPracticeQuestion(id: string): PracticeQuestion | undefined {
  return practiceQuestions.find((question) => question.id === id);
}

export type { MistakeTopic };
