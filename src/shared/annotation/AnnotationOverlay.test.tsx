import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnnotationOverlay } from './AnnotationOverlay';

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
