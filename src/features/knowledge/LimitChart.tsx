import { useEffect, useRef } from 'react';
import JXG from 'jsxgraph';
import {
  formatLimitNumber,
  observeLimit,
  type LimitExample,
} from './limitMath';
import styles from './LimitLab.module.css';

type Props = {
  example: LimitExample;
  progress: number;
  onExporter: (value: (() => string) | null) => void;
};

/** 直接复用 JSXGraph 的函数图、几何元素与 SVG 导出，不执行用户表达式。 */
export default function LimitChart({ example, progress, onExporter }: Props) {
  const element = useRef<HTMLDivElement>(null);
  const currentScene = useRef({ example, progress });
  const boardRef = useRef<{
    board: JXG.Board;
    square: JXG.GeometryElement;
    leftBranch: JXG.GeometryElement;
    rightBranch: JXG.GeometryElement;
    left: JXG.Point;
    right: JXG.Point;
    holes: JXG.Point[];
  } | null>(null);

  useEffect(() => {
    if (!element.current) return;
    const board = JXG.JSXGraph.initBoard(element.current, {
      boundingbox: [-2, 5, 3, -2],
      renderer: 'svg',
      defaultAxes: {
        x: { ticks: { label: { display: 'internal' } } },
        y: { ticks: { label: { display: 'internal' } } },
      },
      axis: true,
      showNavigation: false,
      showCopyright: false,
      pan: { enabled: false },
      zoom: false,
    });
    const graphStyle = {
      strokeColor: '#5368b5',
      strokeWidth: 3,
      highlight: false,
      fixed: true,
    };
    const square = board.create(
      'functiongraph',
      [(x: number) => x * x, -2, 3],
      graphStyle,
    ) as JXG.GeometryElement;
    const leftBranch = board.create(
      'functiongraph',
      [() => -1, -2, -0.0001],
      graphStyle,
    ) as JXG.GeometryElement;
    const rightBranch = board.create(
      'functiongraph',
      [() => 1, 0.0001, 3],
      graphStyle,
    ) as JXG.GeometryElement;
    const pointStyle = {
      size: 5,
      strokeColor: '#fff',
      strokeWidth: 2,
      fixed: true,
      name: '',
      highlight: false,
    };
    const left = board.create('point', [0, 0], {
      ...pointStyle,
      fillColor: '#b65e42',
    });
    const right = board.create('point', [2, 4], {
      ...pointStyle,
      fillColor: '#328278',
    });
    const holes = [-1, 1].map((y) =>
      board.create('point', [0, y], {
        name: '',
        size: 4,
        strokeColor: '#5368b5',
        fillColor: '#fff',
        strokeWidth: 2,
        fixed: true,
        highlight: false,
      }),
    );
    left.rendNode.setAttribute('data-testid', 'limit-point-left');
    right.rendNode.setAttribute('data-testid', 'limit-point-right');
    boardRef.current = {
      board,
      square,
      leftBranch,
      rightBranch,
      left,
      right,
      holes,
    };
    onExporter(() => {
      const uri = board.renderer.dumpToDataURI();
      const base64 = uri.split(',')[1];
      if (!base64) throw new Error('SVG 导出不可用。');
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const document = new DOMParser().parseFromString(
        new TextDecoder().decode(bytes),
        'image/svg+xml',
      );
      if (
        document.querySelector('parsererror') ||
        document.documentElement.localName !== 'svg'
      )
        throw new Error('SVG 数据不完整。');
      // JSXGraph 保留的 HTML foreignObject 会使浏览器画布跨域污染；轴刻度采用 SVG 文本。
      document
        .querySelectorAll('foreignObject')
        .forEach((node) => node.remove());
      const current = currentScene.current;
      const sample = observeLimit(current.example, current.progress);
      const name =
        current.example === 'square'
          ? 'f(x) = x²; a = 1'
          : 'f(x) = x / |x|; a = 0';
      const title = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'title',
      );
      title.textContent = `左右逼近：${name}`;
      const description = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'desc',
      );
      description.textContent = `距目标点 ${formatLimitNumber(sample.distance)}；左侧函数值 ${formatLimitNumber(sample.leftY)}；右侧函数值 ${formatLimitNumber(sample.rightY)}。`;
      document.documentElement.prepend(title, description);
      const caption = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'text',
      );
      caption.setAttribute('x', '12');
      caption.setAttribute('y', '18');
      caption.setAttribute('fill', '#263859');
      caption.setAttribute('font-family', 'sans-serif');
      caption.setAttribute('font-size', '13');
      caption.textContent = name;
      document.documentElement.append(caption);
      return new XMLSerializer().serializeToString(document.documentElement);
    });
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
      onExporter(null);
      boardRef.current = null;
      JXG.JSXGraph.freeBoard(board);
    };
  }, [onExporter]);

  useEffect(() => {
    currentScene.current = { example, progress };
    const scene = boardRef.current;
    if (!scene) return;
    const sample = observeLimit(example, progress);
    scene.board.suspendUpdate();
    scene.square.setAttribute({ visible: example === 'square' });
    scene.leftBranch.setAttribute({ visible: example === 'jump' });
    scene.rightBranch.setAttribute({ visible: example === 'jump' });
    for (const hole of scene.holes)
      hole.setAttribute({ visible: example === 'jump' });
    scene.left.moveTo([sample.leftX, sample.leftY]);
    scene.right.moveTo([sample.rightX, sample.rightY]);
    scene.board.unsuspendUpdate();
    scene.board.fullUpdate();
  }, [example, progress]);
  return <div ref={element} className={styles.graph} aria-hidden="true" />;
}
