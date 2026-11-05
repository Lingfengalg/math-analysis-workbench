/// <reference lib="webworker" />
import { compileExpression, sampleFunction, sampleSequence } from './sample';
import { detectIntersections } from './intersections';
import {
  plotRequestSchema,
  type PlotRequest,
  type PlotWorkerMessage,
  type PlotWorkerResponse,
} from '@/shared/contracts';

function validated(request: PlotRequest): PlotRequest {
  const valid = plotRequestSchema.safeParse(request);
  if (!valid.success) throw new Error(valid.error.issues[0].message);
  return valid.data;
}

self.onmessage = (event: MessageEvent<PlotWorkerMessage>) => {
  let response: PlotWorkerResponse;
  try {
    if (event.data.type === 'intersections') {
      const a = validated(event.data.a);
      const b = validated(event.data.b);
      const points = detectIntersections(
        compileExpression(a.expression),
        compileExpression(b.expression),
        a.xMin,
        a.xMax,
      );
      response = { ok: true, type: 'intersections', data: { points } };
    } else if (event.data.type === 'sequence') {
      response = {
        ok: true,
        type: 'sequence',
        data: sampleSequence(event.data.request),
      };
    } else {
      response = {
        ok: true,
        type: 'plot',
        data: sampleFunction(event.data.request),
      };
    }
  } catch (error) {
    response = {
      ok: false,
      error: error instanceof Error ? error.message : '计算失败，请检查输入。',
    };
  }
  self.postMessage(response);
};
