import { useEffect, useRef } from 'react';
import JXG from 'jsxgraph';
import {
  evaluateDemo,
  observeDerivative,
  type DemoFunction,
} from './derivativeMath';
import styles from './DerivativeLab.module.css';

type Props = {
  kind: DemoFunction;
  x: number;
  h: number;
  onPointChange: (value: number) => void;
  onIncrementChange: (value: number) => void;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const snap = (value: number, scale: number) =>
  Math.round(value * scale) / scale;

/** JSXGraph 负责可拖动的几何构造；函数只使用本地固定的 JavaScript 回调。 */
export default function DerivativeChart(props: Props) {
  const element = useRef<HTMLDivElement>(null);
  const current = useRef(props);
  const drawing = useRef<{
    board: JXG.Board;
    first: JXG.Point;
    second: JXG.Point;
    secant: JXG.Line;
    tangent: JXG.Line;
  } | null>(null);

  useEffect(() => {
    if (!element.current) return;
    const board = JXG.JSXGraph.initBoard(element.current, {
      boundingbox: [-2.5, 6.5, 2.5, -1],
      axis: true,
      showNavigation: false,
      showCopyright: false,
      pan: { enabled: false },
      zoom: false,
    });
    const y = (point: number) => evaluateDemo(current.current.kind, point);
    board.create('functiongraph', [y, -2.5, 2.5], {
      strokeColor: '#4358af',
      strokeWidth: 3,
      highlight: false,
    });
    const first = board.create(
      'point',
      [current.current.x, y(current.current.x)],
      {
        name: '',
        size: 5,
        fillColor: '#4358af',
        strokeColor: '#ffffff',
        strokeWidth: 2,
        highlightFillColor: '#304690',
        highlightStrokeColor: '#ffffff',
      },
    );
    const endX = current.current.x + current.current.h;
    const second = board.create('point', [endX, y(endX)], {
      name: '',
      size: 5,
      fillColor: '#be6d4f',
      strokeColor: '#ffffff',
      strokeWidth: 2,
      highlightFillColor: '#a65437',
      highlightStrokeColor: '#ffffff',
    });
    first.rendNode.setAttribute('data-testid', 'derivative-point-a');
    second.rendNode.setAttribute('data-testid', 'derivative-point-b');
    first.on('drag', () => {
      const nextX = snap(clamp(first.X(), -1.5, 1.5), 10);
      first.setPositionDirectly(JXG.COORDS_BY_USER, [nextX, y(nextX)]);
      current.current.onPointChange(nextX);
    });
    second.on('drag', () => {
      const nextH = snap(clamp(second.X() - current.current.x, -1, 1), 100);
      const nextX = current.current.x + nextH;
      second.setPositionDirectly(JXG.COORDS_BY_USER, [nextX, y(nextX)]);
      current.current.onIncrementChange(nextH);
    });
    const coefficient = (type: 'secant' | 'tangent') => {
      const { kind, x, h } = current.current;
      const result = observeDerivative(kind, x, h);
      const slope = result[type] ?? 0;
      return { intercept: result.value - slope * x, slope };
    };
    const tangent = board.create(
      'line',
      [
        () => coefficient('tangent').intercept,
        () => coefficient('tangent').slope,
        -1,
      ],
      {
        strokeColor: '#3d857e',
        strokeWidth: 2,
        dash: 2,
        fixed: true,
        highlight: false,
      },
    );
    const secant = board.create(
      'line',
      [
        () => coefficient('secant').intercept,
        () => coefficient('secant').slope,
        -1,
      ],
      {
        strokeColor: '#be6d4f',
        strokeWidth: 2,
        fixed: true,
        highlight: false,
      },
    );
    drawing.current = { board, first, second, secant, tangent };
    const observer = new ResizeObserver(() => {
      if (element.current)
        board.resizeContainer(
          element.current.clientWidth,
          element.current.clientHeight,
          true,
        );
    });
    observer.observe(element.current);
    return () => {
      observer.disconnect();
      drawing.current = null;
      JXG.JSXGraph.freeBoard(board);
    };
  }, []);

  useEffect(() => {
    current.current = props;
    const scene = drawing.current;
    if (!scene) return;
    const { kind, x, h } = props;
    const { secant, tangent } = observeDerivative(kind, x, h);
    scene.board.suspendUpdate();
    scene.first.moveTo([x, evaluateDemo(kind, x)]);
    scene.second.moveTo([x + h, evaluateDemo(kind, x + h)]);
    scene.second.setAttribute({ visible: secant !== null });
    scene.secant.setAttribute({ visible: secant !== null });
    scene.tangent.setAttribute({ visible: tangent !== null });
    scene.board.unsuspendUpdate();
    scene.board.fullUpdate();
  }, [props]);

  return <div ref={element} className={styles.graph} aria-hidden="true" />;
}
