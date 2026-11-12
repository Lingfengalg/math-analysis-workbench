import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import MistakesPage from './MistakesPage';

beforeEach(() => {
  localStorage.clear();
  const queues = new Map<string, Promise<unknown>>();
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: (name: string, action: () => unknown) => {
        const result = (queues.get(name) ?? Promise.resolve()).then(action);
        queues.set(
          name,
          result.catch(() => undefined),
        );
        return result;
      },
    },
  });
});

describe('练习与重做闭环', () => {
  it('错题本同步失败时保留作答，可重试且不重复记录', async () => {
    const corrupt = '{broken';
    localStorage.setItem('math-workbench:mistakes', corrupt);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/mistakes?topic=derivative&practice=1']}>
        <MistakesPage />
      </MemoryRouter>,
    );
    await user.type(
      await screen.findByRole('textbox', { name: '你的答案' }),
      '3',
    );
    await user.click(screen.getByRole('button', { name: '提交答案' }));
    expect(
      await screen.findByText(/作答已保存，但错题本未同步/),
    ).toBeInTheDocument();
    expect(localStorage.getItem('math-workbench:mistakes')).toBe(corrupt);
    expect(
      JSON.parse(localStorage.getItem('math-workbench:practice-attempts')!).data
        .attempts,
    ).toHaveLength(1);
    localStorage.setItem(
      'math-workbench:mistakes',
      JSON.stringify({ schemaVersion: 1, data: { items: [] } }),
    );
    await user.click(
      screen.getByRole('button', { name: '同步最近结果到错题本' }),
    );
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem('math-workbench:mistakes')!).data.items,
      ).toHaveLength(1),
    );
    expect(
      JSON.parse(localStorage.getItem('math-workbench:practice-attempts')!).data
        .attempts,
    ).toHaveLength(1);
  });
  it('错答收录、重做答对、复习状态与历史保留', async () => {
    const user = userEvent.setup();
    const view = render(
      <MemoryRouter initialEntries={['/mistakes?topic=derivative&practice=1']}>
        <MistakesPage />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole('heading', { name: '求二次函数在一点的导数' }),
    ).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: '你的答案' }), '3');
    await user.click(screen.getByRole('button', { name: '提交答案' }));
    expect(await screen.findByText('还不正确，再试一次')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem('math-workbench:mistakes')!).data.items,
      ).toHaveLength(1),
    );
    await user.click(screen.getByRole('button', { name: '再做一次' }));
    await user.type(screen.getByRole('textbox', { name: '你的答案' }), '2');
    await user.click(screen.getByRole('button', { name: '提交答案' }));
    expect(await screen.findByText('回答正确')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem('math-workbench:mistakes')!).data
          .items[0].reviewedAt,
      ).not.toBeNull(),
    );
    expect(
      JSON.parse(localStorage.getItem('math-workbench:practice-attempts')!).data
        .attempts,
    ).toHaveLength(2);
    view.unmount();
    render(
      <MemoryRouter initialEntries={['/mistakes?topic=derivative&practice=1']}>
        <MistakesPage />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText('已作答 2 次，最近一次正确。'),
    ).toBeInTheDocument();
  });
  it('自由文本错题先隐藏订正，用户作答后自评', async () => {
    localStorage.setItem(
      'math-workbench:mistakes',
      JSON.stringify({
        schemaVersion: 1,
        data: {
          items: [
            {
              id: 'm1',
              title: '自定义题',
              topic: 'limit',
              problem: '求某个极限',
              mistakeReason: '旧错误',
              correction: '秘密订正',
              createdAt: 1,
              updatedAt: 1,
              reviewedAt: null,
            },
          ],
        },
      }),
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MistakesPage />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: '重做' }));
    const dialog = screen.getByRole('dialog');
    expect(screen.queryByText('秘密订正')).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/你的思路/), '我的推导');
    await user.click(within(dialog).getByRole('button', { name: '查看订正' }));
    expect(within(dialog).getByText('秘密订正')).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole('button', { name: '已掌握，标记已复习' }),
    );
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem('math-workbench:mistakes')!).data
          .items[0].reviewedAt,
      ).not.toBeNull(),
    );
  });
  it('未填题目内容的错题给出提示，不伪造判分', async () => {
    localStorage.setItem(
      'math-workbench:mistakes',
      JSON.stringify({
        schemaVersion: 1,
        data: {
          items: [
            {
              id: 'm1',
              title: '缺题目',
              topic: 'other',
              problem: '',
              mistakeReason: '',
              correction: '',
              createdAt: 1,
              updatedAt: 1,
              reviewedAt: null,
            },
          ],
        },
      }),
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MistakesPage />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: '重做' }));
    expect(screen.getByText('这条记录还没有题目内容')).toBeInTheDocument();
  });
});
