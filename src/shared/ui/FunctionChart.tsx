import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { init, use as registerCharts } from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  MarkLineComponent,
  MarkPointComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type {
  HorizontalAsymptoteCandidate,
  IntersectionPoint,
  PlotPoint,
} from '@/shared/contracts';
import {
  comparisonCurveColor,
  curveExpressionsLabel,
  finiteYRange,
  GAP_MARKER_COLOR,
  INTERSECTION_MARKER_COLOR,
  MAIN_CURVE_COLOR,
  TANGENT_COLOR,
  TAYLOR_COLOR,
  type TaylorOverlay,
  tangentPoints,
  type TangentLine,
} from './chart-series';

registerCharts([
  LineChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  AriaComponent,
  MarkLineComponent,
  MarkPointComponent,
  CanvasRenderer,
]);

// 供父组件按需导出的句柄：直接读取当前画布，不重新采样。
export interface FunctionChartHandle {
  exportPng: () => string;
}

/** 对比曲线：与主曲线共享坐标轴与缩放，独立采样、独立颜色。 */
export interface ComparisonCurve {
  points: PlotPoint[];
  expression: string;
  gapMarkers?: number[];
  /** 与主曲线的近似交点（数值二分），在图上以圆点标记。 */
  intersections?: IntersectionPoint[];
}

interface FunctionChartProps {
  points: PlotPoint[];
  expression: string;
  gapMarkers?: number[];
  comparisons?: ComparisonCurve[];
  horizontalMarkers?: HorizontalAsymptoteCandidate[];
  variant?: 'function' | 'sequence';
  tangent?: TangentLine | null;
  taylor?: TaylorOverlay | null;
}

export const FunctionChart = forwardRef<
  FunctionChartHandle,
  FunctionChartProps
>(function FunctionChart(
  {
    points,
    expression,
    gapMarkers = [],
    comparisons = [],
    horizontalMarkers = [],
    variant = 'function',
    tangent = null,
    taylor = null,
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
    const curves = [
      { points, expression, gapMarkers, intersections: [] },
      ...comparisons.map((curve) => ({
        points: curve.points,
        expression: curve.expression,
        gapMarkers: curve.gapMarkers ?? [],
        intersections: curve.intersections ?? [],
      })),
    ];
    // ECharts discards marker lines whose endpoints fall outside the axis
    // extent, so span only the finite data range shared by all curves
    // (which stays inside the auto-scaled axis thanks to its default margin).
    const { min: dataMin, max: dataMax } = finiteYRange([
      ...curves,
      ...(tangent ? [{ points: tangentPoints(tangent), expression: '' }] : []),
      ...(taylor ? [{ points: taylor.points, expression: '' }] : []),
    ]);
    const isSequence = variant === 'sequence';
    const chart = init(element.current);
    chartRef.current = chart;
    chart.setOption({
      animation: false,
      aria: {
        enabled: true,
        description: isSequence
          ? `数列 ${expression} 的前若干项散点图`
          : `函数 ${curveExpressionsLabel(curves)} 的采样图像${tangent ? `，叠加 x₀ = ${tangent.x0} 处的切线` : ''}${taylor ? `，叠加 ${taylor.order} 阶泰勒多项式（展开中心 ${taylor.center}）` : ''}`,
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
        ...curves.map((curve, index) => {
          const color =
            index === 0 ? MAIN_CURVE_COLOR : comparisonCurveColor(index - 1);
          return {
            type: 'line',
            data: curve.points,
            showSymbol: isSequence,
            symbolSize: isSequence ? 5 : undefined,
            connectNulls: false,
            lineStyle: { color, width: isSequence ? 1.5 : 2.5 },
            markLine:
              !isSequence && curve.gapMarkers.length > 0
                ? {
                    silent: true,
                    symbol: 'none',
                    label: { show: false },
                    lineStyle: {
                      type: 'dashed',
                      color: GAP_MARKER_COLOR,
                      width: 1.5,
                    },
                    data: curve.gapMarkers.map((x) => [
                      { coord: [x, dataMin] },
                      { coord: [x, dataMax] },
                    ]),
                  }
                : undefined,
            markPoint:
              curve.intersections.length > 0
                ? {
                    silent: true,
                    symbol: 'circle',
                    symbolSize: 7,
                    itemStyle: {
                      color: INTERSECTION_MARKER_COLOR,
                      borderColor: '#ffffff',
                      borderWidth: 1,
                    },
                    label: { show: false },
                    data: curve.intersections.map((point) => ({
                      coord: [point.x, point.y],
                    })),
                  }
                : undefined,
          };
        }),
        ...(tangent
          ? [
              {
                name: '切线',
                type: 'line',
                data: tangentPoints(tangent),
                showSymbol: false,
                silent: true,
                lineStyle: { color: TANGENT_COLOR, width: 2 },
                markPoint: {
                  silent: true,
                  symbol: 'circle',
                  symbolSize: 7,
                  itemStyle: {
                    color: TANGENT_COLOR,
                    borderColor: '#ffffff',
                    borderWidth: 1,
                  },
                  label: { show: false },
                  data: [{ coord: [tangent.x0, tangent.value] }],
                },
              },
            ]
          : []),
        ...(taylor
          ? [
              {
                name: '泰勒多项式',
                type: 'line',
                data: taylor.points,
                showSymbol: false,
                connectNulls: false,
                silent: true,
                lineStyle: { color: TAYLOR_COLOR, width: 2 },
              },
            ]
          : []),
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
  }, [
    points,
    expression,
    gapMarkers,
    comparisons,
    horizontalMarkers,
    variant,
    tangent,
    taylor,
  ]);
  return (
    <div
      ref={element}
      className="function-chart"
      data-annotation-anchor="plotting:chart"
      role="img"
      aria-label={
        variant === 'sequence'
          ? `数列 ${expression} 的前若干项散点图`
          : `函数 ${curveExpressionsLabel([{ points, expression }, ...comparisons])} 的采样图像${tangent ? `，含 x₀ = ${tangent.x0} 处切线` : ''}${taylor ? `，叠加 ${taylor.order} 阶泰勒多项式（展开中心 ${taylor.center}）` : ''}`
      }
    />
  );
});
