import { z } from 'zod';
import { knowledgeTopicSchema } from '@/shared/contracts';

const draftSchema = z.object({
  topic: knowledgeTopicSchema.optional(),
  relatedKnowledgeId: z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/)
    .optional(),
  title: z.string().trim().min(1).max(120).optional(),
  expression: z.string().trim().min(1).max(160).optional(),
  xMin: z.number().finite().min(-10000).max(10000).optional(),
  xMax: z.number().finite().min(-10000).max(10000).optional(),
});

export type MistakeDraftQuery = z.infer<typeof draftSchema>;

export function createMistakeDraftLink(draft: MistakeDraftQuery): string {
  const valid = draftSchema.parse(draft);
  const search = new URLSearchParams({ draft: '1' });
  if (valid.topic) search.set('topic', valid.topic);
  if (valid.relatedKnowledgeId)
    search.set('relatedKnowledgeId', valid.relatedKnowledgeId);
  if (valid.title) search.set('title', valid.title);
  if (valid.expression) search.set('expression', valid.expression);
  if (valid.xMin !== undefined) search.set('xMin', String(valid.xMin));
  if (valid.xMax !== undefined) search.set('xMax', String(valid.xMax));
  return `/mistakes?${search.toString()}`;
}

export function parseMistakeDraftSearch(
  search: URLSearchParams,
): MistakeDraftQuery | null {
  if (search.get('draft') !== '1') return null;
  const optNum = (name: string): number | undefined => {
    const raw = search.get(name);
    if (raw === null || raw.trim() === '') return undefined;
    const num = Number(raw);
    return Number.isFinite(num) ? num : undefined;
  };
  const topicCheck = knowledgeTopicSchema.safeParse(search.get('topic'));
  const cardRaw = search.get('relatedKnowledgeId');
  const cardCheck = z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/)
    .safeParse(cardRaw);
  const titleRaw = search.get('title')?.trim();
  const exprRaw = search.get('expression')?.trim();
  const xMin = optNum('xMin');
  const xMax = optNum('xMax');

  const candidate: MistakeDraftQuery = {};
  if (topicCheck.success) candidate.topic = topicCheck.data;
  if (cardCheck.success) candidate.relatedKnowledgeId = cardCheck.data;
  if (titleRaw && titleRaw.length <= 120) candidate.title = titleRaw;
  if (exprRaw && exprRaw.length <= 160) candidate.expression = exprRaw;
  if (xMin !== undefined && xMax !== undefined && xMin < xMax) {
    candidate.xMin = xMin;
    candidate.xMax = xMax;
  }
  const result = draftSchema.safeParse(candidate);
  return result.success ? result.data : null;
}
