import type { AnnotationItem } from './model';

/**
 * 相对上一次已落盘快照的增量改动。
 *
 * 跨标签页写入时只把「自己改了什么」应用到最新文档上，
 * 而不是把整份快照盖回去，因此不会覆盖其他标签页的笔迹。
 */
export type AnnotationChanges = {
  added: AnnotationItem[];
  removed: string[];
  updated: AnnotationItem[];
};

export function diffItems(
  base: readonly AnnotationItem[],
  next: readonly AnnotationItem[],
): AnnotationChanges {
  const baseById = new Map(base.map((item) => [item.id, item]));
  const nextById = new Map(next.map((item) => [item.id, item]));

  const added = next.filter((item) => !baseById.has(item.id));
  const removed = base
    .filter((item) => !nextById.has(item.id))
    .map((item) => item.id);
  const updated = next.filter((item) => {
    const previous = baseById.get(item.id);
    return (
      previous !== undefined &&
      JSON.stringify(previous) !== JSON.stringify(item)
    );
  });

  return { added, removed, updated };
}

/**
 * 把增量应用到最新文档：
 * - 删除只删 id 仍存在的条目，已删除的不会复活；
 * - 修改只作用于最新文档里仍存在的条目（被其他标签页删掉的不会写回）；
 * - 新增按 id 去重后追加。
 */
export function applyChanges(
  latest: readonly AnnotationItem[],
  changes: AnnotationChanges,
): AnnotationItem[] {
  const removed = new Set(changes.removed);
  const updatedById = new Map(changes.updated.map((item) => [item.id, item]));

  const result: AnnotationItem[] = [];
  for (const item of latest) {
    if (removed.has(item.id)) continue;
    result.push(updatedById.get(item.id) ?? item);
  }

  const present = new Set(result.map((item) => item.id));
  for (const item of changes.added) {
    if (!present.has(item.id)) {
      result.push(item);
      present.add(item.id);
    }
  }
  return result;
}

export function isEmptyChanges(changes: AnnotationChanges): boolean {
  return (
    changes.added.length === 0 &&
    changes.removed.length === 0 &&
    changes.updated.length === 0
  );
}
