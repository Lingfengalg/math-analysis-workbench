import { z } from 'zod';
import { createStorage } from '@/shared/storage';

export const PRACTICE_STORAGE_KEY = 'math-workbench:practice-attempts';
export const PRACTICE_LIMIT = 2000;
export const attemptSchema = z.object({
  id: z.string().min(1).max(128),
  questionId: z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/)
    .max(100),
  answer: z.string().min(1).max(40),
  correct: z.boolean(),
  answeredAt: z.number().int().nonnegative(),
});
export type PracticeAttempt = z.infer<typeof attemptSchema>;
/** 按记录时间寻找最近一次；同一毫秒时保留后写入的记录。 */
export function latestAttempt(
  attempts: readonly PracticeAttempt[],
  questionId: string,
): PracticeAttempt | undefined {
  return attempts.reduce<PracticeAttempt | undefined>(
    (latest, item) =>
      item.questionId === questionId &&
      (!latest || item.answeredAt >= latest.answeredAt)
        ? item
        : latest,
    undefined,
  );
}

export const progressSchema = z
  .object({
    attempts: z.array(attemptSchema).max(PRACTICE_LIMIT),
  })
  .refine(
    (value) =>
      new Set(value.attempts.map((attempt) => attempt.id)).size ===
      value.attempts.length,
  );
export const practiceStorage = createStorage(
  'practice-attempts',
  progressSchema,
);
export const emptyProgress = { attempts: [] as PracticeAttempt[] };

const backupSchema = z.object({
  format: z.literal('math-analysis-workbench/practice'),
  version: z.literal(1),
  attempts: z.array(attemptSchema).max(PRACTICE_LIMIT),
});
export function serializePracticeBackup(
  attempts: readonly PracticeAttempt[],
): string {
  return JSON.stringify(
    { format: 'math-analysis-workbench/practice', version: 1, attempts },
    null,
    2,
  );
}
export function parsePracticeBackup(text: string): PracticeAttempt[] | null {
  if (text.length > 1_000_000) return null;
  try {
    const parsed = backupSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return null;
    const ids = parsed.data.attempts.map((attempt) => attempt.id);
    return new Set(ids).size === ids.length ? parsed.data.attempts : null;
  } catch {
    return null;
  }
}

export function mergePracticeAttempts(
  current: readonly PracticeAttempt[],
  incoming: readonly PracticeAttempt[],
): PracticeAttempt[] | null {
  const byId = new Map(current.map((attempt) => [attempt.id, attempt]));
  for (const attempt of incoming) {
    const old = byId.get(attempt.id);
    if (old && JSON.stringify(old) !== JSON.stringify(attempt)) return null;
    byId.set(attempt.id, attempt);
  }
  return byId.size > PRACTICE_LIMIT ? null : [...byId.values()];
}
