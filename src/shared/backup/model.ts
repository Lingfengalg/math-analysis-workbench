import { z } from 'zod';

/**
 * 跨模块完整备份（#85）。
 *
 * 只做「本机导出 / 本机导入」：文件不包含密钥、账号或远程上传；各模块数据仍是原文，
 * 由各模块自己的适配器负责校验，避免这里复制业务结构。
 *
 * 浏览器 localStorage 没有跨键事务，恢复协议是「先全部校验、再逐模块写入」：
 * 写入中途失败会返回已完成与失败的模块，调用方必须提示并保留恢复前快照，
 * 不能宣称跨键原子性。
 */

export const FULL_BACKUP_FORMAT = 'math-analysis-workbench/full-backup';
export const FULL_BACKUP_VERSION = 1;

export const fullBackupSchema = z
  .object({
    format: z.literal(FULL_BACKUP_FORMAT),
    version: z.literal(FULL_BACKUP_VERSION),
    exportedAt: z.string().min(1),
    modules: z.record(z.string().min(1), z.unknown()),
  })
  .strict();

export type FullBackup = z.infer<typeof fullBackupSchema>;

export type ParseBackupResult =
  { ok: true; backup: FullBackup } | { ok: false; error: string };

/** 解析完整备份：拒绝未知格式/版本，避免把别处文件写进存储。 */
export function parseFullBackup(text: string): ParseBackupResult {
  if (text.length > 5_000_000) {
    return { ok: false, error: '备份文件过大（超过 5 MB），已拒绝。' };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: '文件不是合法的 JSON。' };
  }
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: '备份文件结构不正确。' };
  }
  const candidate = raw as Record<string, unknown>;
  if (candidate.format !== FULL_BACKUP_FORMAT) {
    return { ok: false, error: '不是本工作台的完整备份文件（格式标识不符）。' };
  }
  if (candidate.version !== FULL_BACKUP_VERSION) {
    return {
      ok: false,
      error: `备份版本不支持，当前支持版本 ${FULL_BACKUP_VERSION}。`,
    };
  }
  const parsed = fullBackupSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error:
        `备份文件结构不正确：${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}`.trim(),
    };
  }
  return { ok: true, backup: parsed.data };
}

export function createFullBackup(
  modules: Record<string, unknown>,
  now: Date = new Date(),
): FullBackup {
  return {
    format: FULL_BACKUP_FORMAT,
    version: FULL_BACKUP_VERSION,
    exportedAt: now.toISOString(),
    modules,
  };
}

export function serializeFullBackup(backup: FullBackup): string {
  return `${JSON.stringify(backup, null, 2)}\n`;
}

export function fullBackupFileName(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `math-workbench-backup-${now.getFullYear()}-${month}-${day}.json`;
}
