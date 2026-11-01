import { describe, expect, it } from 'vitest';
import {
  annotationDocSchema,
  annotationItemSchema,
  cloneItems,
  emptyDoc,
} from './model';

describe('annotation model', () => {
  it('接受合法的笔迹与文字', () => {
    const stroke = {
      kind: 'stroke',
      id: 's1',
      color: '#dc2626',
      width: 4,
      points: [{ x: 0.1, y: 0.2 }],
    };
    const text = {
      kind: 'text',
      id: 't1',
      color: '#2563eb',
      x: 0.3,
      y: 0.4,
      text: '这里容易错',
    };

    expect(annotationItemSchema.parse(stroke)).toEqual(stroke);
    expect(annotationItemSchema.parse(text)).toEqual(text);
  });

  it('拒绝非法颜色、空笔迹与缺少坐标的条目', () => {
    expect(() =>
      annotationItemSchema.parse({
        kind: 'stroke',
        id: 's1',
        color: 'red',
        width: 4,
        points: [{ x: 0.1, y: 0.2 }],
      }),
    ).toThrow();

    expect(() =>
      annotationItemSchema.parse({
        kind: 'stroke',
        id: 's1',
        color: '#000000',
        width: 4,
        points: [],
      }),
    ).toThrow();

    expect(() =>
      annotationItemSchema.parse({
        kind: 'text',
        id: 't1',
        color: '#000000',
        text: '缺坐标',
      }),
    ).toThrow();
  });

  it('拒绝空白文字', () => {
    expect(() =>
      annotationItemSchema.parse({
        kind: 'text',
        id: 't1',
        color: '#000000',
        x: 0,
        y: 0,
        text: '',
      }),
    ).toThrow();
  });

  it('文档为空时可用', () => {
    const doc = emptyDoc('/knowledge');
    expect(annotationDocSchema.parse(doc)).toEqual({
      pageId: '/knowledge',
      items: [],
    });
  });

  it('cloneItems 深拷贝点数组，避免撤销快照被后续绘制污染', () => {
    const items = [
      {
        kind: 'stroke' as const,
        id: 's1',
        color: '#000000',
        width: 2,
        points: [{ x: 0.1, y: 0.1 }],
      },
    ];
    const copy = cloneItems(items);
    const copied = copy[0];
    if (copied.kind === 'stroke') copied.points.push({ x: 0.9, y: 0.9 });

    const original = items[0];
    expect(original.kind === 'stroke' ? original.points.length : 0).toBe(1);
  });
});

describe('批注上限边界 (#36)', () => {
  const stroke = (pointCount: number) => ({
    kind: 'stroke' as const,
    id: 's1',
    color: '#dc2626',
    width: 4,
    points: Array.from({ length: pointCount }, (_, index) => ({
      x: index / pointCount,
      y: 0.5,
    })),
  });
  const text = (length: number) => ({
    kind: 'text' as const,
    id: 't1',
    color: '#1f2937',
    x: 0.1,
    y: 0.1,
    text: 'x'.repeat(length),
  });

  it('文字 500 允许、501 拒绝', () => {
    expect(annotationItemSchema.safeParse(text(500)).success).toBe(true);
    expect(annotationItemSchema.safeParse(text(501)).success).toBe(false);
  });

  it('单笔 4000 点允许、4001 拒绝', () => {
    expect(annotationItemSchema.safeParse(stroke(4000)).success).toBe(true);
    expect(annotationItemSchema.safeParse(stroke(4001)).success).toBe(false);
  });

  it('每页 2000 条允许、2001 拒绝', () => {
    const doc = (count: number) => ({
      pageId: '/knowledge',
      items: Array.from({ length: count }, () => text(1)),
    });
    expect(annotationDocSchema.safeParse(doc(2000)).success).toBe(true);
    expect(annotationDocSchema.safeParse(doc(2001)).success).toBe(false);
  });
});
