import type { KnowledgeCard } from '@/shared/contracts';

/**
 * 参与搜索的字段：标题、定义、适用条件、例题说明、常见误区、参考说明。
 *
 * 不包含 `formula`（KaTeX 源码如 `\lim_{x\to a}` 对用户没有检索意义），
 * 也不包含 `examples[].plot` 的表达式——绘图参数属于展示配置，不是正文。
 */
export function knowledgeSearchText(card: KnowledgeCard): string {
  return [
    card.title,
    card.definition,
    ...card.conditions,
    ...card.examples.map((example) => example.explanation),
    ...card.pitfalls,
    ...card.references,
  ].join('\n');
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** 空白输入不产生关键词；多个关键词按空格切分，需全部命中（AND）。 */
export function tokenizeKnowledgeQuery(query: string): string[] {
  const normalized = normalize(query);
  return normalized === '' ? [] : normalized.split(' ');
}

export function matchesKnowledgeQuery(
  card: KnowledgeCard,
  query: string,
): boolean {
  const tokens = tokenizeKnowledgeQuery(query);
  if (tokens.length === 0) return true;
  const text = normalize(knowledgeSearchText(card));
  return tokens.every((token) => text.includes(token));
}
