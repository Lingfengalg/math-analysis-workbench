import {
  createEmptyCard,
  fsrs,
  Rating,
  type CardInput,
  type Grade,
} from 'ts-fsrs';
import { z } from 'zod';

// 保存 FSRS 的完整卡片状态，时间用 epoch 毫秒，避免 JSON 中 Date 的隐式转换。
const timestamp = z.number().int().min(0).max(8_640_000_000_000_000);
const nonnegative = z.number().finite().nonnegative();
export const reviewScheduleSchema = z
  .object({
    version: z.literal(1),
    algorithm: z.literal('FSRS-6'),
    due: timestamp,
    lastReview: timestamp,
    stability: nonnegative,
    difficulty: nonnegative,
    elapsedDays: nonnegative,
    scheduledDays: nonnegative,
    learningSteps: z.number().int().nonnegative(),
    reps: z.number().int().positive(),
    lapses: z.number().int().nonnegative(),
    state: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    lastRating: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
    ]),
  })
  .strict();
export type ReviewSchedule = z.infer<typeof reviewScheduleSchema>;
export type ReviewRating = Grade;
export { Rating };

// 固定参数和关闭 fuzz，确保预览和实际保存一致；不是个人参数优化。
const scheduler = fsrs({ request_retention: 0.9, enable_fuzz: false });

function asCard(schedule: ReviewSchedule | undefined, now: number): CardInput {
  if (!schedule) return createEmptyCard(new Date(now));
  return {
    due: schedule.due,
    last_review: schedule.lastReview,
    stability: schedule.stability,
    difficulty: schedule.difficulty,
    elapsed_days: schedule.elapsedDays,
    scheduled_days: schedule.scheduledDays,
    learning_steps: schedule.learningSteps,
    reps: schedule.reps,
    lapses: schedule.lapses,
    state: schedule.state,
  };
}

export function nextReview(
  schedule: ReviewSchedule | undefined,
  rating: ReviewRating,
  now: number,
): ReviewSchedule {
  if (schedule && now < schedule.lastReview)
    throw new Error('系统时间早于上次复习时间。');
  const card = scheduler.next(
    asCard(schedule, now),
    new Date(now),
    rating,
  ).card;
  return reviewScheduleSchema.parse({
    version: 1,
    algorithm: 'FSRS-6',
    due: card.due.getTime(),
    lastReview: card.last_review?.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastRating: rating,
  });
}

export function isReviewDue(
  schedule: ReviewSchedule | undefined,
  now: number,
): boolean {
  return !schedule || schedule.due <= now;
}
