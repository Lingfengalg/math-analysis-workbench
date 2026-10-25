import { useEffect, useRef } from 'react';
import { init, use as registerCharts } from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  AriaComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { PlotPoint } from '@/shared/contracts';

registerCharts([
  LineChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  AriaComponent,
  CanvasRenderer,
]);

export function FunctionChart({
  points,
  expression,
}: {
  points: PlotPoint[];
  expression: string;
}) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!element.current) return;
    const chart = init(element.current);
    chart.setOption({
      animation: false,
      aria: {
        enabled: true,
        description: `函数 ${expression} 的采样图像`,
      },
      grid: { left: 58, right: 28, top: 28, bottom: 65 },
      tooltip: { trigger: 'axis', renderMode: 'richText' },
      xAxis: {
        type: 'value',
        name: 'x',
        splitLine: { lineStyle: { color: '#edf0ed' } },
      },
      yAxis: {
        type: 'value',
        name: 'f(x)',
        splitLine: { lineStyle: { color: '#edf0ed' } },
      },
      dataZoom: [
        { type: 'inside', filterMode: 'none' },
        { type: 'slider', height: 18, bottom: 8 },
      ],
      series: [
        {
          type: 'line',
          data: points,
          showSymbol: false,
          connectNulls: false,
          lineStyle: { color: '#176b5b', width: 2.5 },
        },
      ],
    });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(element.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [points, expression]);
  return (
    <div
      ref={element}
      className="function-chart"
      role="img"
      aria-label={`函数 ${expression} 的采样图像`}
    />
  );
}
