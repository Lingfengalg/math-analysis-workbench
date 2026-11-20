import { createStorage } from '@/shared/storage';
import { preferencesSchema } from '@/shared/contracts';
import type { BackupModuleAdapter } from '@/shared/backup/restore';
import {
  EMPTY_PLOT_HISTORY,
  plotHistorySchema,
  plotHistoryStorage,
} from './history';

const preferences = createStorage('preferences', preferencesSchema);

/** 绘图默认设置与最近绘制的完整备份适配器（#85）。 */
export const preferencesBackupAdapter: BackupModuleAdapter = {
  id: 'preferences',
  label: '绘图默认设置',
  read: () => {
    // 无数据时返回 null 而不是空对象，恢复时按「没有该模块」处理
    const raw = window.localStorage.getItem('math-workbench:preferences');
    if (raw === null) return { ok: true, data: null };
    const result = preferences.read({
      defaultPlot: { expression: 'x^2', xMin: -5, xMax: 5 },
    });
    return result.ok
      ? { ok: true, data: result.data }
      : { ok: false, error: result.error };
  },
  validate: (data) =>
    data === null || preferencesSchema.safeParse(data).success
      ? null
      : '绘图默认设置不符合结构',
  restore: (data) => {
    if (data === null) return null;
    const parsed = preferencesSchema.safeParse(data);
    if (!parsed.success) return '绘图默认设置不符合结构，未写入。';
    const written = preferences.write(parsed.data);
    return written.ok ? null : written.error;
  },
};

export const plotHistoryBackupAdapter: BackupModuleAdapter = {
  id: 'plotHistory',
  label: '最近绘制记录',
  read: () => {
    const result = plotHistoryStorage.read(EMPTY_PLOT_HISTORY);
    return result.ok
      ? { ok: true, data: result.data }
      : { ok: false, error: result.error };
  },
  validate: (data) =>
    plotHistorySchema.safeParse(data).success ? null : '最近绘制记录不符合结构',
  restore: (data) => {
    const parsed = plotHistorySchema.safeParse(data);
    if (!parsed.success) return '最近绘制记录不符合结构，未写入。';
    const written = plotHistoryStorage.write(parsed.data);
    return written.ok ? null : written.error;
  },
};
