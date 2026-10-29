import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAllAnnotations,
  clearAnnotation,
  loadAnnotation,
  saveAnnotation,
} from './storage';
import type { AnnotationItem } from './model';

const stroke: AnnotationItem = {
  kind: 'stroke',
  id: 's1',
  color: '#dc2626',
  width: 4,
  points: [
    { x: 0.1, y: 0.2 },
    { x: 0.3, y: 0.4 },
  ],
};

describe('annotation storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('按页面分别保存与读取', () => {
    expect(
      saveAnnotation({ pageId: '/knowledge', items: [stroke] }),
    ).toBeNull();

    const knowledge = loadAnnotation('/knowledge');
    expect(knowledge.error).toBeUndefined();
    expect(knowledge.doc.items).toHaveLength(1);

    const plotting = loadAnnotation('/plotting');
    expect(plotting.doc.items).toHaveLength(0);
  });

  it('数据损坏时返回错误并回退为空文档，不抛异常', () => {
    window.localStorage.setItem(
      'math-workbench:annotation:/knowledge',
      '{not-json',
    );

    const { doc, error } = loadAnnotation('/knowledge');
    expect(error).toBeTruthy();
    expect(doc.items).toEqual([]);
  });

  it('结构不符合约定时同样视为损坏', () => {
    window.localStorage.setItem(
      'math-workbench:annotation:/knowledge',
      JSON.stringify({
        schemaVersion: 1,
        data: { pageId: '/knowledge', items: [{ kind: 'stroke' }] },
      }),
    );

    const { error } = loadAnnotation('/knowledge');
    expect(error).toBeTruthy();
  });

  it('clearAnnotation 只清除指定页面', () => {
    saveAnnotation({ pageId: '/knowledge', items: [stroke] });
    saveAnnotation({ pageId: '/plotting', items: [stroke] });

    expect(clearAnnotation('/knowledge')).toBeNull();
    expect(loadAnnotation('/knowledge').doc.items).toHaveLength(0);
    expect(loadAnnotation('/plotting').doc.items).toHaveLength(1);
  });
});

describe('clearAllAnnotations', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('只删除批注键，保留其他模块数据', () => {
    saveAnnotation({ pageId: '/knowledge', items: [stroke] });
    saveAnnotation({ pageId: '/plotting', items: [stroke] });
    window.localStorage.setItem(
      'math-workbench:preferences',
      '{"schemaVersion":1,"data":{}}',
    );

    expect(clearAllAnnotations()).toBeNull();
    expect(
      window.localStorage.getItem('math-workbench:annotation:/knowledge'),
    ).toBeNull();
    expect(
      window.localStorage.getItem('math-workbench:annotation:/plotting'),
    ).toBeNull();
    expect(
      window.localStorage.getItem('math-workbench:preferences'),
    ).not.toBeNull();
  });
});
