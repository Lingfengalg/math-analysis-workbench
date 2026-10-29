import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMPTY_MISTAKES,
  MISTAKE_STORAGE_KEY,
  mistakeStorage,
  type MistakeDraft,
} from './model';
import { useMistakes } from './useMistakes';

function draft(title: string): MistakeDraft {
  return {
    title,
    topic: 'limit',
    problem: '',
    mistakeReason: '',
    correction: '',
  };
}

function storedItems() {
  const result = mistakeStorage.read(EMPTY_MISTAKES);
  if (!result.ok) throw new Error('storage unreadable');
  return result.data.items;
}

function storedTitles() {
  return storedItems()
    .map((item) => item.title)
    .sort();
}

/** 真实浏览器会在其他标签页写入后自动派发 storage 事件，jsdom 需要手动模拟。 */
function fireStorageEvent() {
  window.dispatchEvent(
    new StorageEvent('storage', { key: MISTAKE_STORAGE_KEY }),
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('错题本跨标签页一致性', () => {
  it('两个标签页交替新增都不会丢失', () => {
    const tabA = renderHook(() => useMistakes());
    const tabB = renderHook(() => useMistakes());

    act(() => {
      tabA.result.current.add(draft('A 页新增'));
    });
    act(() => {
      tabB.result.current.add(draft('B 页新增'));
    });

    expect(storedTitles()).toEqual(['A 页新增', 'B 页新增']);
    expect(tabB.result.current.items.map((item) => item.title).sort()).toEqual([
      'A 页新增',
      'B 页新增',
    ]);

    act(fireStorageEvent);
    expect(tabA.result.current.items.map((item) => item.title).sort()).toEqual([
      'A 页新增',
      'B 页新增',
    ]);
  });

  it('旧快照标签页编辑其他标签页新增的记录时基于最新数据生效', () => {
    const tabB = renderHook(() => useMistakes());
    const tabA = renderHook(() => useMistakes());

    act(() => {
      tabA.result.current.add(draft('A 页新增'));
    });
    const id = storedItems()[0].id;

    let saved = false;
    act(() => {
      saved = tabB.result.current.edit(id, draft('B 页改名'));
    });

    expect(saved).toBe(true);
    expect(storedTitles()).toEqual(['B 页改名']);
  });

  it('记录已在其他标签页删除时，编辑会报冲突且不复活', () => {
    const tabA = renderHook(() => useMistakes());
    const tabB = renderHook(() => useMistakes());

    act(() => {
      tabA.result.current.add(draft('共享记录'));
    });
    const id = storedItems()[0].id;
    act(() => {
      tabA.result.current.remove(id);
    });

    let saved = true;
    act(() => {
      saved = tabB.result.current.edit(id, draft('试图编辑'));
    });

    expect(saved).toBe(false);
    expect(tabB.result.current.saveError).toContain('已不存在');
    expect(storedItems()).toHaveLength(0);
  });

  it('删除不会被旧快照复活', () => {
    const tabA = renderHook(() => useMistakes());
    const tabB = renderHook(() => useMistakes());

    act(() => {
      tabA.result.current.add(draft('保留'));
      tabA.result.current.add(draft('待删除'));
    });
    const target = storedItems().find((item) => item.title === '待删除')!;

    act(() => {
      tabB.result.current.remove(target.id);
    });

    expect(storedTitles()).toEqual(['保留']);
  });

  it('storage 事件让其他标签页即时同步', () => {
    const tabA = renderHook(() => useMistakes());
    act(() => {
      tabA.result.current.add(draft('来自 A'));
    });

    act(() => {
      const envelope = JSON.parse(localStorage.getItem(MISTAKE_STORAGE_KEY)!);
      envelope.data.items.push({
        ...envelope.data.items[0],
        id: 'from-b',
        title: '来自 B',
      });
      localStorage.setItem(MISTAKE_STORAGE_KEY, JSON.stringify(envelope));
      fireStorageEvent();
    });

    expect(tabA.result.current.items.map((item) => item.title)).toContain(
      '来自 B',
    );
  });

  it('读取失败时放弃写入并保留原始数据', () => {
    const corrupt = '{"schemaVersion":1,"data":{"items":"broken"}}';
    localStorage.setItem(MISTAKE_STORAGE_KEY, corrupt);
    const tab = renderHook(() => useMistakes());
    expect(tab.result.current.loadError).toBeTruthy();

    let saved = true;
    act(() => {
      saved = tab.result.current.add(draft('不该写入'));
    });

    expect(saved).toBe(false);
    expect(localStorage.getItem(MISTAKE_STORAGE_KEY)).toBe(corrupt);
  });
});
