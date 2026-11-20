import { useEffect, useRef, useState } from 'react';
import type { PlotPoint, PlotRequest } from '@/shared/contracts';
import { calculatePlot } from '@/shared/math/client';
import { splitSegments, toCanvasPoint } from './mini-plot';
import styles from './MiniPlot.module.css';

type Props = {
  request: PlotRequest;
  /** 无障碍名称，例如「x^2 的迷你示意图」 */
  label: string;
};

type Result = {
  request: PlotRequest;
  points: PlotPoint[] | null;
  failed: boolean;
};

const WIDTH = 260;
const HEIGHT = 120;
const STROKE = '#485bb2';
const AXIS = '#cbd5d1';

/**
 * 卡片侧栏的迷你示意图。
 *
 * 采样复用绘图 Worker（与整页图表同一套数学白名单与采样逻辑），渲染用手写 canvas
 * 而不是 ECharts，避免把图表库打进知识导航 chunk。迷你图只用于快速观察，
 * 不承诺数学结论，详细交互仍通过「去绘图中观察」进入整页图表。
 */
export function MiniPlot({ request, label }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [result, setResult] = useState<Result>({
    request,
    points: null,
    failed: false,
  });

  useEffect(() => {
    const controller = new AbortController();
    calculatePlot(request, controller.signal)
      .then((data) =>
        setResult({ request, points: data.points, failed: false }),
      )
      .catch((error: unknown) => {
        if ((error as { name?: string }).name === 'AbortError') return;
        setResult({ request, points: null, failed: true });
      });
    return () => controller.abort();
  }, [request]);

  const points = result.request === request ? result.points : null;
  const failed = result.request === request && result.failed;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !points) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = WIDTH * ratio;
    canvas.height = HEIGHT * ratio;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, WIDTH, HEIGHT);

    // 坐标轴：只画淡淡的参考线，不标刻度
    context.strokeStyle = AXIS;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(6, HEIGHT / 2);
    context.lineTo(WIDTH - 6, HEIGHT / 2);
    context.stroke();

    const finite = points
      .map((point) => point[1])
      .filter((y): y is number => y !== null);
    if (finite.length === 0) return;
    let yMin = Math.min(...finite);
    let yMax = Math.max(...finite);
    if (yMin === yMax) {
      yMin -= 1;
      yMax += 1;
    }
    const bounds = { xMin: request.xMin, xMax: request.xMax, yMin, yMax };
    const size = { width: WIDTH, height: HEIGHT };

    context.strokeStyle = STROKE;
    context.lineWidth = 1.6;
    for (const segment of splitSegments(points)) {
      context.beginPath();
      segment.forEach((point, index) => {
        const mapped = toCanvasPoint(point, bounds, size);
        if (!mapped) return;
        if (index === 0) context.moveTo(mapped.x, mapped.y);
        else context.lineTo(mapped.x, mapped.y);
      });
      context.stroke();
    }
  }, [points, request]);

  return (
    <figure className={styles.figure}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        role="img"
        aria-label={label}
      />
      <figcaption className={styles.caption}>
        {failed
          ? '迷你示意图加载失败，可点下方链接进入绘图页。'
          : '迷你示意图：数值采样，仅用于快速观察，留空处不代表已证明间断。'}
      </figcaption>
    </figure>
  );
}
