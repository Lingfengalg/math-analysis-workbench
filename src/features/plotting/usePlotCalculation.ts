import { useCallback, useEffect, useRef, useState } from 'react';
import {
  plotRequestSchema,
  sequenceRequestSchema,
  type PlotRequest,
  type PlotResult,
  type SequenceRequest,
} from '@/shared/contracts';
import { calculatePlot, calculateSequence } from '@/shared/math/client';

export type PlotState =
  | { status: 'loading'; request: PlotRequest }
  | { status: 'ready'; request: PlotRequest; result: PlotResult }
  | { status: 'error'; message: string };

export type SequenceState =
  | { status: 'idle' }
  | { status: 'loading'; request: SequenceRequest }
  | { status: 'ready'; request: SequenceRequest; result: PlotResult }
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

/**
 * 数列计算与函数模式共用同一生命周期规则；初始为空（idle），
 * 切换到数列模式绘制前不启动任何计算。
 */
export function useSequenceCalculation() {
  const [request, setRequest] = useState<SequenceRequest | null>(null);
  const [state, setState] = useState<SequenceState>({ status: 'idle' });
  const active = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    active.current = controller;
    calculateSequence(request, controller.signal).then(
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

  const draw = useCallback((value: SequenceRequest) => {
    active.current?.abort();
    const valid = sequenceRequestSchema.safeParse(value);
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
