import type {
  PlotRequest,
  PlotResult,
  PlotWorkerResponse,
} from '@/shared/contracts';

export function calculatePlot(
  request: PlotRequest,
  signal: AbortSignal,
): Promise<PlotResult> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('已取消', 'AbortError'));
      return;
    }
    const worker = new Worker(new URL('./plot.worker.ts', import.meta.url), {
      type: 'module',
    });
    const cleanup = () => {
      window.clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      worker.terminate();
    };
    const abort = () => {
      cleanup();
      reject(new DOMException('已取消', 'AbortError'));
    };
    // Includes initial worker/module loading time; do not block the UI thread.
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('计算或模块加载超时，请简化表达式后重试。'));
    }, 8000);
    signal.addEventListener('abort', abort, { once: true });
    worker.onmessage = (event: MessageEvent<PlotWorkerResponse>) => {
      cleanup();
      if (event.data.ok) resolve(event.data.data);
      else reject(new Error(event.data.error));
    };
    worker.onerror = () => {
      cleanup();
      reject(new Error('计算模块加载失败，请刷新后重试。'));
    };
    worker.postMessage(request);
  });
}
