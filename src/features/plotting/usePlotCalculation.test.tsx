import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlotResult } from '@/shared/contracts';
import { calculatePlot } from '@/shared/math/client';
import { usePlotCalculation } from './usePlotCalculation';

vi.mock('@/shared/math/client', () => ({ calculatePlot: vi.fn() }));
const calculate = vi.mocked(calculatePlot);
const initial = { expression: 'x', xMin: -1, xMax: 1 };
const data: PlotResult = { points: [[0, 0]], gaps: 0 };

function deferred() {
  let resolve!: (value: PlotResult) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<PlotResult>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

beforeEach(() => calculate.mockReset());

describe('绘图请求生命周期', () => {
  it('无效提交取消进行中的请求，旧结果不能覆盖错误', async () => {
    const first = deferred();
    calculate.mockReturnValue(first.promise);
    const { result } = renderHook(() => usePlotCalculation(initial));
    await waitFor(() => expect(calculate).toHaveBeenCalledTimes(1));
    const signal = calculate.mock.calls[0][1];
    act(() => result.current.draw({ ...initial, xMin: 2 }));
    expect(signal.aborted).toBe(true);
    expect(result.current.state.status).toBe('error');
    await act(async () => first.resolve(data));
    expect(result.current.state.status).toBe('error');
  });

  it('新的有效请求取代旧请求，即使旧请求晚到也不更新界面', async () => {
    const first = deferred();
    const second = deferred();
    calculate
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => usePlotCalculation(initial));
    await waitFor(() => expect(calculate).toHaveBeenCalledTimes(1));
    act(() => result.current.draw({ ...initial, expression: 'x^2' }));
    await waitFor(() => expect(calculate).toHaveBeenCalledTimes(2));
    expect(calculate.mock.calls[0][1].aborted).toBe(true);
    await act(async () => second.resolve(data));
    await act(async () => first.reject(new Error('旧错误')));
    expect(result.current.state).toEqual({
      status: 'ready',
      request: { ...initial, expression: 'x^2' },
      result: data,
    });
  });

  it('计算错误后可重新提交，卸载时取消请求', async () => {
    const first = deferred();
    const second = deferred();
    calculate
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result, unmount } = renderHook(() => usePlotCalculation(initial));
    await act(async () => first.reject(new Error('计算失败')));
    expect(result.current.state).toEqual({
      status: 'error',
      message: '计算失败',
    });
    act(() => result.current.draw(initial));
    await waitFor(() => expect(calculate).toHaveBeenCalledTimes(2));
    expect(result.current.state.status).toBe('loading');
    const signal = calculate.mock.calls[1][1];
    unmount();
    expect(signal.aborted).toBe(true);
  });
});
