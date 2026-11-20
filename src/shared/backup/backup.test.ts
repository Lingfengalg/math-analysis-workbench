import { describe, expect, it } from 'vitest';
import {
  createFullBackup,
  FULL_BACKUP_FORMAT,
  FULL_BACKUP_VERSION,
  parseFullBackup,
  serializeFullBackup,
} from './model';
import { applyRestore, planRestore, type BackupModuleAdapter } from './restore';

const makeAdapter = (
  id: string,
  options: { failRestore?: boolean; invalid?: boolean } = {},
): BackupModuleAdapter => {
  let value: unknown = { seed: id };
  return {
    id,
    label: id,
    read: () => ({ ok: true, data: value }),
    validate: (data) =>
      options.invalid ? '校验失败' : data === undefined ? '缺少数据' : null,
    restore: (data) => {
      if (options.failRestore) return '写入失败';
      value = data;
      return null;
    },
  };
};

describe('完整备份格式（#85）', () => {
  it('导出包含格式、版本、时间与模块数据', () => {
    const backup = createFullBackup(
      { mistakes: { items: [] } },
      new Date('2026-11-21T00:00:00Z'),
    );
    expect(backup.format).toBe(FULL_BACKUP_FORMAT);
    expect(backup.version).toBe(FULL_BACKUP_VERSION);
    expect(backup.exportedAt).toBe('2026-11-21T00:00:00.000Z');
    const parsed = parseFullBackup(serializeFullBackup(backup));
    expect(parsed.ok).toBe(true);
  });

  it('拒绝非 JSON、格式不符与未知版本', () => {
    expect(parseFullBackup('not json').ok).toBe(false);
    expect(parseFullBackup(JSON.stringify({ format: 'other' })).ok).toBe(false);
    expect(
      parseFullBackup(
        JSON.stringify({
          format: FULL_BACKUP_FORMAT,
          version: 99,
          exportedAt: 'x',
          modules: {},
        }),
      ).ok,
    ).toBe(false);
  });

  it('拒绝超大文件', () => {
    expect(parseFullBackup('x'.repeat(5_000_001)).ok).toBe(false);
  });
});

describe('恢复计划与执行（#85）', () => {
  it('先校验：任一模块不合法则不进入 ready', () => {
    const backup = createFullBackup({ good: { a: 1 }, bad: { b: 2 } });
    const plan = planRestore(
      backup,
      [makeAdapter('good'), makeAdapter('bad', { invalid: true })],
      ['good', 'bad'],
    );
    expect(plan.ready.map((adapter) => adapter.id)).toEqual(['good']);
    expect(plan.invalid.map((item) => item.id)).toEqual(['bad']);
  });

  it('备份缺少的模块与未知模块分别记录', () => {
    const backup = createFullBackup({ known: 1, future: 2 });
    const plan = planRestore(
      backup,
      [makeAdapter('known'), makeAdapter('absent')],
      ['known', 'absent'],
    );
    expect(plan.missing.map((item) => item.id)).toEqual(['absent']);
    expect(plan.unknown).toEqual(['future']);
  });

  it('逐模块写入并在失败时停止，返回已恢复与快照', () => {
    const backup = createFullBackup({ a: { v: 1 }, b: { v: 2 } });
    const plan = planRestore(
      backup,
      [makeAdapter('a'), makeAdapter('b', { failRestore: true })],
      ['a', 'b'],
    );
    const result = applyRestore(plan, backup);
    expect(result.restored).toEqual(['a']);
    expect(result.failed[0].id).toBe('b');
    expect(result.snapshot.a).toEqual({ seed: 'a' });
  });
});
