import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router';
import { Easing, Tween } from '@tweenjs/tween.js';
import {
  observeLimit,
  formatLimitNumber,
  type LimitExample,
} from './limitMath';
import styles from './LimitLab.module.css';

const LimitChart = lazy(() => import('./LimitChart'));
const fmt = formatLimitNumber;

export function LimitLab() {
  const [example, setExample] = useState<LimitExample>('square');
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [ready, setReady] = useState(false);
  const [exportError, setExportError] = useState('');
  const current = useRef(0);
  const frame = useRef<number | null>(null);
  const tween = useRef<Tween<{ value: number }> | null>(null);
  const exporter = useRef<(() => string) | null>(null);
  const receiveExporter = useCallback((fn: (() => string) | null) => {
    exporter.current = fn;
    setReady(Boolean(fn));
  }, []);
  const stop = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    tween.current?.stop();
    tween.current = null;
    setPlaying(false);
  }, []);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const update = () => {
      const reduced = media?.matches ?? false;
      setReducedMotion(reduced);
      if (reduced) stop();
    };
    const visibility = () => {
      if (document.hidden) stop();
    };
    update();
    media?.addEventListener?.('change', update);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      media?.removeEventListener?.('change', update);
      document.removeEventListener('visibilitychange', visibility);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      tween.current?.stop();
      tween.current = null;
    };
  }, [stop]);

  const reset = () => {
    stop();
    current.current = 0;
    setProgress(0);
  };
  const play = () => {
    if (playing) {
      stop();
      return;
    }
    if (reducedMotion) return;
    const from = current.current >= 100 ? 0 : current.current;
    current.current = from;
    setProgress(from);
    const state = { value: from };
    const animation = new Tween(state)
      .to({ value: 100 }, Math.max(200, (100 - from) * 55))
      .easing(Easing.Quadratic.Out)
      .onUpdate(() => {
        current.current = state.value;
        setProgress(state.value);
      })
      .onComplete(() => {
        frame.current = null;
        tween.current = null;
        setPlaying(false);
      });
    tween.current = animation;
    setPlaying(true);
    animation.start(performance.now());
    const tick = (time: number) => {
      if (tween.current !== animation) return;
      animation.update(time);
      if (animation.isPlaying()) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };

  const exportSvg = () => {
    try {
      const svg = exporter.current?.();
      if (!svg || !svg.includes('<svg')) throw new Error('图像尚未准备好。');
      const link = document.createElement('a');
      link.href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      link.download = `limit-${example}-snapshot.svg`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setExportError('');
    } catch {
      setExportError('导出未成功，请等待图像加载后重试。');
    }
  };
  const sample = observeLimit(example, progress);
  const changeExample = (next: LimitExample) => {
    reset();
    setExample(next);
    setExportError('');
  };
  return (
    <section className={styles.lab} aria-labelledby="limit-lab-title">
      <div className={styles.intro}>
        <div>
          <span className={styles.kicker}>互动演示</span>
          <h3 id="limit-lab-title">向同一个点靠近</h3>
          <p>同时观察左右两侧：距离缩小，函数值会发生什么变化？</p>
        </div>
        <div className={styles.symbol} aria-hidden="true">
          x → a
        </div>
      </div>
      <div className={styles.workbench}>
        <div className={styles.figure}>
          <div className={styles.figureTitle}>
            <strong>左右逼近</strong>
            <span>
              {example === 'square'
                ? 'f(x) = x²，a = 1'
                : 'f(x) = x / |x|，a = 0'}
            </span>
          </div>
          <div
            role="img"
            aria-label={`左右逼近图，左侧 x 为 ${fmt(sample.leftX)}、函数值为 ${fmt(sample.leftY)}；右侧 x 为 ${fmt(sample.rightX)}、函数值为 ${fmt(sample.rightY)}。`}
          >
            <Suspense
              fallback={
                <div className={styles.graphLoading}>正在加载图像…</div>
              }
            >
              <LimitChart
                example={example}
                progress={progress}
                onExporter={receiveExporter}
              />
            </Suspense>
          </div>
          <div className={styles.legend}>
            <span>
              <i className={styles.leftKey} />
              从左侧靠近
            </span>
            <span>
              <i className={styles.rightKey} />
              从右侧靠近
            </span>
          </div>
        </div>
        <div className={styles.controls}>
          <fieldset className={styles.choices}>
            <legend>选择一个例子</legend>
            <div>
              <button
                type="button"
                aria-pressed={example === 'square'}
                onClick={() => changeExample('square')}
              >
                x²：左右一致
              </button>
              <button
                type="button"
                aria-pressed={example === 'jump'}
                onClick={() => changeExample('jump')}
              >
                x / |x|：左右不同
              </button>
            </div>
          </fieldset>
          <label className={styles.label} htmlFor="limit-progress">
            <span>逼近进度</span>
            <strong aria-hidden="true">{Math.round(progress)}%</strong>
          </label>
          <input
            id="limit-progress"
            type="range"
            min="0"
            max="100"
            step="0.1"
            value={progress}
            onChange={(event) => {
              stop();
              const next = Number(event.target.value);
              current.current = next;
              setProgress(next);
            }}
          />
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              onClick={play}
              disabled={reducedMotion}
            >
              {playing ? '暂停动画' : progress >= 100 ? '重新播放' : '播放动画'}
            </button>
            <button type="button" onClick={reset}>
              重置
            </button>
            <button type="button" onClick={exportSvg} disabled={!ready}>
              导出当前画面 SVG
            </button>
          </div>
          {reducedMotion && (
            <p className={styles.muted}>
              设备已启用减少动态效果，请用滑块手动观察。
            </p>
          )}
          {exportError && (
            <p className={styles.error} role="alert">
              {exportError}
            </p>
          )}
          <div className={styles.readouts}>
            <div>
              <span>与目标点的距离</span>
              <strong>{fmt(sample.distance)}</strong>
            </div>
            <div>
              <span>左侧函数值</span>
              <strong>{fmt(sample.leftY)}</strong>
            </div>
            <div>
              <span>右侧函数值</span>
              <strong>{fmt(sample.rightY)}</strong>
            </div>
          </div>
          <p className={styles.explanation}>
            {example === 'square'
              ? '左右函数值都趋向 1；当 x 越靠近 1，两个点越靠近 (1, 1)。'
              : '当 x 从左、右靠近 0，函数值分别为 −1 和 1；两侧不相等，双侧极限不存在，且函数在 0 处未定义。'}
          </p>
        </div>
      </div>
      <p className={styles.note}>
        动画最小距离为
        0.01，不会让点到达目标。有限观察和图像不能替代极限证明。SVG
        导出的是当前静态画面，不包含动画。
      </p>
      <div className={styles.links}>
        <Link to="/mistakes?topic=limit&practice=1">开始极限练习</Link>
        <Link to="/mistakes?topic=limit">查看极限错题</Link>
      </div>
    </section>
  );
}
