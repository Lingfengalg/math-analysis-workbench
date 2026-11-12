import { describe, expect, it } from 'vitest';
import { createEmptyCard, fsrs, Rating } from 'ts-fsrs';
import { isReviewDue, nextReview, reviewScheduleSchema } from './schedule';

describe('FSRS 错题复习计划', () => {
  const now = Date.UTC(2026, 10, 11, 12);
  it('直接采用 ts-fsrs 的计算结果并保留状态', () => {
    const expected = fsrs({ request_retention: 0.9, enable_fuzz: false }).next(
      createEmptyCard(new Date(now)),
      new Date(now),
      Rating.Good,
    ).card;
    const actual = nextReview(undefined, Rating.Good, now);
    expect(actual.due).toBe(expected.due.getTime());
    expect(actual.stability).toBe(expected.stability);
    expect(actual.reps).toBe(1);
    expect(isReviewDue(actual, now)).toBe(false);
    expect(isReviewDue(actual, actual.due)).toBe(true);
    const again = nextReview(actual, Rating.Again, actual.due);
    expect(again.reps).toBe(2);
    expect(again.lastRating).toBe(Rating.Again);
  });
  it('未安排的旧数据立即可复习，不虚构已有历史', () => {
    expect(isReviewDue(undefined, now)).toBe(true);
    expect(nextReview(undefined, Rating.Easy, now).reps).toBe(1);
  });
  it('拒绝损坏状态和系统时间回退', () => {
    const schedule = nextReview(undefined, Rating.Hard, now);
    expect(
      reviewScheduleSchema.safeParse({ ...schedule, due: -1 }).success,
    ).toBe(false);
    expect(() => nextReview(schedule, Rating.Good, now - 1)).toThrow();
  });
});
