import { annotationBackupAdapter } from '@/shared/annotation/backup';
import type { BackupModuleAdapter } from '@/shared/backup/restore';
import {
  mistakesBackupAdapter,
  practiceBackupAdapter,
} from '@/features/mistakes/backup';
import {
  plotHistoryBackupAdapter,
  preferencesBackupAdapter,
} from '@/features/plotting/backup';

/**
 * 完整备份的模块清单（#85）。
 *
 * 单独成文件并由 `moduleRegistry` 动态导入：适配器会连带引入错题本、练习记录、
 * 批注和绘图设置的存储代码，静态放进 index chunk 会撑大首屏。
 */
export const backupAdapters: readonly BackupModuleAdapter[] = [
  mistakesBackupAdapter,
  practiceBackupAdapter,
  annotationBackupAdapter,
  preferencesBackupAdapter,
  plotHistoryBackupAdapter,
];
