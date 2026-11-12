import { useCallback, useEffect, useState } from 'react';
import { supportsCrossTabLock } from '../useMistakes';
import {
  attemptSchema,
  emptyProgress,
  mergePracticeAttempts,
  PRACTICE_LIMIT,
  PRACTICE_STORAGE_KEY,
  practiceStorage,
  type PracticeAttempt,
} from './progress';

function load() {
  const result = practiceStorage.read(emptyProgress);
  return result.ok
    ? { attempts: result.data.attempts, error: null }
    : { attempts: [], error: result.error };
}

export function usePracticeProgress() {
  const [initial] = useState(load);
  const [attempts, setAttempts] = useState<PracticeAttempt[]>(initial.attempts);
  const [error, setError] = useState<string | null>(initial.error);
  const [canWrite] = useState(supportsCrossTabLock);

  useEffect(() => {
    const listener = (event: StorageEvent) => {
      if (event.key !== null && event.key !== PRACTICE_STORAGE_KEY) return;
      const next = load();
      if (!next.error) setAttempts(next.attempts);
      setError(next.error);
    };
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  }, []);

  const update = useCallback(
    async (
      mutate: (attempts: PracticeAttempt[]) => PracticeAttempt[] | null,
    ) => {
      if (!canWrite) {
        setError('当前环境不支持跨标签页锁，无法保存练习记录。');
        return false;
      }
      try {
        return await navigator.locks.request(
          'math-workbench:practice-attempts-write',
          () => {
            const latest = practiceStorage.read(emptyProgress);
            if (!latest.ok) {
              setError(latest.error);
              return false;
            }
            const next = mutate(latest.data.attempts);
            if (!next) {
              setError(`记录冲突或超过 ${PRACTICE_LIMIT} 条上限，未写入数据。`);
              return false;
            }
            const result = practiceStorage.write({ attempts: next });
            if (!result.ok) {
              setError(result.error);
              return false;
            }
            setAttempts(result.data.attempts);
            setError(null);
            return true;
          },
        );
      } catch {
        setError('无法获取练习记录写入锁，未保存。');
        return false;
      }
    },
    [canWrite],
  );

  const record = useCallback(
    (questionId: string, answer: string, correct: boolean) => {
      const item = attemptSchema.safeParse({
        id:
          globalThis.crypto?.randomUUID?.() ??
          `p-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        questionId,
        answer,
        correct,
        answeredAt: Date.now(),
      });
      if (!item.success) {
        setError('答案格式不符合记录要求，未保存。');
        return Promise.resolve(false);
      }
      return update((current) =>
        current.length >= PRACTICE_LIMIT ||
        current.some((old) => old.id === item.data.id)
          ? null
          : [...current, item.data],
      );
    },
    [update],
  );
  const merge = useCallback(
    (incoming: PracticeAttempt[]) =>
      update((current) => mergePracticeAttempts(current, incoming)),
    [update],
  );

  const reset = useCallback(async () => {
    if (!canWrite) {
      setError('当前环境不支持跨标签页锁，无法清除练习记录。');
      return false;
    }
    try {
      return await navigator.locks.request(
        'math-workbench:practice-attempts-write',
        () => {
          const result = practiceStorage.clear();
          if (!result.ok) {
            setError(result.error);
            return false;
          }
          setAttempts([]);
          setError(null);
          return true;
        },
      );
    } catch {
      setError('无法获取练习记录写入锁，未清除。');
      return false;
    }
  }, [canWrite]);

  return { attempts, error, canWrite, record, merge, reset };
}
