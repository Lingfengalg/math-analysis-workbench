import { z } from 'zod';
import { MISTAKE_LIMITS, mistakeSchema, type Mistake } from './model';

export const MISTAKE_EXPORT_FORMAT = 'math-analysis-workbench/mistakes';
export const MISTAKE_EXPORT_VERSION = 1;

/** 导出文件格式。与存储信封分开，便于以后单独升级导入格式。 */
export const exportFileSchema = z.object({
  format: z.literal(MISTAKE_EXPORT_FORMAT),
  version: z.literal(MISTAKE_EXPORT_VERSION),
  exportedAt: z.string().min(1),
  items: z
    .array(mistakeSchema)
    .max(MISTAKE_LIMITS.items, `文件内最多 ${MISTAKE_LIMITS.items} 条错题`),
});

export type MistakeExportFile = z.infer<typeof exportFileSchema>;

export type ImportMode = 'merge' | 'replace';

export type ImportResult =
  { ok: true; items: Mistake[] } | { ok: false; error: string };

export function createExportFile(
  items: readonly Mistake[],
  now: Date = new Date(),
): MistakeExportFile {
  return {
    format: MISTAKE_EXPORT_FORMAT,
    version: MISTAKE_EXPORT_VERSION,
    exportedAt: now.toISOString(),
    items: [...items],
  };
}

export function exportFileName(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `mistakes-${now.getFullYear()}-${month}-${day}.json`;
}

export function serializeExport(file: MistakeExportFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

function describeSchemaIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return '文件内容不符合错题结构。';
  const where = issue.path.join('.');
  return `文件内容不符合错题结构：${where ? `${where} ` : ''}${issue.message}`;
}

export function parseExport(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: '文件不是合法的 JSON。' };
  }

  const parsed = exportFileSchema.safeParse(raw);
  if (!parsed.success) {
    if (typeof raw === 'object' && raw !== null) {
      const candidate = raw as Record<string, unknown>;
      if (candidate.format !== MISTAKE_EXPORT_FORMAT) {
        return {
          ok: false,
          error: '文件不是本工作台导出的错题文件（格式标识不符）。',
        };
      }
      if (candidate.version !== MISTAKE_EXPORT_VERSION) {
        return {
          ok: false,
          error: `文件版本不支持，当前仅支持版本 ${MISTAKE_EXPORT_VERSION}。`,
        };
      }
    }
    return { ok: false, error: describeSchemaIssue(parsed.error) };
  }

  const ids = new Set<string>();
  for (const item of parsed.data.items) {
    if (ids.has(item.id)) {
      return { ok: false, error: '文件内存在重复的错题 id，无法导入。' };
    }
    ids.add(item.id);
  }
  return { ok: true, items: parsed.data.items };
}

/** 合并策略：同 id 保留 updatedAt 较新的一条，不产生重复记录。 */
export function mergeMistakes(
  current: readonly Mistake[],
  incoming: readonly Mistake[],
): Mistake[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) {
    const existing = byId.get(item.id);
    if (!existing || item.updatedAt >= existing.updatedAt) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()];
}

export function resolveImport(
  current: readonly Mistake[],
  incoming: readonly Mistake[],
  mode: ImportMode,
): Mistake[] {
  return mode === 'replace' ? [...incoming] : mergeMistakes(current, incoming);
}
