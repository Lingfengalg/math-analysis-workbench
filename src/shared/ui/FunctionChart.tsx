import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { PlotPoint, SecantLineResult } from '@/shared/contracts';
import styles from './FunctionChart.module.css';

export interface FunctionChartProps {
  points: PlotPoint[];
  expression: string;
  comparePoints?: PlotPoint[];
  compareExpression?: string;
  secantLine?: SecantLineResult;
  yDomain?: [number | undefined, number | undefined];
}

interface ViewBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

interface HoverProbe {
  svgX: number;
  mathX: number;
  sampleX: number;
  yPrimary: number | null;
  yCompare?: number | null;
}

const DEFAULT_WIDTH = 760;
const DEFAULT_HEIGHT = 390;
const MIN_SPAN = 1e-6;
const MAX_SPAN = 2e6;

function normalizeZero(v: number): number {
  return Object.is(v, -0) || Math.abs(v) < 1e-13 ? 0 : v;
}

function formatTick(value: number, step: number): string {
  const v = normalizeZero(value);
  if (v === 0) return '0';
  const absV = Math.abs(v);
  if (absV >= 1e5 || (absV > 0 && absV < 1e-3 && step < 1e-3)) {
    return v.toExponential(1).replace('+', '');
  }
  const decimals = Math.max(
    0,
    Math.min(6, -Math.floor(Math.log10(Math.max(step, 1e-9))) + 1),
  );
  return String(Number(v.toFixed(decimals)));
}

function formatCoord(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '无定义';
  }
  const v = normalizeZero(value);
  if (v === 0) return '0';
  const absV = Math.abs(v);
  if (absV >= 1e5 || absV < 1e-4) {
    return v.toExponential(3).replace('+', '');
  }
  return String(Number(v.toFixed(4)));
}

function computeNiceTicks(
  min: number,
  max: number,
  targetCount: number,
): { ticks: number[]; step: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return { ticks: [0], step: 1 };
  }
  const span = max - min;
  const rawStep = span / Math.max(2, targetCount);
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / mag;

  let niceMult = 1;
  if (residual > 5) niceMult = 10;
  else if (residual > 2.5) niceMult = 5;
  else if (residual > 2) niceMult = 2.5;
  else if (residual > 1) niceMult = 2;

  const step = niceMult * mag;
  const first = Math.ceil(min / step - 1e-9) * step;
  const ticks: number[] = [];
  const limit = 40;
  for (let i = 0; i < limit; i += 1) {
    const val = first + i * step;
    if (val > max + step * 1e-7) break;
    const rounded = normalizeZero(Number(val.toPrecision(12)));
    ticks.push(rounded);
  }
  return { ticks, step };
}

function computeDefaultBounds(
  points: PlotPoint[],
  comparePoints: PlotPoint[] | undefined,
  secantLine: SecantLineResult | undefined,
  yDomain: [number | undefined, number | undefined] | undefined,
): ViewBounds {
  let xMin = Infinity;
  let xMax = -Infinity;
  let yDataMin = Infinity;
  let yDataMax = -Infinity;

  const scan = (series: PlotPoint[] | undefined) => {
    if (!series) return;
    for (const [x, y] of series) {
      if (Number.isFinite(x)) {
        if (x < xMin) xMin = x;
        if (x > xMax) xMax = x;
      }
      if (y !== null && Number.isFinite(y)) {
        if (y < yDataMin) yDataMin = y;
        if (y > yDataMax) yDataMax = y;
      }
    }
  };

  scan(points);
  scan(comparePoints);

  if (secantLine) {
    if (Number.isFinite(secantLine.x0)) {
      xMin = Math.min(xMin, secantLine.x0);
      xMax = Math.max(xMax, secantLine.x0);
    }
    if (secantLine.y0 !== null && Number.isFinite(secantLine.y0)) {
      yDataMin = Math.min(yDataMin, secantLine.y0);
      yDataMax = Math.max(yDataMax, secantLine.y0);
    }
    if (secantLine.y1 !== null && Number.isFinite(secantLine.y1)) {
      yDataMin = Math.min(yDataMin, secantLine.y1);
      yDataMax = Math.max(yDataMax, secantLine.y1);
    }
  }

  if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) {
    xMin = -5;
    xMax = 5;
  } else if (xMax - xMin < MIN_SPAN) {
    xMin -= 1;
    xMax += 1;
  }

  const fixedYMin = yDomain?.[0];
  const fixedYMax = yDomain?.[1];

  let yMin: number;
  let yMax: number;

  if (fixedYMin !== undefined && fixedYMax !== undefined) {
    yMin = fixedYMin;
    yMax = fixedYMax > fixedYMin ? fixedYMax : fixedYMin + 2;
  } else {
    if (!Number.isFinite(yDataMin) || !Number.isFinite(yDataMax)) {
      yDataMin = -5;
      yDataMax = 5;
    } else if (yDataMax - yDataMin < 1e-5) {
      const pad = Math.max(1, Math.abs(yDataMin) * 0.2);
      yDataMin -= pad;
      yDataMax += pad;
    } else {
      const pad = (yDataMax - yDataMin) * 0.09;
      yDataMin -= pad;
      yDataMax += pad;
    }
    yMin = fixedYMin ?? yDataMin;
    yMax = fixedYMax ?? yDataMax;
    if (yMax <= yMin) {
      yMax = yMin + 2;
    }
  }

  return { xMin, xMax, yMin, yMax };
}

