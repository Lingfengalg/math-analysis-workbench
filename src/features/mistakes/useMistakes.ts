import { useCallback, useState } from 'react';
import {
  createMistake,
  EMPTY_MISTAKES,
  mistakeDraftSchema,
  mistakeStorage,
  sortMistakes,
  updateMistake,
  type Mistake,
  type MistakeDraft,
  type MistakeList,
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

export interface MistakesController {
  items: Mistake[];
  loadError: string | null;
  saveError: string | null;
  add: (draft: MistakeDraft) => boolean;
  edit: (id: string, draft: MistakeDraft) => boolean;
  remove: (id: string) => boolean;
  reset: () => boolean;
}

/**
 * 错题本状态。所有写入都先经过 Zod 校验再落 storage；
 * 写入失败时保留内存中的旧列表，并暴露错误给界面提示。
 */
export function useMistakes(): MistakesController {
  const [boot] = useState<BootState>(loadMistakes);
  const [items, setItems] = useState<Mistake[]>(boot.items);
  const [loadError, setLoadError] = useState<string | null>(boot.error);
  const [saveError, setSaveError] = useState<string | null>(null);

  const persist = useCallback((next: MistakeList): boolean => {
    const result = mistakeStorage.write(next);
    if (!result.ok) {
      setSaveError(result.error);
      return false;
    }
    setSaveError(null);
    setItems(sortMistakes(result.data.items));
    return true;
  }, []);

  const add = useCallback(
    (draft: MistakeDraft): boolean => {
      const parsed = mistakeDraftSchema.safeParse(draft);
      if (!parsed.success) {
        setSaveError(parsed.error.issues[0]?.message ?? '错题内容不完整');
        return false;
      }
      return persist({ items: [createMistake(parsed.data), ...items] });
    },
    [items, persist],
  );

  const edit = useCallback(
    (id: string, draft: MistakeDraft): boolean => {
      const target = items.find((item) => item.id === id);
      if (!target) {
        setSaveError('这条错题已不存在，可能已在其他标签页删除。');
        return false;
      }
      const parsed = mistakeDraftSchema.safeParse(draft);
      if (!parsed.success) {
        setSaveError(parsed.error.issues[0]?.message ?? '错题内容不完整');
        return false;
      }
      return persist({
        items: items.map((item) =>
          item.id === id ? updateMistake(item, parsed.data) : item,
        ),
      });
    },
    [items, persist],
  );

  const remove = useCallback(
    (id: string): boolean =>
      persist({ items: items.filter((item) => item.id !== id) }),
    [items, persist],
  );

  const reset = useCallback((): boolean => {
    const result = mistakeStorage.clear();
    if (!result.ok) {
      setSaveError(result.error);
      return false;
    }
    setItems([]);
    setLoadError(null);
    setSaveError(null);
    return true;
  }, []);

  return { items, loadError, saveError, add, edit, remove, reset };
}
