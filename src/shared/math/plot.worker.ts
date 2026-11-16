/// <reference lib="webworker" />
import { sampleFunction } from './sample';
import { sampleSurface } from './surface';
import { sampleTripleIntegral } from './volume';
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

function buildErrorResponse(
  kind: '3d' | '3d-triple' | undefined,
  requestId: number | undefined,
  error: unknown,
): PlotWorkerResponse {
  const message =
    error instanceof Error ? error.message : '计算失败，请检查输入。';
  if (kind !== undefined) {
    return requestId !== undefined
      ? { kind, requestId, ok: false, error: message }
      : { kind, ok: false, error: message };
  }
  return requestId !== undefined
    ? { requestId, ok: false, error: message }
    : { ok: false, error: message };
}

self.onmessage = (event: MessageEvent<PlotWorkerRequest | PlotRequest>) => {
  const payload = event.data;

  if (isPlotWorkerRequest(payload) && payload.kind === '3d') {
    const { requestId, request } = payload;
    let response: PlotWorkerResponse;
    try {
      const data = sampleSurface(request);
      response =
        requestId !== undefined
          ? { kind: '3d', requestId, ok: true, data }
          : { kind: '3d', ok: true, data };
    } catch (error) {
      response = buildErrorResponse('3d', requestId, error);
    }
    self.postMessage(response);
    return;
  }

  if (isPlotWorkerRequest(payload) && payload.kind === '3d-triple') {
    const { requestId, request } = payload;
    let response: PlotWorkerResponse;
    try {
      const data = sampleTripleIntegral(request);
      response =
        requestId !== undefined
          ? { kind: '3d-triple', requestId, ok: true, data }
          : { kind: '3d-triple', ok: true, data };
    } catch (error) {
      response = buildErrorResponse('3d-triple', requestId, error);
    }
    self.postMessage(response);
    return;
  }

  const envelope = isPlotWorkerRequest(payload);
  const requestId = envelope ? payload.requestId : undefined;
  const plotRequest = envelope ? payload.request : payload;

  let response: PlotWorkerResponse;
  try {
    const data = sampleFunction(plotRequest);
    response =
      requestId !== undefined
        ? { requestId, ok: true, data }
        : { ok: true, data };
  } catch (error) {
    response = buildErrorResponse(undefined, requestId, error);
  }
  self.postMessage(response);
};
