import { describe, expect, it } from 'vitest';
import { createAssistantLink, parseAssistantSearch } from './assistant-link';

describe('AI 助教跨模块上下文链接契约', () => {
  it('能携带知识卡片上下文与初始追问往返解析', () => {
    const context = {
      kind: 'knowledge' as const,
      id: 'derivative-lhopital',
      title: '洛必达法则：充分条件而非充要条件',
      summary: '导数比极限不存在时不能反推原极限不存在。',
      formula: "\\lim \\frac{f'(x)}{g'(x)}=L",
    };
    const link = createAssistantLink(context, '为什么导数比振荡时法则失效？');
    expect(
      parseAssistantSearch(new URLSearchParams(link.split('?')[1])),
    ).toEqual({
      context,
      prompt: '为什么导数比振荡时法则失效？',
    });
  });

  it('无参数或非法上下文安全回退', () => {
    expect(parseAssistantSearch(new URLSearchParams())).toEqual({
      context: undefined,
      prompt: undefined,
    });
    expect(
      parseAssistantSearch(new URLSearchParams('ctxKind=bad&q=测试问题')),
    ).toEqual({
      context: undefined,
      prompt: '测试问题',
    });
  });
});
