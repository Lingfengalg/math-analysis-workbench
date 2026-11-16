import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PlotRequest,
  PlotWorkerRequest,
  PlotWorkerResponse,
  SurfacePlotRequest,
  SurfacePlotResult,
} from '@/shared/contracts';
import {
  calculatePlot,
  calculateSurface,
  resetPlotWorkerForTesting,
} from './client';

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

const sampleSurfaceRequest: SurfacePlotRequest = {
  expression: 'x^2 - y^2',
  xMin: -2,
  xMax: 2,
  yDomainMin: -2,
  yDomainMax: 2,
  gridSize: 16,
};

const mockSurfaceResult: SurfacePlotResult = {
  gridX: [-2, 0, 2],
  gridY: [-2, 0, 2],
  zValues: [0, -4, 0, 4, 0, 4, 0, -4, 0],
  validCount: 9,
  gaps: 0,
  zDataMin: -4,
  zDataMax: 4,
};

describe('calculatePlot 与 calculateSurface 常驻 Worker 客户端', () => {
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

  it('calculateSurface 与 calculatePlot 共享同一个常驻 Worker 且正确路由 kind="3d" 消息', async () => {
    const c1 = new AbortController();
    const c2 = new AbortController();

    const pSurface = calculateSurface(sampleSurfaceRequest, c1.signal);
    const pPlot = calculatePlot(sampleRequestA, c2.signal);

    expect(MockWorker.instances).toHaveLength(1);
    const worker = MockWorker.instances[0];
    expect(worker.postedMessages).toEqual([
      { kind: '3d', requestId: 1, request: sampleSurfaceRequest },
      { requestId: 2, request: sampleRequestA },
    ]);

    worker.emitMessage({
      requestId: 2,
      ok: true,
      data: { points: [[0, 0]], gaps: 0 },
    });
    worker.emitMessage({
      kind: '3d',
      requestId: 1,
      ok: true,
      data: mockSurfaceResult,
    });

    await expect(pPlot).resolves.toEqual({ points: [[0, 0]], gaps: 0 });
    await expect(pSurface).resolves.toEqual(mockSurfaceResult);
    expect(worker.terminated).toBe(false);
  });

  it('并发混合请求中取消 1D 请求后，进行中的 calculateSurface 自动在新 Worker 重派完成', async () => {
    const cPlot = new AbortController();
    const cSurface = new AbortController();

    const pPlot = calculatePlot(sampleRequestA, cPlot.signal);
    const pSurface = calculateSurface(sampleSurfaceRequest, cSurface.signal);

    const firstWorker = MockWorker.instances[0];
    cPlot.abort();

    await expect(pPlot).rejects.toMatchObject({ name: 'AbortError' });
    expect(firstWorker.terminated).toBe(true);

    expect(MockWorker.instances).toHaveLength(2);
    const secondWorker = MockWorker.instances[1];
    expect(secondWorker.postedMessages).toEqual([
      { kind: '3d', requestId: 2, request: sampleSurfaceRequest },
    ]);

    secondWorker.emitMessage({
      kind: '3d',
      requestId: 2,
      ok: true,
      data: mockSurfaceResult,
    });
    await expect(pSurface).resolves.toEqual(mockSurfaceResult);
  });

  it('calculateSurface 业务错误与结果类型不匹配均能安全拒绝而不破坏常驻 Worker', async () => {
    const c1 = new AbortController();
    const pMismatch = calculateSurface(sampleSurfaceRequest, c1.signal);
    const worker = MockWorker.instances[0];

    // 模拟意外返回 1D 结构给 3D 任务
    worker.emitMessage({
      requestId: 1,
      ok: true,
      data: { points: [[0, 0]], gaps: 0 },
    });
    await expect(pMismatch).rejects.toThrow('计算结果类型不匹配。');
    expect(worker.terminated).toBe(false);

    const c2 = new AbortController();
    const pErr = calculateSurface(sampleSurfaceRequest, c2.signal);
    worker.emitMessage({
      kind: '3d',
      requestId: 2,
      ok: false,
      error: '不支持底数与指数同时含变量的幂运算，可改写为 exp(y * ln(x))。',
    });
    await expect(pErr).rejects.toThrow('exp(y * ln(x))');
    expect(worker.terminated).toBe(false);
  });
});

describe('plot.worker.ts 1D / 3D 双模态消息处理', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('真实执行 plot.worker 消息处理：同时兼容 kind="3d" 曲面计算、3D 报错与原有 1D 采样', async () => {
    const posted: PlotWorkerResponse[] = [];
    const workerScope = {
      onmessage: null as
        ((event: MessageEvent<PlotWorkerRequest | PlotRequest>) => void) | null,
      postMessage: (msg: PlotWorkerResponse) => {
        posted.push(msg);
      },
    };
    vi.stubGlobal('self', workerScope);

    await import('./plot.worker');
    expect(workerScope.onmessage).toBeTypeOf('function');

    // 1. 3D 曲面 + 积分请求
    workerScope.onmessage!({
      data: {
        kind: '3d',
        requestId: 101,
        request: {
          expression: 'x + 2 * y + 1',
          xMin: 0,
          xMax: 2,
          yDomainMin: 0,
          yDomainMax: 2,
          gridSize: 16,
          integral: {
            regionType: 'rectangle',
            xStart: 0,
            xEnd: 2,
            yStart: 0,
            yEnd: 2,
            partitions: 6,
            rule: 'midpoint',
          },
        },
      },
    } as MessageEvent<PlotWorkerRequest>);

    expect(posted).toHaveLength(1);
    const res3d = posted[0];
    expect(res3d).toMatchObject({
      kind: '3d',
      requestId: 101,
      ok: true,
    });
    if (res3d.ok && res3d.kind === '3d') {
      expect(res3d.data.integralResult?.riemannSum).toBeCloseTo(16, 12);
    }

    // 2. 3D 非法表达式错误拦截
    workerScope.onmessage!({
      data: {
        kind: '3d',
        requestId: 102,
        request: {
          expression: 'x^y',
          xMin: -1,
          xMax: 1,
          yDomainMin: -1,
          yDomainMax: 1,
          gridSize: 16,
        },
      },
    } as MessageEvent<PlotWorkerRequest>);

    expect(posted[1]).toMatchObject({
      kind: '3d',
      requestId: 102,
      ok: false,
    });

    // 3. 原有 1D 请求完全兼容
    workerScope.onmessage!({
      data: {
        requestId: 103,
        request: {
          expression: 'x^2',
          xMin: -1,
          xMax: 1,
        },
      },
    } as MessageEvent<PlotWorkerRequest>);

    expect(posted[2]).toMatchObject({
      requestId: 103,
      ok: true,
    });
    expect(posted[2].kind).toBeUndefined();
  });
});
