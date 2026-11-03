/// <reference lib="webworker" />
import { sampleFunction, sampleSequence } from './sample';
import type { PlotWorkerMessage, PlotWorkerResponse } from '@/shared/contracts';

self.onmessage = (event: MessageEvent<PlotWorkerMessage>) => {
  let response: PlotWorkerResponse;
  try {
    const data =
      event.data.kind === 'function'
        ? sampleFunction(event.data.request)
        : sampleSequence(event.data.request);
    response = { ok: true, data };
  } catch (error) {
    response = {
      ok: false,
      error: error instanceof Error ? error.message : '计算失败，请检查输入。',
    };
  }
  self.postMessage(response);
};
