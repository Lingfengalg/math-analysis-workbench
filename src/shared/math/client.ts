import type {
  PlotRequest,
  PlotResult,
  PlotWorkerRequest,
  PlotWorkerResponse,
  SurfacePlotRequest,
  SurfacePlotResult,
} from '@/shared/contracts';

type PendingTask =
  | {
      kind: '1d';
      request: PlotRequest;
      resolve: (value: PlotResult) => void;
      reject: (reason: Error | DOMException) => void;
      cleanup: () => void;
    }
  | {
      kind: '3d';
      request: SurfacePlotRequest;
      resolve: (value: SurfacePlotResult) => void;
      reject: (reason: Error | DOMException) => void;
      cleanup: () => void;
    };

const WORKER_TIMEOUT_MS = 8000;

let sharedWorker: Worker | null = null;
let nextRequestId = 1;
const pendingTasks = new Map<number, PendingTask>();

function destroySharedWorker(): void {
  if (!sharedWorker) return;
  const current = sharedWorker;
  sharedWorker = null;
  current.onmessage = null;
  current.onerror = null;
  current.terminate();
}

function failAllPending(error: Error): void {
  const entries = Array.from(pendingTasks.values());
  pendingTasks.clear();
  for (const entry of entries) {
    entry.cleanup();
    entry.reject(error);
  }
}

function toWorkerPayload(id: number, task: PendingTask): PlotWorkerRequest {
  if (task.kind === '3d') {
    return { kind: '3d', requestId: id, request: task.request };
  }
  return { requestId: id, request: task.request };
}

function getOrCreateWorker(): Worker {
  if (sharedWorker) {
    return sharedWorker;
  }
  const worker = new Worker(new URL('./plot.worker.ts', import.meta.url), {
    type: 'module',
  });
  worker.onmessage = (event: MessageEvent<PlotWorkerResponse>) => {
    const { requestId } = event.data;
    const matchedId =
      requestId !== undefined
        ? requestId
        : pendingTasks.size === 1
          ? pendingTasks.keys().next().value
          : undefined;
    if (matchedId === undefined) return;
    const task = pendingTasks.get(matchedId);
    if (!task) return;
    pendingTasks.delete(matchedId);
    task.cleanup();
    if (event.data.ok) {
      if (task.kind === '3d' && event.data.kind === '3d') {
        task.resolve(event.data.data);
      } else if (task.kind === '1d' && event.data.kind !== '3d') {
        task.resolve(event.data.data);
      } else {
        task.reject(new Error('计算结果类型不匹配。'));
      }
    } else {
      task.reject(new Error(event.data.error));
    }
  };
  worker.onerror = () => {
    destroySharedWorker();
    failAllPending(new Error('计算模块加载失败，请刷新后重试。'));
  };
  sharedWorker = worker;
  return worker;
}

function redispatchSurvivingTasks(): void {
  if (pendingTasks.size === 0) return;
  try {
    const worker = getOrCreateWorker();
    for (const [id, task] of pendingTasks.entries()) {
      worker.postMessage(toWorkerPayload(id, task));
    }
  } catch {
    destroySharedWorker();
    failAllPending(new Error('计算模块加载失败，请刷新后重试。'));
  }
}

export function resetPlotWorkerForTesting(): void {
  destroySharedWorker();
  for (const task of pendingTasks.values()) {
    task.cleanup();
  }
  pendingTasks.clear();
  nextRequestId = 1;
}

function enqueueWorkerTask<TReq, TRes>(
  buildTask: (
    resolve: (value: TRes) => void,
    reject: (reason: Error | DOMException) => void,
    cleanup: () => void,
  ) => PendingTask,
  _request: TReq,
  signal: AbortSignal,
): Promise<TRes> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('已取消', 'AbortError'));
      return;
    }

    const requestId = nextRequestId;
    nextRequestId += 1;

    const cleanup = () => {
      globalThis.clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      if (!pendingTasks.delete(requestId)) return;
      cleanup();
      destroySharedWorker();
      reject(new DOMException('已取消', 'AbortError'));
      redispatchSurvivingTasks();
    };

    const timer = globalThis.setTimeout(() => {
      if (!pendingTasks.delete(requestId)) return;
      cleanup();
      destroySharedWorker();
      reject(new Error('计算或模块加载超时，请简化表达式后重试。'));
      redispatchSurvivingTasks();
    }, WORKER_TIMEOUT_MS);

    signal.addEventListener('abort', onAbort, { once: true });
    const task = buildTask(resolve, reject, cleanup);
    pendingTasks.set(requestId, task);

    try {
      const worker = getOrCreateWorker();
      worker.postMessage(toWorkerPayload(requestId, task));
    } catch {
      pendingTasks.delete(requestId);
      cleanup();
      destroySharedWorker();
      reject(new Error('计算模块加载失败，请刷新后重试。'));
    }
  });
}

export function calculatePlot(
  request: PlotRequest,
  signal: AbortSignal,
): Promise<PlotResult> {
  return enqueueWorkerTask<PlotRequest, PlotResult>(
    (resolve, reject, cleanup) => ({
      kind: '1d',
      request,
      resolve,
      reject,
      cleanup,
    }),
    request,
    signal,
  );
}

export function calculateSurface(
  request: SurfacePlotRequest,
  signal: AbortSignal,
): Promise<SurfacePlotResult> {
  return enqueueWorkerTask<SurfacePlotRequest, SurfacePlotResult>(
    (resolve, reject, cleanup) => ({
      kind: '3d',
      request,
      resolve,
      reject,
      cleanup,
    }),
    request,
    signal,
  );
}
