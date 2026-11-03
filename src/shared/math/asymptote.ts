// 水平渐近趋势的数值启发式：对观察窗口的左右尾部找「有限值趋于稳定」的
// 候选，并在窗口外探测少量点判断趋势是否延续。纯数值观察，不构成极限证明，
// 可能漏检或误判；探测点不绘制、不写入图像点。

import type {
  HorizontalAsymptoteCandidate,
  PlotPoint,
} from '@/shared/contracts';

export type Evaluate = (x: number) => number | null;

// 尾部窗口占有限图像点的比例
const TAIL_FRACTION = 0.15;
// 尾部至少需要的有限点数
const MIN_TAIL_POINTS = 10;
// 尾部后半段变化幅度需缩小到前半段的该比例以内，才认为「趋于稳定」
const CONVERGE_RATIO = 0.75;
// 振荡判定：相邻差值符号变化次数上限（sin 类振荡函数远超此值）
const MAX_SIGN_CHANGES = 2;
// 窗口外探测间距（按窗口宽度的倍数向外推进）；探测点仅用于趋势判断
const PROBE_FACTORS = [0.1, 0.3, 1, 3] as const;

/**
 * 检测左右尾部的水平渐近线候选。
 *
 * 步骤：取尾部有限点 → 拒绝振荡尾部 → 要求后半段比前半段更「平」 →
 * 在窗口外探测少量点，要求探测值不远离尾部边缘值（指数型函数的发散侧
 * 会快速跑出容差带而被拒绝）。候选 y 值为尾部后半段均值（数值近似）。
 */
export function detectHorizontalAsymptotes(
  evaluate: Evaluate,
  points: PlotPoint[],
  xMin: number,
  xMax: number,
): HorizontalAsymptoteCandidate[] {
  const finite = points.filter(
    (point): point is [number, number] => point[1] !== null,
  );
  if (finite.length < MIN_TAIL_POINTS * 2) return [];
  const tailSize = Math.max(
    MIN_TAIL_POINTS,
    Math.floor(finite.length * TAIL_FRACTION),
  );
  const candidates: HorizontalAsymptoteCandidate[] = [];
  for (const side of ['left', 'right'] as const) {
    const tail =
      side === 'left' ? finite.slice(0, tailSize) : finite.slice(-tailSize);
    const candidate = assessTail(evaluate, tail, xMin, xMax, side);
    if (candidate) candidates.push(candidate);
  }
  return candidates;
}

function assessTail(
  evaluate: Evaluate,
  tail: Array<[number, number]>,
  xMin: number,
  xMax: number,
  side: 'left' | 'right',
): HorizontalAsymptoteCandidate | null {
  const ys = tail.map((point) => point[1]);
  // 振荡尾部不产生候选：相邻差值的符号反复变化说明没有「趋于稳定」。
  let signChanges = 0;
  for (let i = 1; i < ys.length - 1; i += 1) {
    const previous = ys[i] - ys[i - 1];
    const next = ys[i + 1] - ys[i];
    if (previous !== 0 && next !== 0 && previous * next < 0) {
      signChanges += 1;
      if (signChanges > MAX_SIGN_CHANGES) return null;
    }
  }
  const half = Math.floor(ys.length / 2);
  // 按离窗口中心的方向切分：外侧半段靠近窗口边缘（右尾是后半段，左尾是
  // 前半段），收敛型尾部的变化集中在内侧半段。
  const outerHalf = side === 'right' ? ys.slice(half) : ys.slice(0, half);
  const innerHalf = side === 'right' ? ys.slice(0, half) : ys.slice(half);
  const spreadOf = (values: number[]) =>
    Math.max(...values) - Math.min(...values);
  const spreadOuter = spreadOf(outerHalf);
  const spreadInner = spreadOf(innerHalf);
  const tailScale = Math.max(...ys.map((y) => Math.abs(y)));
  // 外侧半段没有明显比内侧半段更「平」→ 还在增长或减速不明显，不产生候选。
  if (
    spreadOuter > spreadInner * CONVERGE_RATIO &&
    spreadOuter > tailScale * 0.02
  )
    return null;
  // 候选值：外侧半段均值（数值近似，不等于极限值）。
  const candidateY =
    outerHalf.reduce((sum, y) => sum + y, 0) / outerHalf.length;
  // 窗口外探测：从外侧边缘值开始，逐步向外探测，要求每一步的漂移都在
  // 容差带内。收敛型尾部（1/x、e^(-x) 右侧）的相邻探测值越走越近；发散型
  // （e^(-x) 左侧、抛物线）的探测值会迅速跑出容差带而被拒绝。探测点不绘制。
  // 锚点取窗口外侧边缘值：右尾是 ys 末尾（xMax 处），左尾是 ys 开头（xMin 处）。
  const band = Math.max(
    3 * spreadOuter,
    0.25 * Math.abs(candidateY),
    tailScale * 0.02,
  );
  const edge = side === 'right' ? xMax : xMin;
  const width = xMax - xMin;
  const direction = side === 'right' ? 1 : -1;
  let anchor = side === 'right' ? ys[ys.length - 1] : ys[0];
  for (const factor of PROBE_FACTORS) {
    const value = evaluate(edge + direction * width * factor);
    if (value === null || Math.abs(value - anchor) > band) return null;
    anchor = value;
  }
  return {
    side,
    y: candidateY,
    xFrom: tail[0][0],
    xTo: tail[tail.length - 1][0],
  };
}
