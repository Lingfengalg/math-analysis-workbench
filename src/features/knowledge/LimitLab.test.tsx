import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { LimitLab } from './LimitLab';

vi.mock('./LimitChart', () => ({ default: () => null }));

describe('极限动画实验', () => {
  it('手动逼近、切换双侧不相等的例子并重置', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LimitLab />
      </MemoryRouter>,
    );
    const lab = screen.getByRole('region', { name: '向同一个点靠近' });
    fireEvent.change(within(lab).getByRole('slider', { name: '逼近进度' }), {
      target: { value: '100' },
    });
    expect(within(lab).getByRole('img')).toHaveAccessibleName(
      /左侧 x 为 0.99、函数值为 0.98/,
    );
    await user.click(
      within(lab).getByRole('button', { name: 'x / |x|：左右不同' }),
    );
    expect(
      within(lab).getByText(/两侧不相等，双侧极限不存在/),
    ).toBeInTheDocument();
    expect(within(lab).getByRole('slider', { name: '逼近进度' })).toHaveValue(
      '0',
    );
    expect(
      within(lab).getByRole('link', { name: '开始极限练习' }),
    ).toHaveAttribute('href', '/mistakes?topic=limit&practice=1');
  });
});