function buildDiscontinuousPath(
  pts: PlotPoint[],
  bounds: ViewBounds,
  toSvgX: (x: number) => number,
  toSvgY: (y: number) => number,
): string {
  if (pts.length === 0) return '';

  const ySpan = bounds.yMax - bounds.yMin;
  const clipLo = bounds.yMin - ySpan * 0.2;
  const clipHi = bounds.yMax + ySpan * 0.2;
  const commands: string[] = [];

  let prevX: number | null = null;
  let prevY: number | null = null;
  let penDown = false;

  for (let i = 0; i < pts.length; i += 1) {
    const [x, y] = pts[i];
    if (y === null || !Number.isFinite(x) || !Number.isFinite(y)) {
      prevX = null;
      prevY = null;
      penDown = false;
      continue;
    }

    if (prevX === null || prevY === null) {
      prevX = x;
      prevY = y;
      if (y >= clipLo && y <= clipHi) {
        commands.push(`M${toSvgX(x).toFixed(2)},${toSvgY(y).toFixed(2)}`);
        penDown = true;
      } else {
        penDown = false;
      }
      continue;
    }

    const x1 = prevX;
    const y1 = prevY;
    const x2 = x;
    const y2 = y;
    prevX = x2;
    prevY = y2;

    if ((y1 < clipLo && y2 < clipLo) || (y1 > clipHi && y2 > clipHi)) {
      penDown = false;
      continue;
    }

    let t0 = 0;
    let t1 = 1;
    const dy = y2 - y1;

    if (Math.abs(dy) > 1e-15) {
      const tLo = (clipLo - y1) / dy;
      const tHi = (clipHi - y1) / dy;
      const tEnter = Math.min(tLo, tHi);
      const tExit = Math.max(tLo, tHi);
      t0 = Math.max(0, tEnter);
      t1 = Math.min(1, tExit);
    }

    if (t0 > t1) {
      penDown = false;
      continue;
    }

    const ax = x1 + t0 * (x2 - x1);
    const ay = y1 + t0 * dy;
    const bx = x1 + t1 * (x2 - x1);
    const by = y1 + t1 * dy;

    if (!penDown || t0 > 0) {
      commands.push(`M${toSvgX(ax).toFixed(2)},${toSvgY(ay).toFixed(2)}`);
    }
    commands.push(`L${toSvgX(bx).toFixed(2)},${toSvgY(by).toFixed(2)}`);
    penDown = t1 === 1;
  }

  return commands.join(' ');
}

function findNearestPoint(
  series: PlotPoint[],
  targetX: number,
): PlotPoint | null {
  if (series.length === 0) return null;
  let lo = 0;
  let hi = series.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid][0] < targetX) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  let best = series[lo];
  if (lo > 0) {
    const prev = series[lo - 1];
    if (Math.abs(prev[0] - targetX) <= Math.abs(best[0] - targetX)) {
      best = prev;
    }
  }
  return best;
}

