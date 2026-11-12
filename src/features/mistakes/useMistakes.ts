import { useCallback, useEffect, useState } from 'react';
import {
  createMistake,
  EMPTY_MISTAKES,
  MISTAKE_LIMITS,
  MISTAKE_STORAGE_KEY,
  markReviewed,
  mistakeDraftSchema,
  mistakeListSchema,
  mistakeStorage,
  sortMistakes,
  updateMistake,
  type Mistake,
  type MistakeDraft,
} from './model';
import { resolveImport, type ImportMode } from './transfer';
import { practiceMistakeId } from './practice/questions';
import { nextReview, Rating, type ReviewRating } from './schedule';

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

/** 返回 null 表示放弃本次写入（调用方负责给出具体原因）。 */
type Mutator = (current: readonly Mistake[]) => Mistake[] | null;

/**
 * 是否支持 Web Locks。写入一致性依赖它，因此按能力探测而不是嗅探 UA。
 * 需要安全上下文（https 或 localhost），且 API 必须真的可调用。
 */
export function supportsCrossTabLock(): boolean {
  if (typeof navigator === 'undefined') return false;
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  return typeof locks?.request === 'function';
}

export interface MistakesController {
  items: Mistake[];
  loadError: string | null;
  saveError: string | null;
  /** 不支持 Web Locks 时为只读模式，界面据此禁用写操作。 */
  canWrite: boolean;
  add: (draft: MistakeDraft) => Promise<boolean>;
  edit: (original: Mistake, draft: MistakeDraft) => Promise<boolean>;
  remove: (original: Mistake) => Promise<boolean>;
  setReviewed: (id: string, reviewed: boolean) => Promise<boolean>;
  completeRedo: (original: Mistake, rating: ReviewRating) => Promise<boolean>;
  syncPracticeResult: (
    questionId: string,
    draft: MistakeDraft,
    correct: boolean,
  ) => Promise<boolean>;
  importMistakes: (
    items: readonly Mistake[],
    mode: ImportMode,
  ) => Promise<boolean>;
  reset: () => Promise<boolean>;
}

/**
 * 错题本状态。
 *
 * 并发策略：写入前始终重新从存储读取最新列表，再做增量修改，
 * 因此其他标签页的新增/编辑/删除不会被本页的旧快照回声覆盖；
 * 同时监听 storage 事件，让其他标签页的改动即时反映到当前界面，
 * 并把「数据不可读 / 恢复可读」的变化同步到 loadError。
 * 读取失败时直接放弃写入，避免覆盖无法解析的原始数据。
 */
