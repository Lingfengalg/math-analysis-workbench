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
import type { PlotPoint } from '@/shared/contracts';
import {
  comparisonCurveColor,
  curveExpressionsLabel,
  finiteYRange,
  GAP_MARKER_COLOR,
  MAIN_CURVE_COLOR,
  TANGENT_COLOR,
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
}

interface FunctionChartProps {
  points: PlotPoint[];
  expression: string;
  gapMarkers?: number[];
  comparisons?: ComparisonCurve[];
  tangent?: TangentLine | null;
}

export const FunctionChart = forwardRef<
  FunctionChartHandle,
  FunctionChartProps
>(function FunctionChart(
  { points, expression, gapMarkers = [], comparisons = [], tangent = null },
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
      { points, expression, gapMarkers },
      ...comparisons.map((curve) => ({
        points: curve.points,
        expression: curve.expression,
        gapMarkers: curve.gapMarkers ?? [],
      })),
    ];
    // ECharts discards marker lines whose endpoints fall outside the axis
    // extent, so span only the finite data range shared by all curves
    // (which stays inside the auto-scaled axis thanks to its default margin).
    const { min: dataMin, max: dataMax } = finiteYRange([
      ...curves,
      // 切线两端点参与 y 范围，保证切线在初始视野内可见。
      ...(tangent ? [{ points: tangentPoints(tangent), expression: '' }] : []),
    ]);
    const chart = init(element.current);
    chartRef.current = chart;
    chart.setOption({
      animation: false,
      aria: {
        enabled: true,
        description: `函数 ${curveExpressionsLabel(curves)} 的采样图像${tangent ? `，叠加 x₀ = ${tangent.x0} 处的切线` : ''}`,
      },
      grid: { left: 58, right: 28, top: 28, bottom: 65 },
      tooltip: { trigger: 'axis', renderMode: 'richText' },
      xAxis: {
        type: 'value',
        name: 'x',
        splitLine: { lineStyle: { color: '#e8ebf2' } },
      },
      yAxis: {
        type: 'value',
        name: 'f(x)',
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
            showSymbol: false,
            connectNulls: false,
            lineStyle: { color, width: 2.5 },
            markLine:
              curve.gapMarkers.length > 0
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
      ],
    });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(element.current);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [points, expression, gapMarkers, comparisons, tangent]);
  return (
    <div
      ref={element}
      className="function-chart"
      data-annotation-anchor="plotting:chart"
      role="img"
      aria-label={`函数 ${curveExpressionsLabel([
        { points, expression },
        ...comparisons.map((curve) => ({
          points: curve.points,
          expression: curve.expression,
        })),
      ])} 的采样图像${tangent ? `，含 x₀ = ${tangent.x0} 处切线` : ''}`}
    />
  );
});
