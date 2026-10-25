import { plotRequestSchema, type PlotRequest } from '@/shared/contracts';

export function createPlotLink(request: PlotRequest): string {
  const value = plotRequestSchema.parse(request);
  const search = new URLSearchParams({
    expression: value.expression,
    xMin: String(value.xMin),
    xMax: String(value.xMax),
  });
  if (value.sourceKnowledgeId)
    search.set('sourceKnowledgeId', value.sourceKnowledgeId);
  return `/plotting?${search.toString()}`;
}

export function parsePlotSearch(search: URLSearchParams): PlotRequest | null {
  if (!search.has('expression')) return null;
  const numberParam = (name: string, fallback: number) => {
    const raw = search.get(name);
    return raw === null ? fallback : raw.trim() === '' ? NaN : Number(raw);
  };
  const result = plotRequestSchema.safeParse({
    expression: search.get('expression'),
    xMin: numberParam('xMin', -5),
    xMax: numberParam('xMax', 5),
    sourceKnowledgeId: search.get('sourceKnowledgeId') ?? undefined,
  });
  return result.success ? result.data : null;
}
