import type { BackupModuleAdapter } from '@/shared/backup/restore';
import { EMPTY_MISTAKES, mistakeListSchema, mistakeStorage } from './model';
import {
  emptyProgress,
  practiceStorage,
  progressSchema,
} from './practice/progress';

/** 错题本与练习记录的完整备份适配器（#85）；两者是不同存储，分开恢复。 */
export const mistakesBackupAdapter: BackupModuleAdapter = {
  id: 'mistakes',
  label: '错题本',
  read: () => {
    const result = mistakeStorage.read(EMPTY_MISTAKES);
    return result.ok
      ? { ok: true, data: result.data }
      : { ok: false, error: result.error };
  },
  validate: (data) =>
    mistakeListSchema.safeParse(data).success
      ? null
      : '错题数据不符合结构或存在重复 ID',
  restore: (data) => {
    const parsed = mistakeListSchema.safeParse(data);
    if (!parsed.success) return '错题数据不符合结构，未写入。';
    const written = mistakeStorage.write(parsed.data);
    return written.ok ? null : written.error;
  },
};

export const practiceBackupAdapter: BackupModuleAdapter = {
  id: 'practice',
  label: '练习记录',
  read: () => {
    const result = practiceStorage.read(emptyProgress);
    return result.ok
      ? { ok: true, data: result.data }
      : { ok: false, error: result.error };
  },
  validate: (data) =>
    progressSchema.safeParse(data).success
      ? null
      : '练习记录不符合结构或超过上限',
  restore: (data) => {
    const parsed = progressSchema.safeParse(data);
    if (!parsed.success) return '练习记录不符合结构，未写入。';
    const written = practiceStorage.write(parsed.data);
    return written.ok ? null : written.error;
  },
};
