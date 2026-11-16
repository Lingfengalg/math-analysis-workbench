import { plotRequestSchema, type PlotRequest } from '@/shared/contracts';

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
