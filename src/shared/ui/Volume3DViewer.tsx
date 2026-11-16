import type {
  TripleIntegralRequest,
  TripleIntegralResult,
} from '@/shared/contracts';

export interface Volume3DViewerProps {
  result: TripleIntegralResult;
  request: TripleIntegralRequest;
}

export function Volume3DViewer({ request }: Volume3DViewerProps) {
  return (
    <div
      className="function-chart"
      role="img"
      aria-label={`三元函数 ${request.expression} 的三重积分空间体素图像`}
    />
  );
}
