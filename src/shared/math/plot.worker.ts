/// <reference lib="webworker" />
import { sampleFunction } from './sample';
import type { PlotRequest, PlotWorkerResponse } from '@/shared/contracts';

self.onmessage = (event: MessageEvent<PlotRequest>) => {
  let response: PlotWorkerResponse;
  try {
    response = { ok: true, data: sampleFunction(event.data) };
  } catch (error) {
    response = {
      ok: false,
      error: error instanceof Error ? error.message : '计算失败，请检查输入。',
    };
  }
  self.postMessage(response);
};
