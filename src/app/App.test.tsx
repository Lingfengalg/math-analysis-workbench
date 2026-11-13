import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { App } from './App';

vi.mock('@/shared/annotation/AnnotationOverlay', () => ({
  AnnotationOverlay: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/features/knowledge', () => ({
  default: () => <h1>知识页测试入口</h1>,
}));
vi.mock('@/features/plotting', () => ({
  default: () => <h1>绘图页测试入口</h1>,
}));
vi.mock('@/features/mistakes', () => ({
  default: () => <h1>错题页测试入口</h1>,
}));

beforeEach(() => {
  window.location.hash = '#/';
  vi.stubGlobal('scrollTo', vi.fn());
});

describe('路由、导航和首页模块入口', () => {
  it('首页展示每个学习工具及其真实状态，并可通过首页和侧栏访问', async () => {
    render(<App />);
    const tools = await screen.findByRole('region', { name: '学习工具' });
    const toolLinks = within(tools).getAllByRole('link');
    expect(toolLinks).toHaveLength(4);
    expect(
      within(tools).getByRole('link', { name: /AI 助教/ }),
    ).toHaveTextContent('待开发');
    expect(
      within(tools).getByRole('link', { name: /绘图计算/ }),
    ).toHaveTextContent('示例可用');
    fireEvent.click(within(tools).getByRole('link', { name: /绘图计算/ }));
    expect(
      await screen.findByRole('heading', { name: '绘图页测试入口' }),
    ).toBeVisible();
    expect(window.location.hash).toBe('#/plotting');
    expect(document.title).toBe('绘图计算 · 析知');

    const nav = screen.getByRole('navigation', { name: '主导航' });
    for (const [title, heading, path] of [
      ['知识导航', '知识页测试入口', '#/knowledge'],
      ['错题本', '错题页测试入口', '#/mistakes'],
      ['AI 助教', 'AI 助教', '#/assistant'],
    ]) {
      fireEvent.click(
        within(nav).getByRole('link', { name: new RegExp(title) }),
      );
      expect(
        await screen.findByRole('heading', { name: heading }),
      ).toBeVisible();
      expect(window.location.hash).toBe(path);
      expect(document.title).toBe(`${title} · 析知`);
    }
    expect(screen.getByText('这是扩展入口，不是已完成功能')).toBeVisible();
    fireEvent.click(within(nav).getByRole('link', { name: /工作台概览/ }));
    expect(
      await screen.findByRole('region', { name: '学习工具' }),
    ).toBeVisible();
  });

  it('未知路径仍显示 404 和返回入口', async () => {
    window.location.hash = '#/missing';
    render(<App />);
    expect(await screen.findByText('没有找到这个页面')).toBeVisible();
    expect(screen.getByRole('link', { name: '返回工作台' })).toBeVisible();
    expect(document.title).toBe('页面未找到 · 析知');
  });
});
