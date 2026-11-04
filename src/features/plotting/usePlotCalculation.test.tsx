import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlotRequest, PlotResult, TaylorResult } from '@/shared/contracts';
import { calculatePlot, calculateTaylor } from '@/shared/math/client';
import {
  useComparisonCalculation,
  usePlotCalculation,
  useTaylorCalculation,
  type TaylorState,
} from './usePlotCalculation';

vi.mock('@/shared/math/client', () => ({
  calculatePlot: vi.fn(),
  calculateTaylor: vi.fn(),
}));
const calculate = vi.mocked(calculatePlot);
const calculatePolynomial = vi.mocked(calculateTaylor);
const initial = { expression: 'x', xMin: -1, xMax: 1 };
const data: PlotResult = { points: [[0, 0]], gaps: 0 };
const taylorData: TaylorResult = {
  coefficients: [0, 1],
  points: [[0, 0]],
};

function deferred() {
  let resolve!: (value: PlotResult) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<PlotResult>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function deferredTaylor() {
  let resolve!: (value: TaylorResult) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<TaylorResult>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  calculate.mockReset();
  calculatePolynomial.mockReset();
});

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

describe('对比曲线绘图请求生命周期', () => {
  it('初始为空闲不发起计算，提交后计算，卸载时取消', async () => {
    const pending = deferred();
    calculate.mockReturnValue(pending.promise);
    const { result, unmount } = renderHook(() => useComparisonCalculation());
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(calculate).not.toHaveBeenCalled();
    act(() => result.current.draw({ expression: 'abs(x)', xMin: -5, xMax: 5 }));
    expect(result.current.state.status).toBe('loading');
    await waitFor(() => expect(calculate).toHaveBeenCalledTimes(1));
    expect(calculate.mock.calls[0][0]).toEqual({
      expression: 'abs(x)',
      xMin: -5,
      xMax: 5,
    });
    const signal = calculate.mock.calls[0][1];
    unmount();
    expect(signal.aborted).toBe(true);
    // 结算挂起的 Promise（已中止的请求不会更新界面）
    await act(async () => pending.resolve(data));
    expect(result.current.state.status).toBe('loading');
  });

  it('无效提交给出错误且不发起计算，之后可重新提交', async () => {
    const pending = deferred();
    calculate.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useComparisonCalculation());
    act(() => result.current.draw({ expression: '', xMin: -5, xMax: 5 }));
    expect(result.current.state.status).toBe('error');
    expect(calculate).not.toHaveBeenCalled();
    act(() => result.current.draw({ expression: 'x', xMin: -1, xMax: 1 }));
    await waitFor(() => expect(calculate).toHaveBeenCalledTimes(1));
    await act(async () => pending.resolve(data));
    expect(result.current.state).toEqual({
      status: 'ready',
      request: { expression: 'x', xMin: -1, xMax: 1 },
      result: data,
    });
  });
});

type TaylorProps = {
  request: PlotRequest | null;
  center: number | null;
  order: number | null;
};

describe('泰勒多项式自动计算（#64）', () => {
  it('请求、展开中心与阶数齐备时自动计算；任一缺失则回空闲并中止', async () => {
    const pending = deferredTaylor();
    calculatePolynomial.mockReturnValue(pending.promise);
    const props: TaylorProps = { request: initial, center: 0, order: 3 };
    const { result, rerender } = renderHook<TaylorState, TaylorProps>(
      ({ request, center, order }) =>
        useTaylorCalculation(request, center, order),
      { initialProps: props },
    );
    expect(result.current).toEqual({ status: 'idle' });
    await waitFor(() => expect(calculatePolynomial).toHaveBeenCalledTimes(1));
    expect(calculatePolynomial.mock.calls[0].slice(0, 3)).toEqual([
      initial,
      0,
      3,
    ]);
    const signal = calculatePolynomial.mock.calls[0][3];
    rerender({ request: initial, center: null, order: 3 });
    expect(result.current).toEqual({ status: 'idle' });
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(taylorData));
    expect(result.current).toEqual({ status: 'idle' });
  });

  it('阶数变化重新计算，旧结果晚到不覆盖新结果', async () => {
    const first = deferredTaylor();
    const second = deferredTaylor();
    calculatePolynomial
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const props: TaylorProps = { request: initial, center: 0, order: 3 };
    const { result, rerender } = renderHook<TaylorState, TaylorProps>(
      ({ request, center, order }) =>
        useTaylorCalculation(request, center, order),
      { initialProps: props },
    );
    await waitFor(() => expect(calculatePolynomial).toHaveBeenCalledTimes(1));
    rerender({ request: initial, center: 0, order: 5 });
    await waitFor(() => expect(calculatePolynomial).toHaveBeenCalledTimes(2));
    expect(calculatePolynomial.mock.calls[0][3].aborted).toBe(true);
    await act(async () => second.resolve(taylorData));
    await act(async () => first.reject(new Error('旧错误')));
    expect(result.current).toEqual({
      status: 'ready',
      coefficients: taylorData.coefficients,
      points: taylorData.points,
    });
  });

  it('计算失败给出错误状态，重新计算可恢复', async () => {
    const failed = deferredTaylor();
    const recovered = deferredTaylor();
    calculatePolynomial
      .mockReturnValueOnce(failed.promise)
      .mockReturnValueOnce(recovered.promise);
    const props: TaylorProps = { request: initial, center: 0, order: 3 };
    const { result, rerender } = renderHook<TaylorState, TaylorProps>(
      ({ request, center, order }) =>
        useTaylorCalculation(request, center, order),
      { initialProps: props },
    );
    await waitFor(() => expect(calculatePolynomial).toHaveBeenCalledTimes(1));
    await act(async () => failed.reject(new Error('第 1 阶导数超出支持范围')));
    expect(result.current).toEqual({
      status: 'error',
      message: '第 1 阶导数超出支持范围',
    });
    rerender({ request: initial, center: 0, order: 2 });
    expect(result.current).toEqual({ status: 'idle' });
    await waitFor(() => expect(calculatePolynomial).toHaveBeenCalledTimes(2));
    await act(async () => recovered.resolve(taylorData));
    expect(result.current).toEqual({
      status: 'ready',
      coefficients: taylorData.coefficients,
      points: taylorData.points,
    });
  });
});
