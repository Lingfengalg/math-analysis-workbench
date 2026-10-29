import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMPTY_MISTAKES,
  MISTAKE_STORAGE_KEY,
  mistakeStorage,
  type MistakeDraft,
} from './model';
import { useMistakes } from './useMistakes';

const draft = (title: string): MistakeDraft => ({
  title,
  topic: 'limit',
  problem: '',
  mistakeReason: '',
  correction: '',
});
function storedItems() {
  const result = mistakeStorage.read(EMPTY_MISTAKES);
  if (!result.ok) throw new Error('storage unreadable');
  return result.data.items;
}
function fireStorageEvent() {
  window.dispatchEvent(
    new StorageEvent('storage', { key: MISTAKE_STORAGE_KEY }),
  );
}
beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
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

describe('错题本跨标签页一致性', () => {
  it('两个标签页同时新增都不会丢失', async () => {
    const a = renderHook(() => useMistakes());
    const b = renderHook(() => useMistakes());
    await act(async () => {
      await Promise.all([
        a.result.current.add(draft('A')),
        b.result.current.add(draft('B')),
      ]);
    });
    expect(
      storedItems()
        .map((x) => x.title)
        .sort(),
    ).toEqual(['A', 'B']);
    act(fireStorageEvent);
    expect(a.result.current.items.map((x) => x.title).sort()).toEqual([
      'A',
      'B',
    ]);
  });
  it('同一记录被其他页面修改时保留新值并提示冲突', async () => {
    const a = renderHook(() => useMistakes());
    const b = renderHook(() => useMistakes());
    await act(async () => {
      await a.result.current.add(draft('原题'));
    });
    const original = storedItems()[0];
    await act(async () => {
      expect(await a.result.current.edit(original, draft('A 修改'))).toBe(true);
    });
    await act(async () => {
      expect(await b.result.current.edit(original, draft('B 草稿'))).toBe(
        false,
      );
    });
    expect(storedItems()[0].title).toBe('A 修改');
    expect(b.result.current.saveError).toContain('其他标签页修改');
  });
  it('其他页面删除后不能复活记录', async () => {
    const a = renderHook(() => useMistakes());
    const b = renderHook(() => useMistakes());
    await act(async () => {
      await a.result.current.add(draft('共享'));
    });
    const original = storedItems()[0];
    await act(async () => {
      await a.result.current.remove(original.id);
    });
    await act(async () => {
      expect(await b.result.current.edit(original, draft('草稿'))).toBe(false);
    });
    expect(storedItems()).toHaveLength(0);
    expect(b.result.current.saveError).toContain('已不存在');
  });
  it('读取失败时保留原始数据', async () => {
    const corrupt = '{"schemaVersion":1,"data":{"items":"broken"}}';
    localStorage.setItem(MISTAKE_STORAGE_KEY, corrupt);
    const a = renderHook(() => useMistakes());
    await act(async () => {
      expect(await a.result.current.add(draft('不写入'))).toBe(false);
    });
    expect(localStorage.getItem(MISTAKE_STORAGE_KEY)).toBe(corrupt);
  });
  it('不支持 Web Locks 时拒绝写入', async () => {
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: undefined,
    });
    const a = renderHook(() => useMistakes());
    await act(async () => {
      expect(await a.result.current.add(draft('不写入'))).toBe(false);
    });
    expect(localStorage.getItem(MISTAKE_STORAGE_KEY)).toBeNull();
    expect(a.result.current.saveError).toContain('不支持');
  });
});