export function FunctionChart({
  points,
  expression,
  comparePoints,
  compareExpression,
  secantLine,
  yDomain,
}: FunctionChartProps) {
  const uid = useId().replace(/:/g, '');
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [size, setSize] = useState<{ width: number; height: number }>({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
  });

  const yMinProp = yDomain?.[0];
  const yMaxProp = yDomain?.[1];

  const defaultBounds = useMemo(
    () =>
      computeDefaultBounds(points, comparePoints, secantLine, [
        yMinProp,
        yMaxProp,
      ]),
    [points, comparePoints, secantLine, yMinProp, yMaxProp],
  );

  const baseKey = useMemo(
    () =>
      `${expression}|${compareExpression ?? ''}|${defaultBounds.xMin.toFixed(6)}:${defaultBounds.xMax.toFixed(6)}|${defaultBounds.yMin.toFixed(6)}:${defaultBounds.yMax.toFixed(6)}`,
    [expression, compareExpression, defaultBounds],
  );

  const [viewOverride, setViewOverride] = useState<{
    baseKey: string;
    bounds: ViewBounds;
  } | null>(null);

  const [hover, setHover] = useState<HoverProbe | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startBounds: ViewBounds;
    moved: boolean;
  } | null>(null);

  const isCustomView =
    viewOverride !== null && viewOverride.baseKey === baseKey;
  const activeBounds = isCustomView ? viewOverride.bounds : defaultBounds;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 40 && h > 40) {
        setSize((prev) =>
          prev.width === w && prev.height === h
            ? prev
            : { width: w, height: h },
        );
      }
    };

    updateSize();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      updateSize();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const padLeft = size.width < 500 ? 48 : 58;
  const padRight = 22;
  const padTop = 48;
  const padBottom = 38;
  const plotWidth = Math.max(80, size.width - padLeft - padRight);
  const plotHeight = Math.max(80, size.height - padTop - padBottom);
  const plotRight = padLeft + plotWidth;
  const plotBottom = padTop + plotHeight;

  const toSvgX = useCallback(
    (x: number) =>
      padLeft +
      ((x - activeBounds.xMin) / (activeBounds.xMax - activeBounds.xMin)) *
        plotWidth,
    [padLeft, activeBounds.xMin, activeBounds.xMax, plotWidth],
  );

  const toSvgY = useCallback(
    (y: number) =>
      padTop +
      ((activeBounds.yMax - y) / (activeBounds.yMax - activeBounds.yMin)) *
        plotHeight,
    [padTop, activeBounds.yMin, activeBounds.yMax, plotHeight],
  );

  const zoomAround = useCallback(
    (factor: number, anchorXRatio = 0.5, anchorYRatio = 0.5) => {
      const cur = activeBounds;
      const spanX = cur.xMax - cur.xMin;
      const spanY = cur.yMax - cur.yMin;
      const nextSpanX = Math.min(MAX_SPAN, Math.max(MIN_SPAN, spanX * factor));
      const nextSpanY = Math.min(MAX_SPAN, Math.max(MIN_SPAN, spanY * factor));

      const pivotX = cur.xMin + anchorXRatio * spanX;
      const pivotY = cur.yMax - anchorYRatio * spanY;

      setViewOverride({
        baseKey,
        bounds: {
          xMin: pivotX - anchorXRatio * nextSpanX,
          xMax: pivotX + (1 - anchorXRatio) * nextSpanX,
          yMin: pivotY - (1 - anchorYRatio) * nextSpanY,
          yMax: pivotY + anchorYRatio * nextSpanY,
        },
      });
    },
    [activeBounds, baseKey],
  );

  const zoomAroundRef = useRef(zoomAround);
  useEffect(() => {
    zoomAroundRef.current = zoomAround;
  }, [zoomAround]);

  const metricsRef = useRef({
    padLeft,
    padTop,
    plotWidth,
    plotHeight,
    sizeWidth: size.width,
    sizeHeight: size.height,
  });
  useEffect(() => {
    metricsRef.current = {
      padLeft,
      padTop,
      plotWidth,
      plotHeight,
      sizeWidth: size.width,
      sizeHeight: size.height,
    };
  }, [padLeft, padTop, plotWidth, plotHeight, size.width, size.height]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const m = metricsRef.current;
      const svgX =
        rect.width > 0
          ? ((event.clientX - rect.left) / rect.width) * m.sizeWidth
          : m.padLeft + m.plotWidth * 0.5;
      const svgY =
        rect.height > 0
          ? ((event.clientY - rect.top) / rect.height) * m.sizeHeight
          : m.padTop + m.plotHeight * 0.5;

      const ratioX = Math.max(0, Math.min(1, (svgX - m.padLeft) / m.plotWidth));
      const ratioY = Math.max(0, Math.min(1, (svgY - m.padTop) / m.plotHeight));
      const factor = event.deltaY < 0 ? 0.84 : 1.19;
      zoomAroundRef.current(factor, ratioX, ratioY);
    };

    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  const resolveSvgCoords = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { sx: padLeft, sy: padTop };
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return { sx: clientX, sy: clientY };
    }
    return {
      sx: ((clientX - rect.left) / rect.width) * size.width,
      sy: ((clientY - rect.top) / rect.height) * size.height,
    };
  };

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startBounds: activeBounds,
      moved: false,
    };
    setIsDragging(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* Synthetic pointer events in JSDOM may not implement pointer capture */
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      const rawDx = event.clientX - drag.startClientX;
      const rawDy = event.clientY - drag.startClientY;
      if (!drag.moved && Math.hypot(rawDx, rawDy) < 3) {
        return;
      }
      drag.moved = true;

      const rect = event.currentTarget.getBoundingClientRect();
      const effW = rect.width > 0 ? rect.width : size.width;
      const effH = rect.height > 0 ? rect.height : size.height;
      const scaleW = size.width / effW;
      const scaleH = size.height / effH;

      const dxPx = rawDx * scaleW;
      const dyPx = rawDy * scaleH;

      const spanX = drag.startBounds.xMax - drag.startBounds.xMin;
      const spanY = drag.startBounds.yMax - drag.startBounds.yMin;
      const shiftX = -(dxPx / plotWidth) * spanX;
      const shiftY = (dyPx / plotHeight) * spanY;

      setHover(null);
      setViewOverride({
        baseKey,
        bounds: {
          xMin: drag.startBounds.xMin + shiftX,
          xMax: drag.startBounds.xMax + shiftX,
          yMin: drag.startBounds.yMin + shiftY,
          yMax: drag.startBounds.yMax + shiftY,
        },
      });
      return;
    }

    const { sx, sy } = resolveSvgCoords(event.clientX, event.clientY);
    if (sx < padLeft || sx > plotRight || sy < padTop || sy > plotBottom) {
      setHover(null);
      return;
    }

    const mathX =
      activeBounds.xMin +
      ((sx - padLeft) / plotWidth) * (activeBounds.xMax - activeBounds.xMin);
    const nearest = findNearestPoint(points, mathX);
    const sampleX = nearest ? nearest[0] : mathX;
    const yPrimary = nearest ? nearest[1] : null;
    const compareNearest =
      comparePoints && compareExpression
        ? findNearestPoint(comparePoints, sampleX)
        : null;

    setHover({
      svgX: toSvgX(sampleX),
      mathX,
      sampleX,
      yPrimary,
      yCompare: compareNearest ? compareNearest[1] : undefined,
    });
  };

  const endDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (dragRef.current && dragRef.current.pointerId === event.pointerId) {
      dragRef.current = null;
      setIsDragging(false);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* Safe fallback for test environments */
      }
    }
  };

  const handleResetView = () => {
    setViewOverride(null);
  };

  const xTicksInfo = useMemo(
    () =>
      computeNiceTicks(
        activeBounds.xMin,
        activeBounds.xMax,
        Math.max(4, Math.floor(plotWidth / 92)),
      ),
    [activeBounds.xMin, activeBounds.xMax, plotWidth],
  );

  const yTicksInfo = useMemo(
    () =>
      computeNiceTicks(
        activeBounds.yMin,
        activeBounds.yMax,
        Math.max(4, Math.floor(plotHeight / 56)),
      ),
    [activeBounds.yMin, activeBounds.yMax, plotHeight],
  );

  const primaryPath = useMemo(
    () => buildDiscontinuousPath(points, activeBounds, toSvgX, toSvgY),
    [points, activeBounds, toSvgX, toSvgY],
  );

  const comparePath = useMemo(
    () =>
      comparePoints && compareExpression
        ? buildDiscontinuousPath(comparePoints, activeBounds, toSvgX, toSvgY)
        : '',
    [comparePoints, compareExpression, activeBounds, toSvgX, toSvgY],
  );

  const secantPath = useMemo(() => {
    if (!secantLine) return '';
    if (secantLine.y0 !== null && secantLine.slope !== null) {
      const { x0, y0, slope } = secantLine;
      const linePts: PlotPoint[] = [
        [activeBounds.xMin, y0 + slope * (activeBounds.xMin - x0)],
        [activeBounds.xMax, y0 + slope * (activeBounds.xMax - x0)],
      ];
      return buildDiscontinuousPath(linePts, activeBounds, toSvgX, toSvgY);
    }
    return buildDiscontinuousPath(
      secantLine.points,
      activeBounds,
      toSvgX,
      toSvgY,
    );
  }, [secantLine, activeBounds, toSvgX, toSvgY]);

  const originXVisible =
    activeBounds.xMin <= 0 && activeBounds.xMax >= 0 ? toSvgX(0) : null;
  const originYVisible =
    activeBounds.yMin <= 0 && activeBounds.yMax >= 0 ? toSvgY(0) : null;

  const clipId = `chart-clip-${uid}`;
  const arrowId = `axis-arrow-${uid}`;

  const hoverPrimarySvgY =
    hover &&
    hover.yPrimary !== null &&
    hover.yPrimary >= activeBounds.yMin &&
    hover.yPrimary <= activeBounds.yMax
      ? toSvgY(hover.yPrimary)
      : null;

  const hoverCompareSvgY =
    hover &&
    hover.yCompare !== undefined &&
    hover.yCompare !== null &&
    hover.yCompare >= activeBounds.yMin &&
    hover.yCompare <= activeBounds.yMax
      ? toSvgY(hover.yCompare)
      : null;

  const tooltipLeft = hover
    ? hover.svgX > size.width * 0.62
      ? Math.max(padLeft + 6, hover.svgX - 156)
      : Math.min(size.width - 156, hover.svgX + 14)
    : 0;
  const tooltipTop = padTop + 10;

  return (
    <div
      ref={containerRef}
      className={`function-chart ${styles.chartRoot}`}
      role="img"
      aria-label={`函数 ${expression} 的采样图像`}
    >
      <div className={styles.legendBar} aria-hidden="true">
        <span className={styles.legendItem}>
          <span className={styles.swatchSolid} />
          f(x) = {expression}
        </span>
        {comparePoints && compareExpression && (
          <span className={styles.legendItem}>
            <span className={styles.swatchDashed} />
            g(x) = {compareExpression}
          </span>
        )}
        {secantLine && (
          <span className={styles.legendItem}>
            <span className={styles.swatchSecant} />
            差商割线
          </span>
        )}
      </div>

      <div className={styles.hudToolbar}>
        <button
          type="button"
          className={styles.hudBtn}
          aria-label="放大视图"
          title="放大视图"
          onClick={() => zoomAround(0.8)}
        >
          ＋
        </button>
        <button
          type="button"
          className={styles.hudBtn}
          aria-label="缩小视图"
          title="缩小视图"
          onClick={() => zoomAround(1.25)}
        >
          －
        </button>
        <span className={styles.hudDivider} aria-hidden="true" />
        <button
          type="button"
          className={`${styles.hudBtn} ${isCustomView ? styles.hudBtnActive : ''}`}
          onClick={handleResetView}
        >
          重置视图
        </button>
      </div>

      <svg
        ref={svgRef}
        className={`${styles.svgCanvas} ${isDragging ? styles.dragging : ''}`}
        viewBox={`0 0 ${size.width} ${size.height}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={(e) => {
          endDrag(e);
          setHover(null);
        }}
      >
        <defs>
          <clipPath id={clipId}>
            <rect
              x={padLeft}
              y={padTop}
              width={plotWidth}
              height={plotHeight}
            />
          </clipPath>
          <marker
            id={arrowId}
            viewBox="0 0 10 10"
            refX="7.5"
            refY="5"
            markerWidth="6.5"
            markerHeight="6.5"
            orient="auto-start-reverse"
          >
            <path d="M 1 1.8 L 8.5 5 L 1 8.2 z" fill="rgba(19, 58, 48, 0.62)" />
          </marker>
        </defs>

        {/* Subtle inner coordinate viewport backdrop */}
        <rect
          x={padLeft}
          y={padTop}
          width={plotWidth}
          height={plotHeight}
          fill="rgba(255, 255, 255, 0.24)"
          stroke="rgba(20, 58, 48, 0.14)"
          strokeWidth="1"
          rx="4"
        />

        {/* Coordinate grid lines */}
        <g aria-hidden="true">
          {xTicksInfo.ticks.map((tick) => {
            const sx = toSvgX(tick);
            return (
              <line
                key={`gx-${tick}`}
                x1={sx}
                y1={padTop}
                x2={sx}
                y2={plotBottom}
                stroke="rgba(20, 58, 48, 0.075)"
                strokeWidth="1"
              />
            );
          })}
          {yTicksInfo.ticks.map((tick) => {
            const sy = toSvgY(tick);
            return (
              <line
                key={`gy-${tick}`}
                x1={padLeft}
                y1={sy}
                x2={plotRight}
                y2={sy}
                stroke="rgba(20, 58, 48, 0.075)"
                strokeWidth="1"
              />
            );
          })}
        </g>

        {/* Cartesian origin axes (when 0 lies within the active viewport) */}
        <g aria-hidden="true">
          {originYVisible !== null && (
            <>
              <line
                x1={padLeft}
                y1={originYVisible}
                x2={plotRight - 2}
                y2={originYVisible}
                stroke="rgba(19, 58, 48, 0.5)"
                strokeWidth="1.35"
                markerEnd={`url(#${arrowId})`}
              />
              <text
                x={plotRight - 6}
                y={Math.max(padTop + 13, originYVisible - 7)}
                textAnchor="end"
                fontSize="11.5"
                fontStyle="italic"
                fontWeight="600"
                fill="rgba(19, 58, 48, 0.78)"
              >
                x
              </text>
            </>
          )}
          {originXVisible !== null && (
            <>
              <line
                x1={originXVisible}
                y1={plotBottom}
                x2={originXVisible}
                y2={padTop + 3}
                stroke="rgba(19, 58, 48, 0.5)"
                strokeWidth="1.35"
                markerEnd={`url(#${arrowId})`}
              />
              <text
                x={Math.min(plotRight - 14, originXVisible + 8)}
                y={padTop + 13}
                textAnchor="start"
                fontSize="11.5"
                fontStyle="italic"
                fontWeight="600"
                fill="rgba(19, 58, 48, 0.78)"
              >
                y
              </text>
            </>
          )}
          {originXVisible !== null &&
            originYVisible !== null &&
            originXVisible > padLeft + 18 &&
            originYVisible < plotBottom - 16 && (
              <text
                x={originXVisible - 6}
                y={originYVisible + 14}
                textAnchor="end"
                fontSize="10.5"
                fontWeight="600"
                fill="rgba(25, 66, 55, 0.68)"
              >
                O
              </text>
            )}
        </g>

        {/* Clipped mathematical curves & observation markers */}
        <g clipPath={`url(#${clipId})`}>
          {comparePath && (
            <path
              d={comparePath}
              fill="none"
              stroke="#c26a27"
              strokeWidth="2.05"
              strokeDasharray="7 5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {primaryPath && (
            <path
              d={primaryPath}
              fill="none"
              stroke="#0f6a58"
              strokeWidth="2.45"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {secantPath && (
            <path
              d={secantPath}
              fill="none"
              stroke="#3b5bdb"
              strokeWidth="1.9"
              strokeDasharray="9 4 2.2 4"
              strokeLinecap="round"
            />
          )}

          {secantLine &&
            secantLine.y0 !== null &&
            Number.isFinite(secantLine.y0) && (
              <g>
                <circle
                  cx={toSvgX(secantLine.x0)}
                  cy={toSvgY(secantLine.y0)}
                  r="8"
                  fill="rgba(59, 91, 219, 0.16)"
                />
                <circle
                  cx={toSvgX(secantLine.x0)}
                  cy={toSvgY(secantLine.y0)}
                  r="4.5"
                  fill="#3b5bdb"
                  stroke="#ffffff"
                  strokeWidth="1.8"
                />
              </g>
            )}

          {secantLine &&
            secantLine.y1 !== null &&
            Number.isFinite(secantLine.y1) && (
              <circle
                cx={toSvgX(secantLine.x1)}
                cy={toSvgY(secantLine.y1)}
                r="4"
                fill="#5c7cfa"
                stroke="#ffffff"
                strokeWidth="1.6"
              />
            )}

          {/* Hover vertical crosshair & point highlights */}
          {hover && (
            <g>
              <line
                x1={hover.svgX}
                y1={padTop}
                x2={hover.svgX}
                y2={plotBottom}
                stroke="rgba(15, 106, 88, 0.4)"
                strokeWidth="1.15"
                strokeDasharray="4 3"
              />
              {hoverCompareSvgY !== null && (
                <circle
                  cx={hover.svgX}
                  cy={hoverCompareSvgY}
                  r="4.2"
                  fill="#c26a27"
                  stroke="#ffffff"
                  strokeWidth="1.6"
                />
              )}
              {hoverPrimarySvgY !== null && (
                <>
                  <circle
                    cx={hover.svgX}
                    cy={hoverPrimarySvgY}
                    r="8"
                    fill="rgba(15, 106, 88, 0.16)"
                  />
                  <circle
                    cx={hover.svgX}
                    cy={hoverPrimarySvgY}
                    r="4.5"
                    fill="#0f6a58"
                    stroke="#ffffff"
                    strokeWidth="1.8"
                  />
                </>
              )}
            </g>
          )}
        </g>

        {/* Frame edge tick marks and numeric labels */}
        <g aria-hidden="true">
          {xTicksInfo.ticks.map((tick) => {
            const sx = toSvgX(tick);
            return (
              <g key={`tx-${tick}`}>
                <line
                  x1={sx}
                  y1={plotBottom}
                  x2={sx}
                  y2={plotBottom + 4}
                  stroke="rgba(20, 58, 48, 0.35)"
                  strokeWidth="1"
                />
                <text
                  x={sx}
                  y={plotBottom + 17}
                  textAnchor="middle"
                  fontSize="11"
                  fill="#446057"
                >
                  {formatTick(tick, xTicksInfo.step)}
                </text>
              </g>
            );
          })}

          {yTicksInfo.ticks.map((tick) => {
            const sy = toSvgY(tick);
            return (
              <g key={`ty-${tick}`}>
                <line
                  x1={padLeft - 4}
                  y1={sy}
                  x2={padLeft}
                  y2={sy}
                  stroke="rgba(20, 58, 48, 0.35)"
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 8}
                  y={sy + 3.8}
                  textAnchor="end"
                  fontSize="11"
                  fill="#446057"
                >
                  {formatTick(tick, yTicksInfo.step)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {hover && (
        <div
          className={styles.tooltipBubble}
          style={{ left: `${tooltipLeft}px`, top: `${tooltipTop}px` }}
          aria-hidden="true"
        >
          <div className={styles.tooltipHeader}>
            ({formatCoord(hover.sampleX)}, {formatCoord(hover.yPrimary)})
          </div>
          <div className={styles.tooltipRow}>
            <span className={styles.tooltipLabel}>
              <span className={styles.dotPrimary} />
              f(x)
            </span>
            <span className={styles.tooltipVal}>
              {formatCoord(hover.yPrimary)}
            </span>
          </div>
          {comparePoints && compareExpression && (
            <div className={styles.tooltipRow}>
              <span className={styles.tooltipLabel}>
                <span className={styles.dotCompare} />
                g(x)
              </span>
              <span className={styles.tooltipVal}>
                {formatCoord(hover.yCompare)}
              </span>
            </div>
          )}
        </div>
      )}

      <div className={styles.hintBadge} aria-hidden="true">
        滚轮缩放 · 拖拽平移
      </div>
    </div>
  );
}
