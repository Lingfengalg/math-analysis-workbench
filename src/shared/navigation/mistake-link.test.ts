import { describe, expect, it } from 'vitest';
import {
  createMistakeDraftLink,
  parseMistakeDraftSearch,
} from './mistake-link';

describe('错题草稿跨模块链接契约', () => {
  it('能携带主题、关联卡片与反例函数信息跳转', () => {
    const draft = {
      topic: 'derivative' as const,
      relatedKnowledgeId: 'derivative-absolute',
      title: '连续与可导混淆',
      expression: 'abs(x)',
      xMin: -3,
      xMax: 3,
    };
    const link = createMistakeDraftLink(draft);
    expect(
      parseMistakeDraftSearch(new URLSearchParams(link.split('?')[1])),
    ).toEqual(draft);
  });

  it('非草稿链接返回 null，非法字段自动过滤', () => {
    expect(parseMistakeDraftSearch(new URLSearchParams())).toBeNull();
    expect(
      parseMistakeDraftSearch(
        new URLSearchParams(
          'draft=1&topic=bad&relatedKnowledgeId=BAD!&xMin=5&xMax=1',
        ),
      ),
    ).toEqual({});
  });
});
