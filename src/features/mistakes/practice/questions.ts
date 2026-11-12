import type { MistakeTopic } from '../model';

type CommonQuestion = {
  id: string;
  topic: Exclude<MistakeTopic, 'other'>;
  title: string;
  prompt: string;
  hint: string;
  explanation: string;
};

export type PracticeQuestion = CommonQuestion &
  (
    | { kind: 'number'; answer: number; answerDisplay: string }
    | {
        kind: 'choice';
        options: readonly { id: string; label: string; correct: boolean }[];
      }
  );

/** 原创工程示例；课程组仍需审核内容和教材引用。题目 id 不能随意更改。 */
export const practiceQuestions: readonly PracticeQuestion[] = [
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
      { id: 'undefined', label: '无法讨论，因为 f(0) 无定义', correct: false },
    ],
    hint: '分别计算 h 从左、右趋近 0 时的差商。',
    explanation: '|x| 在 0 处连续，但左导数为 −1、右导数为 1，因此不可导。',
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
  },
];

export function practiceMistakeId(questionId: string): string {
  return `practice:${questionId}`;
}
