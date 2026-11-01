/**
 * 基于快照的撤销 / 重做。
 *
 * 批注文档体积很小（一笔最多几千个点），快照比逐个写逆操作更不容易出错，
 * 也天然覆盖「按笔画删除」这种一次移除多个元素的操作。
 */
export type History<T> = {
  reset(initial: T): void;
  record(next: T): void;
  undo(): T | null;
  redo(): T | null;
  canUndo(): boolean;
  canRedo(): boolean;
};

export function createHistory<T>(limit = 60): History<T> {
  let past: T[] = [];
  let future: T[] = [];

  return {
    reset(initial: T) {
      past = [initial];
      future = [];
    },

    record(next: T) {
      past.push(next);
      if (past.length > limit) past.shift();
      future = [];
    },

    undo(): T | null {
      if (past.length <= 1) return null;
      const current = past.pop() as T;
      future.push(current);
      return past[past.length - 1];
    },

    redo(): T | null {
      const next = future.pop();
      if (next === undefined) return null;
      past.push(next);
      return next;
    },

    canUndo(): boolean {
      return past.length > 1;
    },

    canRedo(): boolean {
      return future.length > 0;
    },
  };
}
