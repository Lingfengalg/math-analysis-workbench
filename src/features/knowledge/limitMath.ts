export type LimitExample = 'square' | 'jump';

/** 固定示例；progress 仅在 0–100 间，距离始终大于零。 */
export function observeLimit(example: LimitExample, progress: number) {
  const p = Math.max(0, Math.min(100, progress));
  const distance = 1 - (0.99 * p) / 100;
  const center = example === 'square' ? 1 : 0;
  const leftX = center - distance;
  const rightX = center + distance;
  return {
    center,
    distance,
    leftX,
    rightX,
    leftY: example === 'square' ? leftX * leftX : -1,
    rightY: example === 'square' ? rightX * rightX : 1,
  };
}

export function formatLimitNumber(value: number): string {
  return String(Number(value.toFixed(3)));
}
