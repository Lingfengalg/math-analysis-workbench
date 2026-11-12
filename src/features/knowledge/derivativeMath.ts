export type DemoFunction = 'square' | 'absolute';

/** 固定教学例子，不解析或执行用户输入。 */
export function evaluateDemo(kind: DemoFunction, x: number): number {
  return kind === 'square' ? x * x : Math.abs(x);
}

export function observeDerivative(kind: DemoFunction, x: number, h: number) {
  const value = evaluateDemo(kind, x);
  const nextValue = evaluateDemo(kind, x + h);
  const secant = h === 0 ? null : (nextValue - value) / h;
  const tangent = kind === 'square' ? 2 * x : x === 0 ? null : Math.sign(x);
  return { value, nextValue, secant, tangent };
}

export function formatDemoNumber(value: number): string {
  return String(Number(value.toFixed(2)));
}
