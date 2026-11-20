import { z } from 'zod';
import { annotationDocSchema } from '@/shared/annotation/model';
import {
  ANNOTATION_KEY_PREFIX,
  annotationStorage,
} from '@/shared/annotation/storage';
import type { BackupModuleAdapter } from '@/shared/backup/restore';

/**
 * 批注模块的完整备份适配器（#85）。
 *
 * 批注按页面分键存储，这里导出「页面 id → 文档」的映射；恢复时逐页写回。
 * 只读取带批注前缀的键，不触碰其他模块数据。
 */

const pagesSchema = z.record(z.string().min(1), annotationDocSchema);

function readAllPages():
  { ok: true; data: unknown } | { ok: false; error: string } {
  try {
    const pages: Record<string, unknown> = {};
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || !key.startsWith(ANNOTATION_KEY_PREFIX)) continue;
      const pageId = key.slice(ANNOTATION_KEY_PREFIX.length);
      const stored = annotationStorage(pageId).read({ pageId, items: [] });
      if (!stored.ok) {
        return {
          ok: false,
          error: `第 ${pageId} 页批注无法读取：${stored.error}`,
        };
      }
      pages[pageId] = stored.data;
    }
    return { ok: true, data: pages };
  } catch {
    return { ok: false, error: '浏览器存储不可用，无法读取批注。' };
  }
}

export const annotationBackupAdapter: BackupModuleAdapter = {
  id: 'annotations',
  label: '批注（按页面）',
  read: readAllPages,
  validate: (data) => {
    const parsed = pagesSchema.safeParse(data);
    if (!parsed.success) {
      return `批注数据不符合结构：${parsed.error.issues[0]?.message ?? ''}`.trim();
    }
    return null;
  },
  restore: (data) => {
    const parsed = pagesSchema.safeParse(data);
    if (!parsed.success) return '批注数据不符合结构，未写入。';
    for (const [pageId, doc] of Object.entries(parsed.data)) {
      const written = annotationStorage(pageId).write(doc);
      if (!written.ok) return `第 ${pageId} 页批注写入失败：${written.error}`;
    }
    return null;
  },
};
