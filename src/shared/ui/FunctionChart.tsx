import type { PlotPoint, SecantLineResult } from '@/shared/contracts';

export interface FunctionChartProps {
  points: PlotPoint[];
  expression: string;
  comparePoints?: PlotPoint[];
  compareExpression?: string;
  secantLine?: SecantLineResult;
  yDomain?: [number | undefined, number | undefined];
}

export function FunctionChart({ expression }: FunctionChartProps) {
  return (
    <div
      className="function-chart"
      role="img"
      aria-label={`函数 ${expression} 的采样图像`}
    />
  );
}
