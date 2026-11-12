import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  emptyProgress,
  mergePracticeAttempts,
  parsePracticeBackup,
  practiceStorage,
  PRACTICE_STORAGE_KEY,
  serializePracticeBackup,
} from './progress';
import { usePracticeProgress } from './usePracticeProgress';

beforeEach(() => {
  localStorage.clear();
  let queue = Promise.resolve();
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: (_name: string, action: () => boolean) => {
        const result = queue.then(action);
        queue = result.then(
          () => undefined,
          () => undefined,
        );
        return result;
      },
    },
  });
});

describe('练习记录', () => {
  it('并发追加不丢失，备份往返可合并去重', async () => {
    const a = renderHook(() => usePracticeProgress());
    const b = renderHook(() => usePracticeProgress());
    await act(async () => {
      expect(
        await Promise.all([
          a.result.current.record('test-one', '1', false),
          b.result.current.record('test-one', '2', true),
        ]),
      ).toEqual([true, true]);
    });
    const result = practiceStorage.read(emptyProgress);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreadable');
    expect(result.data.attempts).toHaveLength(2);
    const restored = parsePracticeBackup(
      serializePracticeBackup(result.data.attempts),
    );
    expect(restored).toEqual(result.data.attempts);
    expect(mergePracticeAttempts(result.data.attempts, restored!)).toHaveLength(
      2,
    );
    expect(
      mergePracticeAttempts(result.data.attempts, [
        { ...restored![0], answer: '9' },
      ]),
    ).toBeNull();
  });
  it('损坏记录不被覆盖，可保留原始数据', async () => {
    const raw = '{"schemaVersion":1,"data":{"attempts":"broken"}}';
    localStorage.setItem(PRACTICE_STORAGE_KEY, raw);
    const a = renderHook(() => usePracticeProgress());
    await act(async () => {
      expect(await a.result.current.record('test-one', '1', false)).toBe(false);
    });
    expect(localStorage.getItem(PRACTICE_STORAGE_KEY)).toBe(raw);
  });
  it('缺少跨标签页锁时拒绝写入', async () => {
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: undefined,
    });
    const a = renderHook(() => usePracticeProgress());
    await act(async () => {
      expect(await a.result.current.record('test-one', '1', false)).toBe(false);
    });
    expect(localStorage.getItem(PRACTICE_STORAGE_KEY)).toBeNull();
  });
  it('不接收重复 id 或非法备份', () => {
    const entry = {
      id: 'a',
      questionId: 'test-one',
      answer: '1',
      correct: false,
      answeredAt: 1,
    };
    expect(
      parsePracticeBackup(serializePracticeBackup([entry, entry])),
    ).toBeNull();
    expect(parsePracticeBackup('{broken')).toBeNull();
  });
});
