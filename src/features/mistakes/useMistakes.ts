import { useCallback, useEffect, useState } from 'react';
import {
  createMistake,
  EMPTY_MISTAKES,
  MISTAKE_STORAGE_KEY,
  mistakeDraftSchema,
  mistakeStorage,
  sortMistakes,
  updateMistake,
  type Mistake,
  type MistakeDraft,
} from './model';

interface BootState {
  items: Mistake[];
  error: string | null;
}

function loadMistakes(): BootState {
  const result = mistakeStorage.read(EMPTY_MISTAKES);
  return result.ok
    ? { items: sortMistakes(result.data.items), error: null }
    : { items: [], error: result.error };
}

/** 返回 null 表示目标记录已不存在，放弃本次写入。 */
type Mutator = (current: readonly Mistake[]) => Mistake[] | null;

export interface MistakesController {
  items: Mistake[];
  loadError: string | null;
  saveError: string | null;
  add: (draft: MistakeDraft) => Promise<boolean>;
  edit: (original: Mistake, draft: MistakeDraft) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  reset: () => Promise<boolean>;
}

/**
 * 错题本状态。
 *
 * 并发策略：写入前始终重新从存储读取最新列表，再做增量修改，
 * 因此其他标签页的新增/编辑/删除不会被本页的旧快照回声覆盖；
 * 同时监听 storage 事件，让其他标签页的改动即时反映到当前界面。
 * 读取失败时直接放弃写入，避免覆盖无法解析的原始数据。
 */
export function useMistakes(): MistakesController {
  const [boot] = useState<BootState>(loadMistakes);
  const [items, setItems] = useState<Mistake[]>(boot.items);
  const [loadError, setLoadError] = useState<string | null>(boot.error);
  const [saveError, setSaveError] = useState<string | null>(null);

  const locked = useCallback(
    async (action: () => boolean): Promise<boolean> => {
      if (!navigator.locks) {
        setSaveError('浏览器不支持安全的跨标签页写入，未修改数据。');
        return false;
      }
      try {
        return await navigator.locks.request(
          'math-workbench:mistakes-write',
          action,
        );
      } catch {
        setSaveError('无法获取跨标签页写入锁，未修改数据。');
        return false;
      }
    },
    [],
  );

  const commit = useCallback(
    (mutate: Mutator): Promise<boolean> =>
      locked(() => {
        const latest = mistakeStorage.read(EMPTY_MISTAKES);
        if (!latest.ok) {
          setSaveError(latest.error);
          return false;
        }
        const updated = mutate(latest.data.items);
        if (updated === null) return false;
        const result = mistakeStorage.write({ items: sortMistakes(updated) });
        if (!result.ok) {
          setSaveError(result.error);
          return false;
        }
        setSaveError(null);
        setItems(sortMistakes(result.data.items));
        return true;
      }),
    [locked],
  );

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== MISTAKE_STORAGE_KEY) return;
      const latest = mistakeStorage.read(EMPTY_MISTAKES);
      if (latest.ok) setItems(sortMistakes(latest.data.items));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const add = useCallback(
    async (draft: MistakeDraft): Promise<boolean> => {
      const parsed = mistakeDraftSchema.safeParse(draft);
      if (!parsed.success) {
        setSaveError(parsed.error.issues[0]?.message ?? '错题内容不完整');
        return false;
      }
      return commit((current) => [createMistake(parsed.data), ...current]);
    },
    [commit],
  );

  const edit = useCallback(
    async (original: Mistake, draft: MistakeDraft): Promise<boolean> => {
      const parsed = mistakeDraftSchema.safeParse(draft);
      if (!parsed.success) {
        setSaveError(parsed.error.issues[0]?.message ?? '错题内容不完整');
        return false;
      }
      let conflict = false;
      const saved = await commit((current) => {
        const latest = current.find((item) => item.id === original.id);
        if (!latest || JSON.stringify(latest) !== JSON.stringify(original)) {
          conflict = true;
          return null;
        }
        return current.map((item) =>
          item.id === original.id ? updateMistake(item, parsed.data) : item,
        );
      });
      if (conflict) {
        setSaveError(
          '这条错题已不存在或已在其他标签页修改，请复制草稿并重新打开后再试。',
        );
        return false;
      }
      return saved;
    },
    [commit],
  );

  const remove = useCallback(
    (id: string): Promise<boolean> =>
      commit((current) => current.filter((item) => item.id !== id)),
    [commit],
  );

  const reset = useCallback(
    (): Promise<boolean> =>
      locked(() => {
        const result = mistakeStorage.clear();
        if (!result.ok) {
          setSaveError(result.error);
          return false;
        }
        setItems([]);
        setLoadError(null);
        setSaveError(null);
        return true;
      }),
    [locked],
  );

  return { items, loadError, saveError, add, edit, remove, reset };
}
