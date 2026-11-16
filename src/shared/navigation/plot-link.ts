import type { z } from 'zod';
import {
  plotRequestSchema,
  surfacePlotRequestSchema,
  tripleIntegralRequestSchema,
  type PlotRequest,
  type SurfacePlotRequest,
  type TripleIntegralRequest,
} from '@/shared/contracts';

export function createPlotLink(request: PlotRequest): string {
  const value = plotRequestSchema.parse(request);
  const search = new URLSearchParams({
    expression: value.expression,
    xMin: String(value.xMin),
    xMax: String(value.xMax),
  });
  if (value.compareExpression)
    search.set('compareExpression', value.compareExpression);
  if (value.yMin !== undefined) search.set('yMin', String(value.yMin));
  if (value.yMax !== undefined) search.set('yMax', String(value.yMax));
  if (value.secant) {
    search.set('secantX0', String(value.secant.x0));
    search.set('secantH', String(value.secant.h));
  }
  if (value.sourceKnowledgeId)
    search.set('sourceKnowledgeId', value.sourceKnowledgeId);
  if (value.sourceMistakeId)
    search.set('sourceMistakeId', value.sourceMistakeId);
  return `/plotting?${search.toString()}`;
}

export function parsePlotSearch(search: URLSearchParams): PlotRequest | null {
  const mode = search.get('mode');
  if (mode === '3d' || mode === '3d-triple') return null;
  if (!search.has('expression')) return null;
  const numberParam = (name: string, fallback: number) => {
    const raw = search.get(name);
    return raw === null ? fallback : raw.trim() === '' ? NaN : Number(raw);
  };
  const optionalNumberParam = (name: string): number | undefined => {
    const raw = search.get(name);
    if (raw === null) return undefined;
    return raw.trim() === '' ? NaN : Number(raw);
  };
  const hasSecant = search.has('secantX0') || search.has('secantH');
  const secant = hasSecant
    ? {
        x0: optionalNumberParam('secantX0') ?? NaN,
        h: optionalNumberParam('secantH') ?? NaN,
      }
    : undefined;
  const compareRaw = search.get('compareExpression');
  const payload: Record<string, unknown> = {
    expression: search.get('expression'),
    xMin: numberParam('xMin', -5),
    xMax: numberParam('xMax', 5),
  };
  if (compareRaw !== null) payload.compareExpression = compareRaw;
  const yMin = optionalNumberParam('yMin');
  const yMax = optionalNumberParam('yMax');
  if (yMin !== undefined) payload.yMin = yMin;
  if (yMax !== undefined) payload.yMax = yMax;
  if (secant !== undefined) payload.secant = secant;
  const sourceKnowledgeId = search.get('sourceKnowledgeId');
  if (sourceKnowledgeId !== null) payload.sourceKnowledgeId = sourceKnowledgeId;
  const sourceMistakeId = search.get('sourceMistakeId');
  if (sourceMistakeId !== null) payload.sourceMistakeId = sourceMistakeId;

  const result = plotRequestSchema.safeParse(payload);
  return result.success ? result.data : null;
}

export function createSurfacePlotLink(
  request: z.input<typeof surfacePlotRequestSchema>,
): string {
  const value = surfacePlotRequestSchema.parse(request);
  const search = new URLSearchParams({
    mode: '3d',
    expression: value.expression,
    xMin: String(value.xMin),
    xMax: String(value.xMax),
    yDomainMin: String(value.yDomainMin),
    yDomainMax: String(value.yDomainMax),
    gridSize: String(value.gridSize),
  });
  if (value.zMin !== undefined) search.set('zMin', String(value.zMin));
  if (value.zMax !== undefined) search.set('zMax', String(value.zMax));
  if (value.integral) {
    search.set('intRegion', value.integral.regionType);
    search.set('intX0', String(value.integral.xStart));
    search.set('intX1', String(value.integral.xEnd));
    search.set('intY0', String(value.integral.yStart));
    search.set('intY1', String(value.integral.yEnd));
    search.set('intN', String(value.integral.partitions));
    search.set('intRule', value.integral.rule);
    if (value.integral.yLowerExpr)
      search.set('intYLo', value.integral.yLowerExpr);
    if (value.integral.yUpperExpr)
      search.set('intYHi', value.integral.yUpperExpr);
    if (value.integral.xLowerExpr)
      search.set('intXLo', value.integral.xLowerExpr);
    if (value.integral.xUpperExpr)
      search.set('intXHi', value.integral.xUpperExpr);
  }
  if (value.probe) {
    search.set('probeX', String(value.probe.x0));
    search.set('probeY', String(value.probe.y0));
  }
  if (value.sourceKnowledgeId)
    search.set('sourceKnowledgeId', value.sourceKnowledgeId);
  if (value.sourceMistakeId)
    search.set('sourceMistakeId', value.sourceMistakeId);
  return `/plotting?${search.toString()}`;
}

