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
      await a.result.current.remove(original);
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

describe('删除前的一致性检查 (#21)', () => {
  it('确认删除期间被其他页面修改时不删除，并要求重新确认', async () => {
    const a = renderHook(() => useMistakes());
    await act(async () => {
      await a.result.current.add(draft('待删除'));
    });
    const snapshot = storedItems()[0];

    // 另一个标签页修改了同一条记录
    await act(async () => {
      await a.result.current.edit(snapshot, draft('被改过的新版本'));
    });

    let removed = true;
    await act(async () => {
      removed = await a.result.current.remove(snapshot);
    });

    expect(removed).toBe(false);
    expect(storedItems()[0].title).toBe('被改过的新版本');
    expect(a.result.current.saveError).toContain('未删除');
  });

  it('记录已被其他页面删除时给出提示而不是静默成功', async () => {
    const a = renderHook(() => useMistakes());
    const b = renderHook(() => useMistakes());
    await act(async () => {
      await a.result.current.add(draft('共享'));
    });
    const snapshot = storedItems()[0];
    await act(async () => {
      await a.result.current.remove(snapshot);
    });
    let removed = true;
    await act(async () => {
      removed = await b.result.current.remove(snapshot);
    });
    expect(removed).toBe(false);
    expect(b.result.current.saveError).toContain('被删除');
  });

  it('未变更时正常删除', async () => {
    const a = renderHook(() => useMistakes());
    await act(async () => {
      await a.result.current.add(draft('正常删除'));
    });
    const snapshot = storedItems()[0];
    await act(async () => {
      expect(await a.result.current.remove(snapshot)).toBe(true);
    });
    expect(storedItems()).toHaveLength(0);
  });
});

describe('跨标签页错误状态同步 (#22)', () => {
  it('其他页面写入损坏数据后立即显示读取错误，且不覆盖原数据', async () => {
    const a = renderHook(() => useMistakes());
    expect(a.result.current.loadError).toBeNull();

    const corrupt = '{"schemaVersion":1,"data":{"items":"broken"}}';
    act(() => {
      localStorage.setItem(MISTAKE_STORAGE_KEY, corrupt);
      fireStorageEvent();
    });

    expect(a.result.current.loadError).toBeTruthy();
    expect(localStorage.getItem(MISTAKE_STORAGE_KEY)).toBe(corrupt);
  });

  it('数据恢复可读后清除错误并同步列表', async () => {
    const corrupt = '{"schemaVersion":1,"data":{"items":"broken"}}';
    localStorage.setItem(MISTAKE_STORAGE_KEY, corrupt);
    const a = renderHook(() => useMistakes());
    expect(a.result.current.loadError).toBeTruthy();

    act(() => {
      const envelope = {
        schemaVersion: 1,
        data: {
          items: [
            {
              id: 'restored',
              title: '恢复的记录',
              topic: 'limit',
              problem: '',
              mistakeReason: '',
              correction: '',
              createdAt: 1,
              updatedAt: 1,
            },
          ],
        },
      };
      localStorage.setItem(MISTAKE_STORAGE_KEY, JSON.stringify(envelope));
      fireStorageEvent();
    });

    expect(a.result.current.loadError).toBeNull();
    expect(a.result.current.items[0].title).toBe('恢复的记录');
  });

  it('localStorage.clear()（key 为 null）也会同步为空列表', async () => {
    const a = renderHook(() => useMistakes());
    await act(async () => {
      await a.result.current.add(draft('将被清除'));
    });

    act(() => {
      localStorage.clear();
      window.dispatchEvent(new StorageEvent('storage', { key: null }));
    });

    expect(a.result.current.items).toHaveLength(0);
  });
});

describe('不支持 Web Locks 时的只读模式 (#23)', () => {
  it('上报 canWrite=false 并拒绝写入', async () => {
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: undefined,
    });
    const a = renderHook(() => useMistakes());
    expect(a.result.current.canWrite).toBe(false);
    await act(async () => {
      expect(await a.result.current.add(draft('只读'))).toBe(false);
    });
    expect(localStorage.getItem(MISTAKE_STORAGE_KEY)).toBeNull();
    expect(a.result.current.saveError).toContain('只读模式');
  });

  it('支持时 canWrite=true', () => {
    const a = renderHook(() => useMistakes());
    expect(a.result.current.canWrite).toBe(true);
  });
});
