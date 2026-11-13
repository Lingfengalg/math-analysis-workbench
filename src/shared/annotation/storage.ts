import { createStorage } from '@/shared/storage';
import { annotationDocSchema, emptyDoc, type AnnotationDoc } from './model';

/** 与 shared/storage 的键前缀拼接后，用于识别所有批注文档。 */
export const ANNOTATION_KEY_PREFIX = 'math-workbench:annotation:';

/** 每个页面一份独立文档，键名由 shared/storage 统一加前缀并包版本信封。 */
export function annotationStorage(pageId: string) {
  return createStorage<AnnotationDoc>(
    `annotation:${pageId}`,
    annotationDocSchema,
  );
}

export type LoadedAnnotation = {
  doc: AnnotationDoc;
  error?: string;
};

/**
 * 读取批注。数据损坏或版本不兼容时如实返回错误，交给界面提示，
 * 不静默覆盖用户原有数据。
 */
export function loadAnnotation(pageId: string): LoadedAnnotation {
  const result = annotationStorage(pageId).read(emptyDoc(pageId));
  if (result.ok) return { doc: result.data };
  return { doc: emptyDoc(pageId), error: result.error };
}

export function saveAnnotation(doc: AnnotationDoc): string | null {
  const result = annotationStorage(doc.pageId).write(doc);
  return result.ok ? null : result.error;
}

export function clearAnnotation(pageId: string): string | null {
  const result = annotationStorage(pageId).clear();
  return result.ok ? null : result.error;
}

/**
 * 清空所有页面的批注。
 *
 * 只删除带批注前缀的键，不调用 `localStorage.clear()`，因此不会动到
 * 绘图默认设置、错题本等其他模块的数据。列举键必须直接访问 localStorage，
 * 这是批注存储适配层唯一合理的例外。
 */
export function clearAllAnnotations(): string | null {
  try {
    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key && key.startsWith(ANNOTATION_KEY_PREFIX)) keys.push(key);
    }
    for (const key of keys) window.localStorage.removeItem(key);
    return null;
  } catch {
    return '清除全部批注失败：浏览器存储不可用。';
  }
}

/** 清空标记：键名独立于文档键，清空后仍然保留，用来识别「清空发生在某次快照之后」。 */
export const ANNOTATION_CLEARED_PREFIX = 'math-workbench:annotation-cleared:';

function clearedKey(pageId: string): string {
  return `${ANNOTATION_CLEARED_PREFIX}${pageId}`;
}

/** 读取某页最近一次清空时间；没有清空过返回 0。 */
export function readClearedAt(pageId: string): number {
  try {
    const raw = window.localStorage.getItem(clearedKey(pageId));
    const value = raw ? Number(raw) : 0;
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

/** 记录一次清空（单页或全部清空时对各页调用）。失败时返回错误文案。 */
export function markCleared(pageId: string, at: number): string | null {
  try {
    window.localStorage.setItem(clearedKey(pageId), String(at));
    return null;
  } catch {
    return '记录清空时间失败：浏览器存储不可用。';
  }
}

/** 列出当前存在批注文档的页面 id，供「清空全部」逐个打清空标记。 */
export function listAnnotationPages(): string[] {
  try {
    const pages: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || !key.startsWith(ANNOTATION_KEY_PREFIX)) continue;
      pages.push(key.slice(ANNOTATION_KEY_PREFIX.length));
    }
    return pages;
  } catch {
    return [];
  }
}
