import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MistakesPage from './MistakesPage';

const STORAGE_KEY = 'math-workbench:mistakes';

async function addMistake(title: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /记录错题/ }));
  await user.type(screen.getByLabelText('题目'), title);
  await user.click(screen.getByRole('button', { name: /保\s*存/ }));
  await waitFor(() => expect(screen.getByText(title)).toBeInTheDocument());
  return user;
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: (_name: string, action: () => boolean) =>
        Promise.resolve().then(action),
    },
  });
});

describe('错题本', () => {
  it('没有记录时展示空状态', () => {
    render(<MistakesPage />);
    expect(screen.getByText(/还没有错题记录/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /记录错题/ }),
    ).toBeInTheDocument();
  });

  it('可以新增错题并写入版本化本地存储', async () => {
    render(<MistakesPage />);
    await addMistake('判断 1/x 在 0 处是否连续');
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.data.items).toHaveLength(1);
    expect(parsed.data.items[0].title).toBe('判断 1/x 在 0 处是否连续');
    expect(screen.getByText('已记录一条错题。')).toBeInTheDocument();
  });

  it('刷新后仍能读回已保存的错题', async () => {
    const first = render(<MistakesPage />);
    await addMistake('刷新后还在的错题');
    first.unmount();
    render(<MistakesPage />);
    expect(screen.getByText('刷新后还在的错题')).toBeInTheDocument();
  });

  it('可以编辑已保存的错题', async () => {
    render(<MistakesPage />);
    const user = await addMistake('原标题');
    await user.click(screen.getByRole('button', { name: /编辑/ }));
    const titleField = screen.getByLabelText('题目');
    await user.clear(titleField);
    await user.type(titleField, '修改后的题目');
    await user.click(screen.getByRole('button', { name: /保\s*存/ }));
    await waitFor(() =>
      expect(screen.getByText('修改后的题目')).toBeInTheDocument(),
    );
    expect(screen.queryByText('原标题')).not.toBeInTheDocument();
    expect(screen.getByText('已更新这条错题。')).toBeInTheDocument();
  });

  it('删除需要二次确认', async () => {
    render(<MistakesPage />);
    const user = await addMistake('待删除的错题');
    await user.click(screen.getByRole('button', { name: /删除/ }));
    expect(screen.getByText('删除这条错题？')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '确认删除' }));
    await waitFor(() =>
      expect(screen.queryByText('待删除的错题')).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/还没有错题记录/)).toBeInTheDocument();
    expect(screen.getByText('已删除这条错题。')).toBeInTheDocument();
  });

  it('搜索无结果时给出提示', async () => {
    render(<MistakesPage />);
    const user = await addMistake('极限的四则运算');
    await user.type(screen.getByLabelText('搜索错题'), '不存在的关键词');
    expect(screen.getByText(/没有匹配的错题/)).toBeInTheDocument();
    expect(screen.queryByText('极限的四则运算')).not.toBeInTheDocument();
  });

  it('损坏数据只提示，不覆盖原始内容', () => {
    const corrupt = '{"schemaVersion":1,"data":{"items":"oops"}}';
    localStorage.setItem(STORAGE_KEY, corrupt);
    render(<MistakesPage />);
    expect(screen.getByText('本地错题数据无法读取')).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(corrupt);
    expect(screen.getByRole('button', { name: /记录错题/ })).toBeDisabled();
  });

  it('存储写入失败时给出错误且不产生记录', async () => {
    render(<MistakesPage />);
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    await user.click(screen.getByRole('button', { name: /记录错题/ }));
    await user.type(screen.getByLabelText('题目'), '写不进去的错题');
    await user.click(screen.getByRole('button', { name: /保\s*存/ }));
    await waitFor(() =>
      expect(screen.getByText('保存失败')).toBeInTheDocument(),
    );
    expect(screen.queryByText('写不进去的错题')).not.toBeInTheDocument();
  });
});

describe('只读模式 (#23)', () => {
  it('不支持 Web Locks 时给出只读提示并禁用写操作', () => {
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: undefined,
    });
    render(<MistakesPage />);

    expect(screen.getByText(/只读模式/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /记录错题/ })).toBeDisabled();
  });
});
