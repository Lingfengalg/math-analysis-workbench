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
