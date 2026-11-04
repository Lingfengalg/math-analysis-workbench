/// <reference lib="webworker" />
import { sampleFunction } from './sample';
import { calculateTangent } from './tangent';
import type { PlotWorkerMessage, PlotWorkerResponse } from '@/shared/contracts';

self.onmessage = (event: MessageEvent<PlotWorkerMessage>) => {
  let response: PlotWorkerResponse;
  try {
    response =
      event.data.type === 'tangent'
        ? {
            ok: true,
            type: 'tangent',
            data: calculateTangent(
              event.data.request.expression,
              event.data.x0,
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
