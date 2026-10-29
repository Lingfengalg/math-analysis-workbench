import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnnotationOverlay } from './AnnotationOverlay';
import { saveAnnotation } from './storage';
import type { AnnotationItem } from './model';

function canvas(): HTMLCanvasElement {
  const element = document.querySelector(
    'canvas[data-annotation-canvas="true"]',
  );
  if (!element) throw new Error('批注画布未挂载');
  return element as HTMLCanvasElement;
}

function renderOverlay(pageId = '/knowledge') {
  return render(
    <AnnotationOverlay pageId={pageId}>
      <p>知识点内容</p>
    </AnnotationOverlay>,
  );
}

describe('AnnotationOverlay', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('默认关闭：内容可见，画布不拦截指针事件', () => {
    renderOverlay();

    expect(screen.getByText('知识点内容')).toBeInTheDocument();
    expect(canvas().style.pointerEvents).toBe('none');
  });

  it('点击「批注」进入批注模式并显示工具面板', async () => {
    const user = userEvent.setup();
    renderOverlay();

    await user.click(screen.getByRole('button', { name: /批注$/ }));

    expect(
      screen.getByRole('button', { name: /退出批注$/ }),
    ).toBeInTheDocument();
    expect(canvas().style.pointerEvents).toBe('auto');
    expect(screen.getByText(/当前：画笔/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '黑色' })).toBeInTheDocument();
  });

  it('批注模式下可用快捷键切换工具', async () => {
    const user = userEvent.setup();
    renderOverlay();

    await user.click(screen.getByRole('button', { name: /批注$/ }));
    await user.keyboard('e');

    expect(screen.getByText(/当前：橡皮/)).toBeInTheDocument();
  });

  it('切换页面时按 pageId 重新加载批注', () => {
    const { rerender } = renderOverlay('/knowledge');
    rerender(
      <AnnotationOverlay pageId="/plotting">
        <p>绘图内容</p>
      </AnnotationOverlay>,
    );

    expect(screen.getByText('绘图内容')).toBeInTheDocument();
    expect(canvas()).toBeInTheDocument();
  });

  it('数据不可读时提示并暂停保存，不覆盖原有数据', async () => {
    const user = userEvent.setup();
    const key = 'math-workbench:annotation:/knowledge';
    window.localStorage.setItem(key, '{broken');

    renderOverlay();
    await user.click(screen.getByRole('button', { name: /批注$/ }));

    expect(screen.getByText(/已暂停自动保存/)).toBeInTheDocument();
    expect(window.localStorage.getItem(key)).toBe('{broken');
  });
});

describe('清空全部批注', () => {
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

  beforeEach(() => {
    window.localStorage.clear();
    // Popconfirm 依赖 rc-resize-observer；jsdom 没有该 API
    if (!('ResizeObserver' in globalThis)) {
      Object.defineProperty(globalThis, 'ResizeObserver', {
        writable: true,
        value: class {
          observe(): void {}
          unobserve(): void {}
          disconnect(): void {}
        },
      });
    }
  });

  it('删除所有页面的批注键并提示结果', async () => {
    const user = userEvent.setup();
    saveAnnotation({ pageId: '/knowledge', items: [stroke] });
    saveAnnotation({ pageId: '/plotting', items: [stroke] });
    renderOverlay();
    await user.click(screen.getByRole('button', { name: /批注$/ }));

    await user.click(screen.getByRole('button', { name: /清空全部/ }));
    await user.click(screen.getByRole('button', { name: '全部清空' }));

    await waitFor(() =>
      expect(
        window.localStorage.getItem('math-workbench:annotation:/knowledge'),
      ).toBeNull(),
    );
    expect(
      window.localStorage.getItem('math-workbench:annotation:/plotting'),
    ).toBeNull();
    expect(screen.getByText('已清空全部页面的批注。')).toBeInTheDocument();
  });
});
