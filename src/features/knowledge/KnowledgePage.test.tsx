import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import KnowledgePage from './KnowledgePage';

describe('知识导航', () => {
  it('能搜索知识卡片并展示空状态', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <KnowledgePage />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('link', { name: /去绘图中观察/ })).toHaveLength(
      3,
    );
    const search = screen.getByRole('textbox', { name: '搜索知识卡片' });
    await user.type(search, '可导与连续');
    expect(screen.getAllByRole('link', { name: /去绘图中观察/ })).toHaveLength(
      1,
    );
    await user.clear(search);
    await user.type(search, '不存在的知识点');
    expect(screen.getByText(/没有找到匹配的知识点/)).toBeInTheDocument();
  });
  it('支持按路由参数筛选', () => {
    render(
      <MemoryRouter initialEntries={['/knowledge?topic=derivative']}>
        <KnowledgePage />
      </MemoryRouter>,
    );
    expect(screen.getByText('可导与连续：逆命题不成立')).toBeInTheDocument();
    expect(
      screen.queryByText('函数极限：靠近，而非到达'),
    ).not.toBeInTheDocument();
  });
  it('未知主题回退到全部卡片', () => {
    render(
      <MemoryRouter initialEntries={['/knowledge?topic=unknown']}>
        <KnowledgePage />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('link', { name: /去绘图中观察/ })).toHaveLength(
      3,
    );
  });
});

describe('知识搜索覆盖其他字段', () => {
  const renderPage = (entry = '/knowledge') =>
    render(
      <MemoryRouter initialEntries={[entry]}>
        <KnowledgePage />
      </MemoryRouter>,
    );

  it('例题中的关键词可以找到卡片', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(
      screen.getByRole('textbox', { name: '搜索知识卡片' }),
      '左导数',
    );
    expect(screen.getByText('可导与连续：逆命题不成立')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /去绘图中观察/ })).toHaveLength(
      1,
    );
  });

  it('常见误区中的关键词可以找到卡片', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(
      screen.getByRole('textbox', { name: '搜索知识卡片' }),
      '倒过来',
    );
    expect(screen.getByText('可导与连续：逆命题不成立')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /去绘图中观察/ })).toHaveLength(
      1,
    );
  });

  it('适用条件中的关键词可以找到卡片', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(
      screen.getByRole('textbox', { name: '搜索知识卡片' }),
      '区间端点',
    );
    expect(screen.getByText('连续性：先检查定义域')).toBeInTheDocument();
  });

  it('与主题筛选组合时同时生效', async () => {
    const user = userEvent.setup();
    renderPage();
    const input = screen.getByRole('textbox', { name: '搜索知识卡片' });
    await user.type(input, '极限');
    expect(screen.getAllByRole('link', { name: /去绘图中观察/ })).toHaveLength(
      3,
    );

    await user.click(
      within(screen.getByRole('radiogroup', { name: '知识主题' })).getByText(
        '导数',
      ),
    );
    expect(screen.getAllByRole('link', { name: /去绘图中观察/ })).toHaveLength(
      1,
    );
    expect(screen.getByText('可导与连续：逆命题不成立')).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, '倒过来');
    await user.click(
      within(screen.getByRole('radiogroup', { name: '知识主题' })).getByText(
        '极限',
      ),
    );
    expect(screen.getByText(/没有找到匹配的知识点/)).toBeInTheDocument();
  });

  it('空白搜索不会过滤任何卡片', async () => {
    const user = userEvent.setup();
    renderPage();
    const input = screen.getByRole('textbox', { name: '搜索知识卡片' });
    await user.type(input, '   ');
    expect(screen.getAllByRole('link', { name: /去绘图中观察/ })).toHaveLength(
      3,
    );
  });
});
