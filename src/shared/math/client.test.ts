import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PlotRequest,
  PlotResult,
  PlotWorkerResponse,
} from '@/shared/contracts';
import { calculatePlot } from './client';

type MessageHandler = (event: { data: PlotWorkerResponse }) => void;

// jsdom 不实现 Worker：用可注入工厂（calculatePlot 第三参数）注入模拟实现，
// 每个路径都能断言 terminate、监听器移除与 Promise 单次完成。
class MockWorker {
  onmessage: MessageHandler | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn<(request: PlotRequest) => void>();
  terminate = vi.fn();
}

const request: PlotRequest = { expression: 'x^2', xMin: -5, xMax: 5 };
const result: PlotResult = { points: [[0, 0]], gaps: 0 };

function setup() {
  const worker = new MockWorker();
  const createWorker = vi.fn(() => worker as unknown as Worker);
  const controller = new AbortController();
  const states: string[] = [];
  const track = (promise: Promise<PlotResult>) => {
    promise.then(
      () => states.push('resolve'),
      (cause: unknown) =>
        states.push(
          cause instanceof DOMException
            ? `abort:${cause.name}`
            : `error:${cause instanceof Error ? cause.message : String(cause)}`,
        ),
    );
    return states;
  };
  return { worker, createWorker, controller, states, track };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('calculatePlot 生命周期与错误语义（#25）', () => {
  it('正常完成：解析结果，终止 Worker 并清空定时器与监听器', async () => {
    const { worker, createWorker, controller, states, track } = setup();
    const promise = calculatePlot(request, controller.signal, createWorker);
    track(promise);
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).toHaveBeenCalledWith(request);
    worker.onmessage?.({ data: { ok: true, data: result } });
    await expect(promise).resolves.toEqual(result);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    // 定时器已清除；abort 监听已移除，之后取消不会产生第二次完成。
    expect(vi.getTimerCount()).toBe(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(states).toEqual(['resolve']);
  });

  it('Worker 返回业务错误时拒绝并清理', async () => {
    const { worker, createWorker, controller } = setup();
    const promise = calculatePlot(request, controller.signal, createWorker);
    const assertion = expect(promise).rejects.toThrow('不支持的表达式');
    worker.onmessage?.({ data: { ok: false, error: '不支持的表达式' } });
    await assertion;
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('构造失败给出明确错误，且不留下定时器', async () => {
    const { createWorker, controller } = setup();
    createWorker.mockImplementation(() => {
      throw new Error('CSP 拦截');
    });
    const promise = calculatePlot(request, controller.signal, createWorker);
    await expect(promise).rejects.toThrow('无法启动计算模块，请刷新后重试。');
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('发送失败：postMessage 抛错时终止 Worker 并拒绝', async () => {
    const { worker, createWorker, controller } = setup();
    worker.postMessage.mockImplementation(() => {
      throw new Error('DataCloneError');
    });
    const promise = calculatePlot(request, controller.signal, createWorker);
    await expect(promise).rejects.toThrow(
      '无法向计算模块发送任务，请刷新后重试。',
    );
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('消息解码失败：messageerror 拒绝并清理', async () => {
    const { worker, createWorker, controller } = setup();
    const promise = calculatePlot(request, controller.signal, createWorker);
    const assertion = expect(promise).rejects.toThrow(
      '计算模块返回了无法解析的数据，请刷新后重试。',
    );
    worker.onmessageerror?.();
    await assertion;
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('模块加载失败：onerror 拒绝并清理', async () => {
    const { worker, createWorker, controller } = setup();
    const promise = calculatePlot(request, controller.signal, createWorker);
    const assertion =
      expect(promise).rejects.toThrow('计算模块加载失败，请刷新后重试。');
    worker.onerror?.();
    await assertion;
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('超时：8000ms 无响应时拒绝并终止 Worker', async () => {
    const { worker, createWorker, controller } = setup();
    const promise = calculatePlot(request, controller.signal, createWorker);
    const assertion = expect(promise).rejects.toThrow(
      '计算或模块加载超时，请简化表达式后重试。',
    );
    await vi.advanceTimersByTimeAsync(8000);
    await assertion;
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('取消：abort 信号以 AbortError 拒绝并清理', async () => {
    const { worker, createWorker, controller } = setup();
    const promise = calculatePlot(request, controller.signal, createWorker);
    const assertion = expect(promise).rejects.toMatchObject({
      name: 'AbortError',
    });
    controller.abort();
    await assertion;
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('信号已取消时立即拒绝，且不创建 Worker', async () => {
    const { createWorker, controller } = setup();
    controller.abort();
    const promise = calculatePlot(request, controller.signal, createWorker);
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(createWorker).not.toHaveBeenCalled();
  });

  it('Promise 只完成一次：完成后的消息、错误、取消与超时全部忽略', async () => {
    const { worker, createWorker, controller, states, track } = setup();
    const promise = calculatePlot(request, controller.signal, createWorker);
    track(promise);
    worker.onmessage?.({ data: { ok: true, data: result } });
    await expect(promise).resolves.toEqual(result);
    // 依次触发其余结束路径：全部应被单次完成守卫忽略。
    worker.onmessage?.({ data: { ok: false, error: '迟到' } });
    worker.onerror?.();
    worker.onmessageerror?.();
    controller.abort();
    await vi.advanceTimersByTimeAsync(8000);
    expect(states).toEqual(['resolve']);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});
