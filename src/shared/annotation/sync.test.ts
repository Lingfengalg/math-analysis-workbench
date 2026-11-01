import { describe, expect, it } from 'vitest';
import type { AnnotationItem } from './model';
import { applyChanges, diffItems, isEmptyChanges } from './sync';

const stroke = (id: string, x = 0.1): AnnotationItem => ({
  kind: 'stroke',
  id,
  color: '#dc2626',
  width: 4,
  points: [
    { x, y: 0.1 },
    { x: x + 0.1, y: 0.2 },
  ],
});

const text = (id: string, value: string): AnnotationItem => ({
  kind: 'text',
  id,
  color: '#1f2937',
  x: 0.3,
  y: 0.3,
  text: value,
});

describe('diffItems', () => {
  it('区分新增、删除与修改', () => {
    const base = [stroke('a'), text('b', '旧')];
    const next = [stroke('a', 0.5), text('b', '新'), text('c', '新增')];
    const changes = diffItems(base, next);
    expect(changes.added.map((item) => item.id)).toEqual(['c']);
    expect(changes.removed).toEqual([]);
    expect(changes.updated.map((item) => item.id)).toEqual(['a', 'b']);
    expect(isEmptyChanges(changes)).toBe(false);
  });

  it('删除只记录 id', () => {
    const changes = diffItems([stroke('a'), stroke('b')], [stroke('b')]);
    expect(changes.removed).toEqual(['a']);
    expect(isEmptyChanges(changes)).toBe(false);
  });

  it('没有变化时判定为空', () => {
    expect(isEmptyChanges(diffItems([stroke('a')], [stroke('a')]))).toBe(true);
  });
});

describe('applyChanges', () => {
  it('保留其他标签页新增的条目', () => {
    const latest = [stroke('other')];
    const merged = applyChanges(latest, {
      added: [stroke('mine')],
      removed: [],
      updated: [],
    });
    expect(merged.map((item) => item.id).sort()).toEqual(['mine', 'other']);
  });

  it('已删除的条目不会被旧页面的修改复活', () => {
    const merged = applyChanges([], {
      added: [],
      removed: [],
      updated: [text('gone', '旧页面里的修改')],
    });
    expect(merged).toHaveLength(0);
  });

  it('删除只影响仍存在的条目', () => {
    const merged = applyChanges([stroke('a'), stroke('b')], {
      added: [],
      removed: ['a', 'missing'],
      updated: [],
    });
    expect(merged.map((item) => item.id)).toEqual(['b']);
  });

  it('同一 id 的修改覆盖最新值，但不重复追加', () => {
    const merged = applyChanges([text('t', '旧')], {
      added: [text('t', '新增重复')],
      removed: [],
      updated: [text('t', '新')],
    });
    expect(merged).toHaveLength(1);
    expect((merged[0] as { text: string }).text).toBe('新');
  });
});
