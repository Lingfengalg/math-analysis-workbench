import type { IntersectionPoint } from '@/shared/contracts';

// 与基础采样同密度的扫描步数；更密的扫描同样不保证不遗漏交点。
export const INTERSECTION_SCAN_STEPS = 801;
// 交点密集时只保留前若干个，保证图上标记与文字列表可读。
export const MAX_INTERSECTION_POINTS = 8;
// 异号区间上的二分次数；远超浮点精度需求。
const BISECT_STEPS = 60;

type Evaluator = (x: number) => number | null;

// Halve [left, right] around a sign change of the difference; gives up
// (returns null) when a probe cannot be evaluated, which happens when the
// sign change is really a pole of f - g rather than a crossing.
function bisectDifference(
  evaluateDifference: Evaluator,
  left: number,
  leftValue: number,
  right: number,
): number | null {
  let a = left;
  let aValue = leftValue;
  let b = right;
  for (let i = 0; i < BISECT_STEPS; i += 1) {
    const mid = (a + b) / 2;
    const value = evaluateDifference(mid);
    if (value === null) return null;
    if (aValue * value <= 0) b = mid;
    else {
      a = mid;
      aValue = value;
    }
  }
  return (a + b) / 2;
}

/**
 * Approximate intersections of two functions by scanning the difference
 * f - g on a uniform grid and bisecting every sign change. Purely numeric:
 * touches (tangency), crossings hidden inside unsampled gaps, and points
 * where either function cannot be evaluated are missed on purpose.
 * Points are returned in ascending x order, capped at
 * MAX_INTERSECTION_POINTS.
 */
export function detectIntersections(
  evaluateFirst: Evaluator,
  evaluateSecond: Evaluator,
  xMin: number,
  xMax: number,
  steps = INTERSECTION_SCAN_STEPS,
): IntersectionPoint[] {
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMin >= xMax)
    throw new Error('观察区间无效。');
  if (!Number.isInteger(steps) || steps < 3 || steps > 1201)
    throw new Error('扫描步数须为 3–1201 之间的整数。');
  const evaluateDifference = (x: number) => {
    const a = evaluateFirst(x);
    if (a === null) return null;
    const b = evaluateSecond(x);
    if (b === null) return null;
    return a - b;
  };
  const samples: Array<[number, number]> = [];
  for (let i = 0; i < steps; i += 1) {
    const x = xMin + ((xMax - xMin) * i) / (steps - 1);
    const difference = evaluateDifference(x);
    if (difference !== null) samples.push([x, difference]);
  }
  const points: IntersectionPoint[] = [];
  for (
    let i = 0;
    i < samples.length && points.length < MAX_INTERSECTION_POINTS;
    i += 1
  ) {
    const [x, difference] = samples[i];
    if (difference === 0) {
      // 恰在样本点上为零：只有两侧非零差值异号（穿越）才算交点；
      // 连续零段取中点作为近似位置，全区间重合时不产生标记。
      let j = i;
      while (j + 1 < samples.length && samples[j + 1][1] === 0) j += 1;
      const before = i > 0 ? samples[i - 1][1] : null;
      const after = j + 1 < samples.length ? samples[j + 1][1] : null;
      if (before !== null && after !== null && before * after < 0) {
        const midX = (x + samples[j][0]) / 2;
        const y = evaluateFirst(midX) ?? evaluateSecond(midX);
        if (y !== null) points.push({ x: midX, y });
      }
      i = j;
      continue;
    }
    const previous = samples[i - 1];
    if (previous && previous[1] !== 0 && previous[1] * difference < 0) {
      const rootX = bisectDifference(
        evaluateDifference,
        previous[0],
        previous[1],
        x,
      );
      if (rootX !== null) {
        const y = evaluateFirst(rootX) ?? evaluateSecond(rootX);
        if (y !== null) points.push({ x: rootX, y });
      }
    }
  }
  return points;
}
