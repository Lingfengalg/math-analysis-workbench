import { useCallback, useEffect, useRef, useState } from 'react';
import {
  plotRequestSchema,
  type IntersectionPoint,
  type PlotRequest,
  type PlotResult,
} from '@/shared/contracts';
import { calculateIntersections, calculatePlot } from '@/shared/math/client';

export type PlotState =
  | { status: 'loading'; request: PlotRequest }
  | { status: 'ready'; request: PlotRequest; result: PlotResult }
  | { status: 'error'; message: string };

/** Own one active calculation; an invalid or newer submission invalidates it. */
export function usePlotCalculation(initial: PlotRequest) {
  const [request, setRequest] = useState<PlotRequest | null>(initial);
  const [state, setState] = useState<PlotState>({
    status: 'loading',
    request: initial,
  });
  const active = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    active.current = controller;
    calculatePlot(request, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted)
          setState({ status: 'ready', request, result });
      },
      (cause: unknown) => {
        if (!controller.signal.aborted)
          setState({
            status: 'error',
            message: cause instanceof Error ? cause.message : '计算失败',
          });
      },
    );
    return () => {
      controller.abort();
      if (active.current === controller) active.current = null;
    };
  }, [request]);

  const draw = useCallback((value: PlotRequest) => {
    active.current?.abort();
    const valid = plotRequestSchema.safeParse(value);
    if (!valid.success) {
      setRequest(null);
      setState({ status: 'error', message: valid.error.issues[0].message });
      return;
    }
    setState({ status: 'loading', request: valid.data });
    setRequest(valid.data);
  }, []);

  return { state, draw };
}

export type ComparisonState =
  | { status: 'idle' }
  | { status: 'loading'; request: PlotRequest }
  | { status: 'ready'; request: PlotRequest; result: PlotResult }
  | { status: 'error'; message: string };

/** Idle-start variant for comparison curves: nothing is computed until the
 * user submits an expression; afterwards the same lifecycle as above. */
export function useComparisonCalculation() {
  const [request, setRequest] = useState<PlotRequest | null>(null);
  const [state, setState] = useState<ComparisonState>({ status: 'idle' });
  const active = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    active.current = controller;
    calculatePlot(request, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted)
          setState({ status: 'ready', request, result });
      },
      (cause: unknown) => {
        if (!controller.signal.aborted)
          setState({
            status: 'error',
            message: cause instanceof Error ? cause.message : '计算失败',
          });
      },
    );
    return () => {
      controller.abort();
      if (active.current === controller) active.current = null;
    };
  }, [request]);

  const draw = useCallback((value: PlotRequest) => {
    active.current?.abort();
    const valid = plotRequestSchema.safeParse(value);
    if (!valid.success) {
      setRequest(null);
      setState({ status: 'error', message: valid.error.issues[0].message });
      return;
    }
    setState({ status: 'loading', request: valid.data });
    setRequest(valid.data);
  }, []);

  return { state, draw };
}

export type IntersectionState =
  | { status: 'idle' }
  | { status: 'ready'; points: IntersectionPoint[] }
  | { status: 'error'; message: string };

/** 两条曲线都存在时自动计算近似交点；任一为空则回到空闲并取消进行中的请求。 */
export function useIntersectionCalculation(
  a: PlotRequest | null,
  b: PlotRequest | null,
): IntersectionState {
  const [state, setState] = useState<IntersectionState>({ status: 'idle' });
  const [previous, setPrevious] = useState<{
    a: PlotRequest | null;
    b: PlotRequest | null;
  } | null>(null);
  // 请求变化或缺失时在渲染期回到空闲（React「存储上次渲染信息」模式），
  // 不在 effect 中同步 setState，避免级联渲染。
  if (previous === null || previous.a !== a || previous.b !== b) {
    setPrevious({ a, b });
    if (state.status !== 'idle') setState({ status: 'idle' });
  }
  useEffect(() => {
    if (!a || !b) return;
    const controller = new AbortController();
    calculateIntersections(a, b, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted)
          setState({ status: 'ready', points: result.points });
      },
      (cause: unknown) => {
        if (!controller.signal.aborted)
          setState({
            status: 'error',
            message: cause instanceof Error ? cause.message : '计算失败',
          });
      },
    );
    return () => controller.abort();
  }, [a, b]);
  return state;
}
