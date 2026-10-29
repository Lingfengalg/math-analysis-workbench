import { describe, expect, it } from 'vitest';
import { createMistake, type MistakeDraft } from './model';
import {
  createExportFile,
  exportFileName,
  MISTAKE_EXPORT_FORMAT,
  mergeMistakes,
  parseExport,
  resolveImport,
  serializeExport,
} from './transfer';

const draft: MistakeDraft = {
  title: '极限存在的条件',
  topic: 'limit',
  problem: '写出极限存在的判定条件。',
  mistakeReason: '把必要性当成充分性。',
  correction: '先验证左右极限都存在且相等。',
};

const sample = createMistake(draft, 1000);

function fileWith(items: unknown[], overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    format: MISTAKE_EXPORT_FORMAT,
    version: 1,
    exportedAt: '2026-10-29T00:00:00.000Z',
    items,
    ...overrides,
  });
}

describe('错题导出文件', () => {
  it('包含格式标识、版本、导出时间与条目', () => {
    const file = createExportFile([sample], new Date('2026-10-29T02:00:00Z'));
    expect(file.format).toBe(MISTAKE_EXPORT_FORMAT);
    expect(file.version).toBe(1);
    expect(file.exportedAt).toBe('2026-10-29T02:00:00.000Z');
    expect(file.items).toHaveLength(1);
    expect(file.items[0].title).toBe('极限存在的条件');
  });

  it('文件名带日期', () => {
    expect(exportFileName(new Date(2026, 9, 29))).toBe(
      'mistakes-2026-10-29.json',
    );
  });

  it('序列化结果可以重新解析', () => {
    const text = serializeExport(createExportFile([sample]));
    const result = parseExport(text);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.items[0].id).toBe(sample.id);
  });
});

describe('导入校验', () => {
  it('非法 JSON 给出明确错误', () => {
    expect(parseExport('not json')).toEqual({
      ok: false,
      error: '文件不是合法的 JSON。',
    });
  });

  it('格式标识不符时拒绝', () => {
    const result = parseExport(fileWith([sample], { format: 'other/file' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('格式标识不符');
  });

  it('版本不支持时拒绝', () => {
    const result = parseExport(fileWith([sample], { version: 2 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('版本不支持');
  });

  it('字段缺失时给出结构错误', () => {
    const result = parseExport(fileWith([{ id: 'broken' }]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('不符合错题结构');
  });

  it('文件内重复 id 时拒绝', () => {
    const result = parseExport(fileWith([sample, sample]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('重复');
  });

  it('超过条数上限时拒绝', () => {
    const items = Array.from({ length: 201 }, (_, index) =>
      createMistake(draft, 1000 + index),
    );
    const result = parseExport(fileWith(items));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('最多 200 条');
  });
});

describe('导入策略', () => {
  const older: typeof sample = {
    ...sample,
    id: 'shared',
    title: '旧版本',
    updatedAt: 1000,
  };
  const newer: typeof sample = {
    ...sample,
    id: 'shared',
    title: '新版本',
    updatedAt: 2000,
  };

  it('合并时按 id 去重并保留更新时间较新的一条', () => {
    const merged = mergeMistakes([older], [newer]);
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe('新版本');
  });

  it('合并时保留现有记录并追加新记录', () => {
    const incoming = { ...sample, id: 'incoming', title: '导入的记录' };
    const merged = mergeMistakes([sample], [incoming]);
    expect(merged.map((item) => item.title).sort()).toEqual([
      '导入的记录',
      '极限存在的条件',
    ]);
  });

  it('替换策略只保留文件内容', () => {
    const incoming = { ...sample, id: 'incoming', title: '导入的记录' };
    const replaced = resolveImport([sample], [incoming], 'replace');
    expect(replaced).toHaveLength(1);
    expect(replaced[0].title).toBe('导入的记录');
  });

  it('合并策略不会修改传入数组', () => {
    const current = [sample];
    mergeMistakes(current, [{ ...sample, id: 'extra' }]);
    expect(current).toHaveLength(1);
  });
});
