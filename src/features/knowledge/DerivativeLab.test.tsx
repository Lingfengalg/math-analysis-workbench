import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { DerivativeLab } from './DerivativeLab';

vi.mock('./DerivativeChart', () => ({ default: () => null }));

describe('导数互动实验', () => {
  it('调整参数展示差商边界，并正确区分绝对值尖点', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DerivativeLab />
      </MemoryRouter>,
    );
    const lab = screen.getByRole('region', { name: '从割线走向切线' });
    expect(within(lab).getByRole('img')).toHaveAccessibleName(/割线斜率约为 2/);
    fireEvent.change(screen.getByRole('slider', { name: '增量 h' }), {
      target: { value: '0' },
    });
    expect(screen.getByText(/差商分母为零/)).toBeInTheDocument();
    expect(within(lab).getByRole('img')).toHaveAccessibleName(/割线斜率未定义/);
    await user.click(screen.getByRole('button', { name: 'f(x) = |x|' }));
    fireEvent.change(screen.getByRole('slider', { name: '观察点 x' }), {
      target: { value: '0' },
    });
    fireEvent.change(screen.getByRole('slider', { name: '增量 h' }), {
      target: { value: '-0.1' },
    });
    expect(within(lab).getByRole('img')).toHaveAccessibleName(
      /割线斜率约为 -1.*该点不可导/,
    );
    await user.click(screen.getByRole('button', { name: '重置实验' }));
    expect(screen.getByRole('button', { name: 'f(x) = x²' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
  it('自测提供反馈且链接到导数错题本', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DerivativeLab />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: '一定可导' }));
    expect(screen.getByRole('status')).toHaveTextContent('再想一想');
    await user.click(screen.getByRole('button', { name: '不一定可导' }));
    expect(screen.getByRole('status')).toHaveTextContent('左导数为 −1');
    expect(
      screen.getByRole('link', { name: '前往导数错题本' }),
    ).toHaveAttribute('href', '/mistakes?topic=derivative');
  });
});
