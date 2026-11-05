import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { init, use as registerCharts } from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type {
  HorizontalAsymptoteCandidate,
  PlotPoint,
} from '@/shared/contracts';

registerCharts([
  LineChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  AriaComponent,
  MarkLineComponent,
  CanvasRenderer,
]);

// 供父组件按需导出的句柄：直接读取当前画布，不重新采样。
export interface FunctionChartHandle {
  exportPng: () => string;
}

interface FunctionChartProps {
  points: PlotPoint[];
  expression: string;
  gapMarkers?: number[];
  /** 水平渐近趋势候选：以青绿色虚线画在对应尾部的 x 跨度上。 */
  horizontalMarkers?: HorizontalAsymptoteCandidate[];
  /** 数列模式：散点显示、横轴为项序号 n，不做间断虚线标记。 */
  variant?: 'function' | 'sequence';
}

export const FunctionChart = forwardRef<
  FunctionChartHandle,
  FunctionChartProps
>(function FunctionChart(
  {
    points,
    expression,
    gapMarkers = [],
    horizontalMarkers = [],
    variant = 'function',
  },
  ref,
) {
  const element = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof init> | null>(null);
  useImperativeHandle(ref, () => ({
    exportPng: () =>
      chartRef.current
        ? chartRef.current.getDataURL({
            type: 'png',
            pixelRatio: 2,
            backgroundColor: '#ffffff',
          })
        : '',
  }));
  useEffect(() => {
    if (!element.current) return;
    // ECharts discards marker lines whose endpoints fall outside the axis
    // extent, so span only the finite data range (which stays inside the
    // auto-scaled axis thanks to its default margin).
    const finiteYs = points
      .map((point) => point[1])
      .filter((y): y is number => y !== null);
    const dataMin = finiteYs.length > 0 ? Math.min(...finiteYs) : 0;
    const dataMax = finiteYs.length > 0 ? Math.max(...finiteYs) : 1;
    // For flat data the data range degenerates to a point; widen it a bit
    // so the marker line still has a visible length.
    const span = dataMax - dataMin;
    const pad = span > 0 ? 0 : Math.max(Math.abs(dataMin) * 0.05, 0.5);
    const isSequence = variant === 'sequence';
    const chart = init(element.current);
    chartRef.current = chart;
    chart.setOption({
      animation: false,
      aria: {
        enabled: true,
        description: isSequence
          ? `数列 ${expression} 的前若干项散点图`
          : `函数 ${expression} 的采样图像`,
      },
      grid: { left: 58, right: 28, top: 28, bottom: 65 },
      tooltip: { trigger: 'axis', renderMode: 'richText' },
      xAxis: {
        type: 'value',
        name: isSequence ? 'n' : 'x',
        splitLine: { lineStyle: { color: '#e8ebf2' } },
      },
      yAxis: {
        type: 'value',
        name: isSequence ? 'a_n' : 'f(x)',
        splitLine: { lineStyle: { color: '#e8ebf2' } },
      },
      dataZoom: [
        { type: 'inside', filterMode: 'none' },
        { type: 'slider', height: 18, bottom: 8 },
      ],
      series: [
        {
          type: 'line',
          data: points,
          // 数列模式显示散点并连线观察趋势；函数模式只连曲线。
          showSymbol: isSequence,
          symbolSize: isSequence ? 5 : undefined,
          connectNulls: false,
          lineStyle: { color: '#485bb2', width: isSequence ? 1.5 : 2.5 },
          markLine:
            !isSequence && gapMarkers.length > 0
              ? {
                  silent: true,
                  symbol: 'none',
                  label: { show: false },
                  lineStyle: {
                    type: 'dashed',
                    color: '#c47f17',
                    width: 1.5,
                  },
                  data: gapMarkers.map((x) => [
                    { coord: [x, dataMin - pad] },
                    { coord: [x, dataMax + pad] },
                  ]),
                }
              : undefined,
        },
        // 渐近趋势提示画成独立 series 的水平虚线：样式与竖直间断标记
        // （橙色虚线）区分，静默且不进提示框。
        ...horizontalMarkers.map((marker) => ({
          type: 'line' as const,
          silent: true,
          data: [
            [marker.xFrom, marker.y],
            [marker.xTo, marker.y],
          ],
          showSymbol: false,
          lineStyle: { type: 'dashed' as const, color: '#0e7490', width: 1.5 },
          tooltip: { show: false },
        })),
      ],
    });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(element.current);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [points, expression, gapMarkers, horizontalMarkers, variant]);
  return (
    <div
      ref={element}
      className="function-chart"
      data-annotation-anchor="plotting:chart"
      role="img"
      aria-label={
        variant === 'sequence'
          ? `数列 ${expression} 的前若干项散点图`
          : `函数 ${expression} 的采样图像`
      }
    />
  );
});
