import { useEffect, useRef } from 'react';
import {
  init,
  use as registerCharts,
  type ECharts,
  type ComposeOption,
} from 'echarts/core';
import {
  LineChart,
  ScatterChart,
  type LineSeriesOption,
  type ScatterSeriesOption,
} from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  AriaComponent,
  LegendComponent,
  type GridComponentOption,
  type TooltipComponentOption,
  type DataZoomComponentOption,
  type AriaComponentOption,
  type LegendComponentOption,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { PlotPoint, SecantLineResult } from '@/shared/contracts';

registerCharts([
  LineChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  AriaComponent,
  LegendComponent,
  CanvasRenderer,
]);

type ChartOption = ComposeOption<
  | LineSeriesOption
  | ScatterSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | DataZoomComponentOption
  | AriaComponentOption
  | LegendComponentOption
>;

export interface FunctionChartProps {
  points: PlotPoint[];
  expression: string;
  comparePoints?: PlotPoint[];
  compareExpression?: string;
  secantLine?: SecantLineResult;
  yDomain?: [number | undefined, number | undefined];
}

export function FunctionChart({
  points,
  expression,
  comparePoints,
  compareExpression,
  secantLine,
  yDomain,
}: FunctionChartProps) {
  const element = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);

  useEffect(() => {
    const container = element.current;
    if (!container) return;
    const chart = init(container);
    chartRef.current = chart;
    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => chart.resize())
        : null;
    observer?.observe(container);
    return () => {
      observer?.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  const yMin = yDomain?.[0];
  const yMax = yDomain?.[1];

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const series: Array<LineSeriesOption | ScatterSeriesOption> = [
      {
        name: `f(x) = ${expression}`,
        type: 'line',
        data: points,
        showSymbol: false,
        connectNulls: false,
        itemStyle: { color: '#176b5b' },
        lineStyle: { color: '#176b5b', width: 2.5, type: 'solid' },
      },
    ];

    if (comparePoints && compareExpression) {
      series.push({
        name: `g(x) = ${compareExpression}`,
        type: 'line',
        data: comparePoints,
        showSymbol: false,
        connectNulls: false,
        itemStyle: { color: '#c26a27' },
        lineStyle: { color: '#c26a27', width: 2, type: 'dashed' },
      });
    }

    if (secantLine) {
      if (secantLine.points.length > 0) {
        series.push({
          name: '割线',
          type: 'line',
          data: secantLine.points,
          showSymbol: false,
          connectNulls: false,
          itemStyle: { color: '#3b5bdb' },
          lineStyle: { color: '#3b5bdb', width: 1.8, type: [8, 4, 2, 4] },
        });
      }

      const markers: [number, number][] = [];
      if (secantLine.y0 !== null) {
        markers.push([secantLine.x0, secantLine.y0]);
      }
      if (secantLine.y1 !== null) {
        markers.push([secantLine.x1, secantLine.y1]);
      }
      if (markers.length > 0) {
        series.push({
          name: '差商观察点',
          type: 'scatter',
          data: markers,
          symbolSize: 8,
          itemStyle: {
            color: '#3b5bdb',
            borderColor: '#ffffff',
            borderWidth: 1.5,
          },
          z: 5,
        });
      }
    }

    const showLegend = series.length > 1;
    const ariaDescription = `函数 ${expression} 的采样图像`;

    const option: ChartOption = {
      animation: false,
      aria: {
        enabled: true,
        description: ariaDescription,
      },
      legend: {
        show: showLegend,
        top: 0,
        right: 24,
        itemWidth: 18,
        itemHeight: 8,
      },
      grid: {
        left: 58,
        right: 28,
        top: showLegend ? 52 : 30,
        bottom: 65,
      },
      tooltip: { trigger: 'axis', renderMode: 'richText' },
      xAxis: {
        type: 'value',
        name: 'x',
        splitLine: { lineStyle: { color: '#edf0ed' } },
      },
      yAxis: {
        type: 'value',
        name: 'f(x)',
        ...(yMin !== undefined ? { min: yMin } : {}),
        ...(yMax !== undefined ? { max: yMax } : {}),
        splitLine: { lineStyle: { color: '#edf0ed' } },
      },
      dataZoom: [
        { type: 'inside', filterMode: 'none' },
        { type: 'slider', height: 18, bottom: 8 },
      ],
      series,
    };

    chart.setOption(option, { notMerge: true });
    // Ensure ECharts AriaComponent never overwrites exact accessible label
    element.current?.setAttribute('aria-label', ariaDescription);
  }, [
    points,
    expression,
    comparePoints,
    compareExpression,
    secantLine,
    yMin,
    yMax,
  ]);

  return (
    <div
      ref={element}
      className="function-chart"
      role="img"
      aria-label={`函数 ${expression} 的采样图像`}
    />
  );
}
