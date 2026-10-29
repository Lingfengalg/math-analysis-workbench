import { createStorage } from '@/shared/storage';
import { annotationDocSchema, emptyDoc, type AnnotationDoc } from './model';

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
