import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  IntersectionResult,
  PlotRequest,
  PlotResult,
  TangentResult,
} from '@/shared/contracts';
import {
  calculateIntersections,
  calculatePlot,
  calculateTangent,
} from '@/shared/math/client';
import {
  useComparisonCalculation,
  useIntersectionCalculation,
  usePlotCalculation,
  useTangentCalculation,
  type TangentState,
  type IntersectionState,
} from './usePlotCalculation';

vi.mock('@/shared/math/client', () => ({
  calculatePlot: vi.fn(),
  calculateIntersections: vi.fn(),
  calculateTangent: vi.fn(),
}));
const calculate = vi.mocked(calculatePlot);
const calculatePoints = vi.mocked(calculateIntersections);
const calculateSlope = vi.mocked(calculateTangent);
const tangentData: TangentResult = { slope: 1, value: 1 };
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

function deferredIntersections() {
  let resolve!: (value: IntersectionResult) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<IntersectionResult>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function deferredTangent() {
  let resolve!: (value: TangentResult) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<TangentResult>((yes, no) => {
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

describe('近似交点请求生命周期', () => {
  it('两条曲线都可用时自动计算，任一为空则空闲并取消', async () => {
    const pending = deferredIntersections();
    calculatePoints.mockReturnValue(pending.promise);
    const { result, rerender } = renderHook<
      IntersectionState,
      { a: PlotRequest | null; b: PlotRequest | null }
    >(({ a, b }) => useIntersectionCalculation(a, b), {
      initialProps: { a: null, b: null },
    });
    expect(result.current).toEqual({ status: 'idle' });
    expect(calculatePoints).not.toHaveBeenCalled();
    rerender({ a: initial, b: initial });
    await waitFor(() => expect(calculatePoints).toHaveBeenCalledTimes(1));
    expect(calculatePoints.mock.calls[0][0]).toBe(initial);
    expect(calculatePoints.mock.calls[0][1]).toBe(initial);
    // 计算期间保持空闲（没有中间 loading 状态），完成后给出交点
    expect(result.current).toEqual({ status: 'idle' });
    await act(async () => pending.resolve({ points: [{ x: 1, y: 2 }] }));
    expect(result.current).toEqual({
      status: 'ready',
      points: [{ x: 1, y: 2 }],
    });
    // 主曲线重绘期间请求为空：回到空闲并取消进行中的请求
    rerender({ a: null, b: initial });
    expect(result.current).toEqual({ status: 'idle' });
    expect(calculatePoints.mock.calls[0][2].aborted).toBe(true);
  });

  it('计算失败给出错误信息', async () => {
    const pending = deferredIntersections();
    calculatePoints.mockReturnValue(pending.promise);
    const { result } = renderHook(() =>
      useIntersectionCalculation(initial, initial),
    );
    await waitFor(() => expect(calculatePoints).toHaveBeenCalledTimes(1));
    await act(async () => pending.reject(new Error('计算失败')));
    expect(result.current).toEqual({ status: 'error', message: '计算失败' });
  });
});

describe('切线请求生命周期', () => {
  it('主曲线请求与切点都可用时自动计算，任一为空则空闲并取消', async () => {
    const pending = deferredTangent();
    calculateSlope.mockReturnValue(pending.promise);
    const { result, rerender } = renderHook<
      TangentState,
      { request: PlotRequest | null; x0: number | null }
    >(({ request, x0 }) => useTangentCalculation(request, x0), {
      initialProps: { request: null, x0: null },
    });
    expect(result.current).toEqual({ status: 'idle' });
    expect(calculateSlope).not.toHaveBeenCalled();
    rerender({ request: initial, x0: 1 });
    await waitFor(() => expect(calculateSlope).toHaveBeenCalledTimes(1));
    expect(calculateSlope.mock.calls[0][0]).toBe(initial);
    expect(calculateSlope.mock.calls[0][1]).toBe(1);
    // 计算期间保持空闲（没有中间 loading 状态），完成后给出斜率与切点值
    expect(result.current).toEqual({ status: 'idle' });
    await act(async () => pending.resolve(tangentData));
    expect(result.current).toEqual({ status: 'ready', slope: 1, value: 1 });
    // 主曲线重绘期间请求为空：回到空闲并取消进行中的请求
    rerender({ request: null, x0: 1 });
    expect(result.current).toEqual({ status: 'idle' });
    expect(calculateSlope.mock.calls[0][2].aborted).toBe(true);
  });

  it('切点变化触发重算，旧结果不覆盖新请求', async () => {
    const first = deferredTangent();
    const second = deferredTangent();
    calculateSlope
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook<
      TangentState,
      { request: PlotRequest | null; x0: number | null }
    >(({ request, x0 }) => useTangentCalculation(request, x0), {
      initialProps: { request: initial, x0: 1 },
    });
    await waitFor(() => expect(calculateSlope).toHaveBeenCalledTimes(1));
    rerender({ request: initial, x0: 2 });
    await waitFor(() => expect(calculateSlope).toHaveBeenCalledTimes(2));
    expect(calculateSlope.mock.calls[0][2].aborted).toBe(true);
    await act(async () => second.resolve({ slope: 4, value: 4 }));
    await act(async () => first.resolve(tangentData));
    expect(result.current).toEqual({ status: 'ready', slope: 4, value: 4 });
  });

  it('计算失败给出错误信息', async () => {
    const pending = deferredTangent();
    calculateSlope.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useTangentCalculation(initial, 0));
    await waitFor(() => expect(calculateSlope).toHaveBeenCalledTimes(1));
    await act(async () => pending.reject(new Error('不可导')));
    expect(result.current).toEqual({ status: 'error', message: '不可导' });
  });
});
