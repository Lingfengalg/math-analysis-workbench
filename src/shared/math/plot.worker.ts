/// <reference lib="webworker" />
import { sampleFunction } from './sample';
import { calculateTaylorPolynomial } from './taylor';
import type { PlotWorkerMessage, PlotWorkerResponse } from '@/shared/contracts';

self.onmessage = (event: MessageEvent<PlotWorkerMessage>) => {
  let response: PlotWorkerResponse;
  try {
    response =
      event.data.type === 'taylor'
        ? {
            ok: true,
            type: 'taylor',
            data: calculateTaylorPolynomial(
              event.data.request,
              event.data.center,
              event.data.order,
            ),
          }
        : { ok: true, type: 'plot', data: sampleFunction(event.data.request) };
  } catch (error) {
    response = {
      ok: false,
      error: error instanceof Error ? error.message : '计算失败，请检查输入。',
    };
  }
  self.postMessage(response);
};
