/**
 * 题库入口：实际数据与校验在 `bank.ts`（#84）。
 * 这里保留原有导入路径，避免调用方跟着改。
 */
export {
  practiceBank,
  practiceQuestions,
  findPracticeQuestion,
  PRACTICE_BANK_VERSION,
  practiceQuestionSchema,
  practiceBankSchema,
} from './bank';
export type {
  PracticeQuestion,
  NumericQuestion,
  ChoiceQuestion,
  PracticeBank,
} from './bank';

export function practiceMistakeId(questionId: string): string {
  return `practice:${questionId}`;
}
