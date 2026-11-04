import { useCallback, useEffect, useRef, useState } from 'react';
import {
  plotRequestSchema,
  type PlotPoint,
  type PlotRequest,
  type PlotResult,
} from '@/shared/contracts';
import { calculatePlot, calculateTaylor } from '@/shared/math/client';

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

export type TaylorState =
  | { status: 'idle' }
  | { status: 'ready'; coefficients: number[]; points: PlotPoint[] }
  | { status: 'error'; message: string };

/** 主曲线已绘制且给出展开中心与阶数时自动计算泰勒多项式；任一缺失则回空闲。 */
export function useTaylorCalculation(
  request: PlotRequest | null,
  center: number | null,
  order: number | null,
): TaylorState {
  const [state, setState] = useState<TaylorState>({ status: 'idle' });
  const [previous, setPrevious] = useState<{
    request: PlotRequest | null;
    center: number | null;
    order: number | null;
  } | null>(null);
  // 请求、展开中心或阶数变化时在渲染期回到空闲（React「存储上次渲染信息」
  // 模式），不在 effect 中同步 setState，避免级联渲染。
  if (
    previous === null ||
    previous.request !== request ||
    previous.center !== center ||
    previous.order !== order
  ) {
    setPrevious({ request, center, order });
    if (state.status !== 'idle') setState({ status: 'idle' });
  }
  useEffect(() => {
    if (!request || center === null || order === null) return;
    const controller = new AbortController();
    calculateTaylor(request, center, order, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted)
          setState({
            status: 'ready',
            coefficients: result.coefficients,
            points: result.points,
          });
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
  }, [request, center, order]);
  return state;
}
