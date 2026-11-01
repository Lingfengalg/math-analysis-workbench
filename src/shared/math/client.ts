import type {
  PlotRequest,
  PlotResult,
  PlotWorkerResponse,
} from '@/shared/contracts';

// 测试注入点：默认创建真实绘图 Worker；单测可传入模拟实现。
export type PlotWorkerFactory = () => Worker;

function createPlotWorker(): Worker {
  return new Worker(new URL('./plot.worker.ts', import.meta.url), {
    type: 'module',
  });
}

export function calculatePlot(
  request: PlotRequest,
  signal: AbortSignal,
  createWorker: PlotWorkerFactory = createPlotWorker,
): Promise<PlotResult> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('已取消', 'AbortError'));
      return;
    }
    let settled = false;
    let worker: Worker | null = null;
    // 所有结束路径统一清理：清定时器、移除 abort 监听、终止 Worker。
    function cleanup() {
      window.clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      worker?.terminate();
      worker = null;
    }
    // Promise 只完成一次：完成后到达的消息、错误、取消与超时全部忽略。
    function settle(done: () => void) {
      if (settled) return;
      settled = true;
      cleanup();
      done();
    }
    function abort() {
      settle(() => reject(new DOMException('已取消', 'AbortError')));
    }
    try {
      worker = createWorker();
    } catch {
      reject(new Error('无法启动计算模块，请刷新后重试。'));
      return;
    }
    // Includes initial worker/module loading time; do not block the UI thread.
    const timer = window.setTimeout(() => {
      settle(() =>
        reject(new Error('计算或模块加载超时，请简化表达式后重试。')),
      );
    }, 8000);
    signal.addEventListener('abort', abort, { once: true });
    // 关闭「初始检查」与「注册监听」之间的竞态窗口。
    if (signal.aborted) abort();
    worker.onmessage = (event: MessageEvent<PlotWorkerResponse>) => {
      settle(() => {
        if (event.data.ok) resolve(event.data.data);
        else reject(new Error(event.data.error));
      });
    };
    worker.onerror = () => {
      settle(() => reject(new Error('计算模块加载失败，请刷新后重试。')));
    };
    worker.onmessageerror = () => {
      settle(() =>
        reject(new Error('计算模块返回了无法解析的数据，请刷新后重试。')),
      );
    };
    try {
      worker.postMessage(request);
    } catch {
      settle(() => reject(new Error('无法向计算模块发送任务，请刷新后重试。')));
    }
  });
}
