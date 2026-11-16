import type {
  SurfaceIntegralConfig,
  SurfacePlotResult,
} from '@/shared/contracts';

export interface Surface3DViewerProps {
  result: SurfacePlotResult;
  expression: string;
  xDomain: [number, number];
  yDomain: [number, number];
  zDomain?: [number | undefined, number | undefined];
  integralConfig?: SurfaceIntegralConfig;
  showWireframe?: boolean;
  showContours?: boolean;
}

export function Surface3DViewer({ expression }: Surface3DViewerProps) {
  return (
    <div
      className="function-chart"
      role="img"
      aria-label={`二元函数 ${expression} 的三维曲面图像`}
    />
  );
}
