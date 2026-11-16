import {
  assistantContextSchema,
  type AssistantContext,
} from '@/shared/contracts';

export function createAssistantLink(
  context?: AssistantContext,
  prompt?: string,
): string {
  const search = new URLSearchParams();
  if (context) {
    const valid = assistantContextSchema.parse(context);
    search.set('ctxKind', valid.kind);
    search.set('ctxTitle', valid.title);
    search.set('ctxSummary', valid.summary);
    if (valid.id) search.set('ctxId', valid.id);
    if (valid.formula) search.set('ctxFormula', valid.formula);
  }
  if (prompt && prompt.trim()) {
    search.set('q', prompt.trim().slice(0, 300));
  }
  const serialized = search.toString();
  return serialized ? `/assistant?${serialized}` : '/assistant';
}

export function parseAssistantSearch(search: URLSearchParams): {
  context?: AssistantContext;
  prompt?: string;
} {
  let context: AssistantContext | undefined;
  if (search.has('ctxKind')) {
    const check = assistantContextSchema.safeParse({
      kind: search.get('ctxKind'),
      id: search.get('ctxId') ?? undefined,
      title: search.get('ctxTitle') ?? '',
      summary: search.get('ctxSummary') ?? '',
      formula: search.get('ctxFormula') ?? undefined,
    });
    if (check.success) {
      context = check.data;
    }
  }
  const rawPrompt = search.get('q')?.trim();
  return {
    context,
    prompt: rawPrompt && rawPrompt.length <= 300 ? rawPrompt : undefined,
  };
}