export function useMistakes(): MistakesController {
  const [boot] = useState<BootState>(loadMistakes);
  const [items, setItems] = useState<Mistake[]>(boot.items);
  const [loadError, setLoadError] = useState<string | null>(boot.error);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [canWrite] = useState<boolean>(() => supportsCrossTabLock());

  const locked = useCallback(
    async (action: () => boolean): Promise<boolean> => {
      if (!canWrite) {
        setSaveError(
          '当前浏览器不支持跨标签页写入锁，错题本处于只读模式，未修改数据。',
        );
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
    [canWrite],
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
      // key 为 null 表示 localStorage.clear()，同样需要重新同步
      if (event.key !== null && event.key !== MISTAKE_STORAGE_KEY) return;
      const latest = mistakeStorage.read(EMPTY_MISTAKES);
      if (latest.ok) {
        setItems(sortMistakes(latest.data.items));
        setLoadError(null);
        return;
      }
      // 其他标签页写入了不可读取的数据：同步错误状态，并保持原数据不动
      setLoadError(latest.error);
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
    async (original: Mistake): Promise<boolean> => {
      let conflict = false;
      let missing = false;
      const saved = await commit((current) => {
        const latest = current.find((item) => item.id === original.id);
        if (!latest) {
          missing = true;
          return null;
        }
        // 确认删除期间其他标签页改过这条记录：不删除新版本，要求重新确认
        if (JSON.stringify(latest) !== JSON.stringify(original)) {
          conflict = true;
          return null;
        }
        return current.filter((item) => item.id !== original.id);
      });
      if (missing) {
        setSaveError('这条错题已在其他标签页被删除。');
        return false;
      }
      if (conflict) {
        setSaveError(
          '这条错题已在其他标签页被修改，未删除。请重新确认后再试。',
        );
        return false;
      }
      return saved;
    },
    [commit],
  );

  const setReviewed = useCallback(
    async (id: string, reviewed: boolean): Promise<boolean> => {
      let missing = false;
      const saved = await commit((current) => {
        if (!current.some((item) => item.id === id)) {
          missing = true;
          return null;
        }
        return current.map((item) =>
          item.id === id ? markReviewed(item, reviewed) : item,
        );
      });
      if (missing) {
        setSaveError('这条错题已不存在，可能已在其他标签页删除。');
        return false;
      }
      return saved;
    },
    [commit],
  );

  /** 练习错题使用稳定 id，在同一把锁内去重并同步复习状态；不覆盖用户编辑的内容。 */
  const syncPracticeResult = useCallback(
    async (
      questionId: string,
      draft: MistakeDraft,
      correct: boolean,
    ): Promise<boolean> => {
      if (!/^[a-z][a-z0-9-]{0,99}$/.test(questionId)) {
        setSaveError('练习题标识不合法，未同步错题。');
        return false;
      }
      const parsed = mistakeDraftSchema.safeParse(draft);
      if (!parsed.success) {
        setSaveError('练习题内容不符合错题格式，未同步错题。');
        return false;
      }
      const id = practiceMistakeId(questionId);
      let changedQuestion = false;
      const saved = await commit((current) => {
        const existing = current.find((item) => item.id === id);
        if (!existing) {
          if (correct) return [...current];
          return [{ ...createMistake(parsed.data), id }, ...current];
        }
        if (
          existing.problem !== parsed.data.problem ||
          existing.topic !== parsed.data.topic
        ) {
          changedQuestion = true;
          return null;
        }
        const reviewed = correct;
        if ((existing.reviewedAt !== null) === reviewed) return [...current];
        return current.map((item) =>
          item.id === id ? markReviewed(item, reviewed) : item,
        );
      });
      if (changedQuestion)
        setSaveError(
          '对应错题的题目或主题已修改，未自动改变复习状态；请自行检查。',
        );
      return saved;
    },
    [commit],
  );

  const completeRedo = useCallback(
    async (original: Mistake, rating: ReviewRating): Promise<boolean> => {
      let conflict = false;
      let scheduleError = false;
      const saved = await commit((current) => {
        const latest = current.find((item) => item.id === original.id);
        if (!latest || JSON.stringify(latest) !== JSON.stringify(original)) {
          conflict = true;
          return null;
        }
        const now = Date.now();
        try {
          const schedule = nextReview(latest.schedule, rating, now);
          return current.map((item) =>
            item.id === original.id
              ? {
                  ...markReviewed(item, rating !== Rating.Again, now),
                  schedule,
                }
              : item,
          );
        } catch {
          scheduleError = true;
          return null;
        }
      });
      if (conflict)
        setSaveError(
          '这条错题已在其他标签页修改或删除，请重新打开重做，当前作答不会自动保存。',
        );
      if (scheduleError)
        setSaveError('无法计算下次复习时间，请检查系统时间与记录后重试。');
      return saved;
    },
    [commit],
  );

  const importMistakes = useCallback(
    async (
      incoming: readonly Mistake[],
      mode: ImportMode,
    ): Promise<boolean> => {
      const parsed = mistakeListSchema.safeParse({ items: incoming });
      if (!parsed.success) {
        setSaveError('导入记录格式不正确或存在重复 ID，未写入数据。');
        return false;
      }
      let overflow = 0;
      let scheduleConflict = false;
      let recordConflict = false;
      const saved = await commit((current) => {
        if (mode === 'merge') {
          const existingById = new Map(current.map((item) => [item.id, item]));
          for (const item of parsed.data.items) {
            const existing = existingById.get(item.id);
            if (!existing || item.updatedAt < existing.updatedAt) continue;
            // 没有复习历史无法证明两个不同状态存在祖先关系，不能以更新时间推断可覆盖。
            if (
              existing.schedule &&
              JSON.stringify(existing.schedule) !==
                JSON.stringify(item.schedule)
            ) {
              scheduleConflict = true;
              return null;
            }
            if (
              item.createdAt !== existing.createdAt ||
              (item.updatedAt === existing.updatedAt &&
                JSON.stringify(item) !== JSON.stringify(existing))
            ) {
              recordConflict = true;
              return null;
            }
          }
        }
        const next = resolveImport(current, parsed.data.items, mode);
        if (next.length > MISTAKE_LIMITS.items) {
          overflow = next.length;
          return null;
        }
        return next;
      });
      if (overflow > 0) {
        setSaveError(
          `导入后共 ${overflow} 条，超过本地 ${MISTAKE_LIMITS.items} 条上限，未导入任何数据。`,
        );
        return false;
      }
      if (scheduleConflict) {
        setSaveError(
          '导入记录会覆盖已有复习计划或存在不同的计划，已取消合并；请先分别备份并检查。',
        );
        return false;
      }
      if (recordConflict) {
        setSaveError(
          '同一错题 ID 的记录存在冲突，已取消合并；请先分别备份并检查。',
        );
        return false;
      }
      return saved;
    },
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

  return {
    items,
    loadError,
    saveError,
    canWrite,
    add,
    edit,
    remove,
    setReviewed,
    completeRedo,
    syncPracticeResult,
    importMistakes,
    reset,
  };
}
