import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PlotRequest,
  PlotWorkerRequest,
  PlotWorkerResponse,
} from '@/shared/contracts';
import { calculatePlot, resetPlotWorkerForTesting } from './client';

class MockWorker {
  static instances: MockWorker[] = [];

  onmessage: ((event: MessageEvent<PlotWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postedMessages: PlotWorkerRequest[] = [];
  terminated = false;

  constructor() {
    MockWorker.instances.push(this);
  }

  postMessage(message: PlotWorkerRequest) {
    this.postedMessages.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  emitMessage(response: PlotWorkerResponse) {
    this.onmessage?.({ data: response } as MessageEvent<PlotWorkerResponse>);
  }

  emitError() {
    this.onerror?.(new ErrorEvent('error'));
  }
}

const sampleRequestA: PlotRequest = {
  expression: 'x^2',
  xMin: -2,
  xMax: 2,
};

const sampleRequestB: PlotRequest = {
  expression: 'sin(x)',
  xMin: -3,
  xMax: 3,
};

describe('calculatePlot 常驻 Worker 客户端', () => {
  beforeEach(() => {
    MockWorker.instances = [];
    vi.stubGlobal('Worker', MockWorker);
    resetPlotWorkerForTesting();
  });

  afterEach(() => {
    resetPlotWorkerForTesting();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('正常完成计算后复用同一个常驻 Worker 实例，不调用 terminate', async () => {
    const c1 = new AbortController();
    const p1 = calculatePlot(sampleRequestA, c1.signal);

    expect(MockWorker.instances).toHaveLength(1);
    const worker = MockWorker.instances[0];
    expect(worker.postedMessages[0]).toEqual({
      requestId: 1,
      request: sampleRequestA,
    });

    worker.emitMessage({
      requestId: 1,
      ok: true,
      data: { points: [[0, 0]], gaps: 0 },
    });
    await expect(p1).resolves.toEqual({ points: [[0, 0]], gaps: 0 });
    expect(worker.terminated).toBe(false);

    // 旧请求已完成时再触发旧 controller.abort() 不应误杀常驻 Worker
    c1.abort();
    expect(worker.terminated).toBe(false);

    const c2 = new AbortController();
    const p2 = calculatePlot(sampleRequestB, c2.signal);
    expect(MockWorker.instances).toHaveLength(1);
    expect(worker.postedMessages[1]).toEqual({
      requestId: 2,
      request: sampleRequestB,
    });

    worker.emitMessage({
      requestId: 2,
      ok: true,
      data: { points: [[0, 0]], gaps: 0 },
    });
    await expect(p2).resolves.toEqual({ points: [[0, 0]], gaps: 0 });
    expect(worker.terminated).toBe(false);
  });

  it('支持并发请求乱序响应并按 requestId 精确匹配，业务报错不销毁健康 Worker', async () => {
    const c1 = new AbortController();
    const c2 = new AbortController();
    const p1 = calculatePlot(sampleRequestA, c1.signal);
    const p2 = calculatePlot(sampleRequestB, c2.signal);

    const worker = MockWorker.instances[0];
    expect(MockWorker.instances).toHaveLength(1);

    worker.emitMessage({
      requestId: 2,
      ok: false,
      error: '不支持的函数：foo。',
    });
    worker.emitMessage({
      requestId: 1,
      ok: true,
      data: { points: [[-2, 4]], gaps: 0 },
    });

    await expect(p2).rejects.toThrow('不支持的函数：foo。');
    await expect(p1).resolves.toEqual({ points: [[-2, 4]], gaps: 0 });
    expect(worker.terminated).toBe(false);
  });

  it('并发取消进行中的请求时终止旧 Worker，未取消请求自动在新 Worker 恢复完成', async () => {
    const preAborted = new AbortController();
    preAborted.abort();
    await expect(
      calculatePlot(sampleRequestA, preAborted.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(MockWorker.instances).toHaveLength(0);

    const c1 = new AbortController();
    const c2 = new AbortController();
    const p1 = calculatePlot(sampleRequestA, c1.signal);
    const p2 = calculatePlot(sampleRequestB, c2.signal);

    const firstWorker = MockWorker.instances[0];
    c1.abort();

    await expect(p1).rejects.toMatchObject({ name: 'AbortError' });
    expect(firstWorker.terminated).toBe(true);

    // 存活的第二个请求自动派发至新建的干净 Worker
    expect(MockWorker.instances).toHaveLength(2);
    const secondWorker = MockWorker.instances[1];
    expect(secondWorker.postedMessages).toEqual([
      { requestId: 2, request: sampleRequestB },
    ]);

    secondWorker.emitMessage({
      requestId: 2,
      ok: true,
      data: { points: [[1, Math.sin(1)]], gaps: 0 },
    });
    await expect(p2).resolves.toEqual({
      points: [[1, Math.sin(1)]],
      gaps: 0,
    });
  });

  it('超过 8 秒超时后终止卡死 Worker 并在下次请求时自动重建', async () => {
    vi.useFakeTimers();
    const c1 = new AbortController();
    const p1 = calculatePlot(sampleRequestA, c1.signal);
    const stuckWorker = MockWorker.instances[0];

    const assertion = expect(p1).rejects.toThrow(
      '计算或模块加载超时，请简化表达式后重试。',
    );
    await vi.advanceTimersByTimeAsync(8000);
    await assertion;
    expect(stuckWorker.terminated).toBe(true);

    const c2 = new AbortController();
    const p2 = calculatePlot(sampleRequestB, c2.signal);
    expect(MockWorker.instances).toHaveLength(2);
    const freshWorker = MockWorker.instances[1];
    freshWorker.emitMessage({
      requestId: 2,
      ok: true,
      data: { points: [[0, 0]], gaps: 0 },
    });
    await expect(p2).resolves.toEqual({ points: [[0, 0]], gaps: 0 });
  });

  it('Worker 发生运行错误时清理所有挂起请求并在后续请求自动恢复', async () => {
    const c1 = new AbortController();
    const c2 = new AbortController();
    const p1 = calculatePlot(sampleRequestA, c1.signal);
    const p2 = calculatePlot(sampleRequestB, c2.signal);

    const brokenWorker = MockWorker.instances[0];
    brokenWorker.emitError();

    await expect(p1).rejects.toThrow('计算模块加载失败，请刷新后重试。');
    await expect(p2).rejects.toThrow('计算模块加载失败，请刷新后重试。');
    expect(brokenWorker.terminated).toBe(true);

    const c3 = new AbortController();
    const p3 = calculatePlot(sampleRequestA, c3.signal);
    expect(MockWorker.instances).toHaveLength(2);
    MockWorker.instances[1].emitMessage({
      requestId: 3,
      ok: true,
      data: { points: [[2, 4]], gaps: 0 },
    });
    await expect(p3).resolves.toEqual({ points: [[2, 4]], gaps: 0 });
  });
});