export function parseSurfacePlotSearch(
  search: URLSearchParams,
): SurfacePlotRequest | null {
  if (search.get('mode') !== '3d' || !search.has('expression')) return null;
  const num = (name: string, fallback: number) => {
    const raw = search.get(name);
    return raw === null ? fallback : raw.trim() === '' ? NaN : Number(raw);
  };
  const optNum = (name: string): number | undefined => {
    const raw = search.get(name);
    if (raw === null) return undefined;
    return raw.trim() === '' ? NaN : Number(raw);
  };

  const payload: Record<string, unknown> = {
    expression: search.get('expression'),
    xMin: num('xMin', -3),
    xMax: num('xMax', 3),
    yDomainMin: num('yDomainMin', -3),
    yDomainMax: num('yDomainMax', 3),
    gridSize: num('gridSize', 56),
  };
  const zMin = optNum('zMin');
  const zMax = optNum('zMax');
  if (zMin !== undefined) payload.zMin = zMin;
  if (zMax !== undefined) payload.zMax = zMax;

  if (search.has('intRegion')) {
    const integralObj: Record<string, unknown> = {
      regionType: search.get('intRegion'),
      xStart: num('intX0', -2),
      xEnd: num('intX1', 2),
      yStart: num('intY0', -2),
      yEnd: num('intY1', 2),
      partitions: num('intN', 14),
      rule: search.get('intRule') ?? 'midpoint',
    };
    const yLo = search.get('intYLo');
    const yHi = search.get('intYHi');
    const xLo = search.get('intXLo');
    const xHi = search.get('intXHi');
    if (yLo !== null) integralObj.yLowerExpr = yLo;
    if (yHi !== null) integralObj.yUpperExpr = yHi;
    if (xLo !== null) integralObj.xLowerExpr = xLo;
    if (xHi !== null) integralObj.xUpperExpr = xHi;
    payload.integral = integralObj;
  }
  if (search.has('probeX') || search.has('probeY')) {
    payload.probe = {
      x0: optNum('probeX') ?? NaN,
      y0: optNum('probeY') ?? NaN,
    };
  }
  const sourceKnowledgeId = search.get('sourceKnowledgeId');
  if (sourceKnowledgeId !== null) payload.sourceKnowledgeId = sourceKnowledgeId;
  const sourceMistakeId = search.get('sourceMistakeId');
  if (sourceMistakeId !== null) payload.sourceMistakeId = sourceMistakeId;

  const result = surfacePlotRequestSchema.safeParse(payload);
  return result.success ? result.data : null;
}

export function createTriplePlotLink(
  request: z.input<typeof tripleIntegralRequestSchema>,
): string {
  const value = tripleIntegralRequestSchema.parse(request);
  const search = new URLSearchParams({
    mode: '3d-triple',
    expression: value.expression,
    regionType: value.regionType,
    xMin: String(value.xMin),
    xMax: String(value.xMax),
    yMin: String(value.yMin),
    yMax: String(value.yMax),
    zMin: String(value.zMin),
    zMax: String(value.zMax),
    partitions: String(value.partitions),
  });
  if (value.sliceZ !== undefined) search.set('sliceZ', String(value.sliceZ));
  if (value.sourceKnowledgeId)
    search.set('sourceKnowledgeId', value.sourceKnowledgeId);
  if (value.sourceMistakeId)
    search.set('sourceMistakeId', value.sourceMistakeId);
  return `/plotting?${search.toString()}`;
}

export function parseTriplePlotSearch(
  search: URLSearchParams,
): TripleIntegralRequest | null {
  if (search.get('mode') !== '3d-triple' || !search.has('expression'))
    return null;
  const num = (name: string, fallback: number) => {
    const raw = search.get(name);
    return raw === null ? fallback : raw.trim() === '' ? NaN : Number(raw);
  };
  const optNum = (name: string): number | undefined => {
    const raw = search.get(name);
    if (raw === null) return undefined;
    return raw.trim() === '' ? NaN : Number(raw);
  };
  const payload: Record<string, unknown> = {
    expression: search.get('expression'),
    regionType: search.get('regionType') ?? 'sphere',
    xMin: num('xMin', -2),
    xMax: num('xMax', 2),
    yMin: num('yMin', -2),
    yMax: num('yMax', 2),
    zMin: num('zMin', -2),
    zMax: num('zMax', 2),
    partitions: num('partitions', 12),
  };
  const sliceZ = optNum('sliceZ');
  if (sliceZ !== undefined) payload.sliceZ = sliceZ;
  const sourceKnowledgeId = search.get('sourceKnowledgeId');
  if (sourceKnowledgeId !== null) payload.sourceKnowledgeId = sourceKnowledgeId;
  const sourceMistakeId = search.get('sourceMistakeId');
  if (sourceMistakeId !== null) payload.sourceMistakeId = sourceMistakeId;

  const result = tripleIntegralRequestSchema.safeParse(payload);
  return result.success ? result.data : null;
}
