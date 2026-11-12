import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router';
import { createMistakeTopicLink } from '@/shared/navigation/knowledge-link';
import { createPlotLink } from '@/shared/navigation/plot-link';
import {
  formatDemoNumber,
  observeDerivative,
  type DemoFunction,
} from './derivativeMath';
import styles from './DerivativeLab.module.css';

const functions: { id: DemoFunction; label: string; expression: string }[] = [
  { id: 'square', label: 'f(x) = x²', expression: 'x^2' },
  { id: 'absolute', label: 'f(x) = |x|', expression: 'abs(x)' },
];
const fmt = formatDemoNumber;
const DerivativeChart = lazy(() => import('./DerivativeChart'));

export function DerivativeLab() {
  const [kind, setKind] = useState<DemoFunction>('square');
  const [x, setX] = useState(0.5);
  const [h, setH] = useState(1);
  const [answer, setAnswer] = useState<'yes' | 'no' | null>(null);
  const { value, nextValue, secant, tangent } = observeDerivative(kind, x, h);
  const selected = functions.find((item) => item.id === kind)!;
  const plot = createPlotLink({
    expression: selected.expression,
    xMin: -3,
    xMax: 3,
    ...(kind === 'absolute'
      ? { sourceKnowledgeId: 'derivative-absolute' }
      : {}),
  });
  return (
    <section className={styles.lab} aria-labelledby="derivative-lab-title">
      <div className={styles.intro}>
        <div>
          <span className={styles.kicker}>动手观察</span>
          <h3 id="derivative-lab-title">从割线走向切线</h3>
          <p>拖动图上的点，或使用滑块，观察两点之间的平均变化率。</p>
        </div>
        <span className={styles.formula}>Δy / Δx</span>
      </div>
      <div className={styles.workbench}>
        <div className={styles.figure}>
          <div className={styles.figureHeading}>
            <strong>变化率实验</strong>
            <span>{selected.label}</span>
          </div>
          <div
            role="img"
            aria-label={`函数图像，观察点 x 等于 ${fmt(x)}，增量 h 等于 ${fmt(h)}；${secant === null ? 'h 为零，割线斜率未定义' : `割线斜率约为 ${fmt(secant)}`}；${tangent === null ? '该点不可导' : `导数为 ${fmt(tangent)}`}`}
          >
            <Suspense
              fallback={
                <div className={styles.graphLoading}>正在加载图像…</div>
              }
            >
              <DerivativeChart
                kind={kind}
                x={x}
                h={h}
                onPointChange={setX}
                onIncrementChange={setH}
              />
            </Suspense>
          </div>
          <div className={styles.legend} aria-label="图例">
            <span>
              <i className={styles.curveKey} />
              函数
            </span>
            <span>
              <i className={styles.secantKey} />
              割线
            </span>
            <span>
              <i className={styles.tangentKey} />
              切线（可导时）
            </span>
          </div>
        </div>
        <div className={styles.controls}>
          <fieldset className={styles.functionPicker}>
            <legend>选择函数</legend>
            <div>
              {functions.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  aria-pressed={kind === item.id}
                  onClick={() => setKind(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </fieldset>
          <label className={styles.sliderLabel} htmlFor="derivative-point">
            <span>
              观察点 <i>x</i>
            </span>
            <span className={styles.sliderValue} aria-hidden="true">
              {fmt(x)}
            </span>
          </label>
          <input
            id="derivative-point"
            className={styles.slider}
            type="range"
            min="-1.5"
            max="1.5"
            step="0.1"
            value={x}
            onChange={(event) => setX(Number(event.target.value))}
          />
          <label className={styles.sliderLabel} htmlFor="derivative-increment">
            <span>
              增量 <i>h</i>
            </span>
            <span className={styles.sliderValue} aria-hidden="true">
              {fmt(h)}
            </span>
          </label>
          <input
            id="derivative-increment"
            className={styles.slider}
            type="range"
            min="-1"
            max="1"
            step="0.01"
            value={h}
            onChange={(event) => setH(Number(event.target.value))}
          />
          <div className={styles.readout}>
            <div>
              <span>两点函数值</span>
              <strong>
                {fmt(value)} → {fmt(nextValue)}
              </strong>
            </div>
            <div>
              <span>割线斜率</span>
              <strong>{secant === null ? '未定义' : fmt(secant)}</strong>
            </div>
            <div>
              <span>该点导数</span>
              <strong>{tangent === null ? '不存在' : fmt(tangent)}</strong>
            </div>
          </div>
          <p className={styles.explanation}>
            {h === 0
              ? 'h = 0 时两点重合，差商分母为零，不能计算割线斜率。'
              : kind === 'absolute' && x === 0
                ? '在 0 处试试正、负 h：左右差商分别为 1 和 −1，故导数不存在。'
                : '试着让 h 从两侧接近 0，比较割线斜率与该点导数。'}
          </p>
          <button
            className={styles.reset}
            type="button"
            onClick={() => {
              setKind('square');
              setX(0.5);
              setH(1);
            }}
          >
            重置实验
          </button>
        </div>
      </div>
      <p className={styles.caveat}>
        图像与有限次观察用于帮助理解，不能替代极限证明；这里的导数结果来自两个固定例子的解析结果。
      </p>
      <div className={styles.question}>
        <div>
          <span className={styles.kicker}>检验理解</span>
          <h4>|x| 在 x = 0 处连续，它在该点一定可导吗？</h4>
        </div>
        <div className={styles.answers}>
          <button
            type="button"
            aria-pressed={answer === 'yes'}
            onClick={() => setAnswer('yes')}
          >
            一定可导
          </button>
          <button
            type="button"
            aria-pressed={answer === 'no'}
            onClick={() => setAnswer('no')}
          >
            不一定可导
          </button>
        </div>
        {answer && (
          <p className={styles.feedback} role="status">
            {answer === 'no'
              ? '正确。|x| 在 0 的左导数为 −1、右导数为 1，因此不可导。'
              : '再想一想：在 0 点分别从左、右两侧计算差商，结果是否相同？'}
          </p>
        )}
      </div>
      <div className={styles.next}>
        <Link to={plot}>在绘图中继续探索</Link>
        <Link to="/mistakes?topic=derivative&practice=1">开始导数练习</Link>
        <Link to={createMistakeTopicLink('derivative')!}>前往导数错题本</Link>
      </div>
    </section>
  );
}
