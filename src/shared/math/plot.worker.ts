/// <reference lib="webworker" />
import { sampleFunction } from './sample';
import type {
  PlotRequest,
  PlotWorkerRequest,
  PlotWorkerResponse,
} from '@/shared/contracts';

function isPlotWorkerRequest(
  payload: PlotWorkerRequest | PlotRequest,
): payload is PlotWorkerRequest {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'request' in payload &&
    typeof payload.request === 'object' &&
    payload.request !== null
  );
}

self.onmessage = (event: MessageEvent<PlotWorkerRequest | PlotRequest>) => {
  const envelope = isPlotWorkerRequest(event.data);
  const requestId = envelope ? event.data.requestId : undefined;
  const plotRequest = envelope ? event.data.request : event.data;

  let response: PlotWorkerResponse;
  try {
    const data = sampleFunction(plotRequest);
    response =
      requestId !== undefined
        ? { requestId, ok: true, data }
        : { ok: true, data };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '计算失败，请检查输入。';
    response =
      requestId !== undefined
        ? { requestId, ok: false, error: message }
        : { ok: false, error: message };
  }
  self.postMessage(response);
};
