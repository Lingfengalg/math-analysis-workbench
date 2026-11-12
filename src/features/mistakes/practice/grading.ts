import { scoreNumericInput, scoreRadio } from '@khanacademy/perseus-score';
import type { PracticeQuestion } from './questions';

export type Grade = 'correct' | 'incorrect' | 'invalid';

/** 限定输入形式和长度，再使用 Khan Academy Perseus 的评分器。 */
export function gradePractice(question: PracticeQuestion, raw: string): Grade {
  const answer = raw.trim().replaceAll('−', '-');
  if (!answer || answer.length > 40) return 'invalid';
  if (question.kind === 'choice') {
    if (!question.options.some((option) => option.id === answer))
      return 'invalid';
    const result = scoreRadio(
      { selectedChoiceIds: [answer] },
      {
        choices: question.options.map((option) => ({
          id: option.id,
          content: option.label,
          correct: option.correct,
        })),
      },
    );
    return result.type !== 'points'
      ? 'invalid'
      : result.earned === result.total
        ? 'correct'
        : 'incorrect';
  }
  const fraction = answer.match(/^([+-]?\d+)\s*\/\s*([+-]?\d+)$/);
  const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  if (
    (!fraction && !decimal.test(answer)) ||
    (fraction && Number(fraction[2]) === 0)
  )
    return 'invalid';
  const result = scoreNumericInput(
    { currentValue: answer },
    {
      answers: [
        {
          value: question.answer,
          status: 'correct',
          strict: false,
          simplify: 'optional',
          maxError: 0,
          message: '',
        },
      ],
      coefficient: false,
      size: 'normal',
      textAlign: 'left',
    },
    'en',
  );
  return result.type !== 'points'
    ? 'invalid'
    : result.earned === result.total
      ? 'correct'
      : 'incorrect';
}

export function displayAnswer(
  question: PracticeQuestion,
  answer: string,
): string {
  return question.kind === 'number'
    ? answer.trim()
    : (question.options.find((option) => option.id === answer)?.label ??
        answer);
}

export function correctAnswer(question: PracticeQuestion): string {
  return question.kind === 'number'
    ? question.answerDisplay
    : question.options
        .filter((option) => option.correct)
        .map((option) => option.label)
        .join('、');
}
