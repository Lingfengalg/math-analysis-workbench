import { useCallback, useEffect, useRef, useState } from 'react';
import {
  plotRequestSchema,
  type PlotRequest,
  type PlotResult,
} from '@/shared/contracts';
import { calculatePlot, calculateTangent } from '@/shared/math/client';

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

export type TangentState =
  | { status: 'idle' }
  | { status: 'ready'; slope: number; value: number }
  | { status: 'error'; message: string };

/** 主曲线已绘制且给出切点 x₀ 时自动计算切线；任一缺失则回到空闲并取消。 */
export function useTangentCalculation(
  request: PlotRequest | null,
  x0: number | null,
): TangentState {
  const [state, setState] = useState<TangentState>({ status: 'idle' });
  const [previous, setPrevious] = useState<{
    request: PlotRequest | null;
    x0: number | null;
  } | null>(null);
  // 请求或切点变化时在渲染期回到空闲（React「存储上次渲染信息」模式），
  // 不在 effect 中同步 setState，避免级联渲染。
  if (previous === null || previous.request !== request || previous.x0 !== x0) {
    setPrevious({ request, x0 });
    if (state.status !== 'idle') setState({ status: 'idle' });
  }
  useEffect(() => {
    if (!request || x0 === null) return;
    const controller = new AbortController();
    calculateTangent(request, x0, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted)
          setState({
            status: 'ready',
            slope: result.slope,
            value: result.value,
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
  }, [request, x0]);
  return state;
}
