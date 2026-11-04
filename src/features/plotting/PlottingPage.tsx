import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Space,
  Spin,
  Tag,
} from 'antd';
import {
  DeleteOutlined,
  DownloadOutlined,
  LineChartOutlined,
  PlusOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import {
  plotRequestSchema,
  preferencesSchema,
  type IntersectionPoint,
  type PlotRequest,
  type PlotResult,
} from '@/shared/contracts';
import { parsePlotSearch } from '@/shared/navigation/plot-link';
import { createStorage } from '@/shared/storage';
import { calculatePlot } from '@/shared/math/client';
import {
  formatGapRange,
  formatNumber,
  summarizePlot,
  type PlotSummary,
} from '@/shared/math/plot-summary';
import {
  comparisonCurveColor,
  MAIN_CURVE_COLOR,
} from '@/shared/ui/chart-series';
import {
  FunctionChart,
  type ComparisonCurve,
  type FunctionChartHandle,
} from '@/shared/ui/FunctionChart';
import { PageHeader } from '@/shared/ui/PageHeader';
import {
  buildPlotExportName,
  downloadBlob,
  pngDataUrlToBlob,
} from '@/shared/ui/plot-export';
import {
  useComparisonCalculation,
  useIntersectionCalculation,
  usePlotCalculation,
} from './usePlotCalculation';

const DEFAULT: PlotRequest = { expression: 'x^2', xMin: -5, xMax: 5 };
const preferences = createStorage('preferences', preferencesSchema);

function PlotSummaryPanel({
  summary,
  totalPoints,
}: {
  summary: PlotSummary;
  totalPoints: number;
}) {
  const { finiteCount, minY, maxY, gapRanges } = summary;
  const rangeText =
    minY === null || maxY === null
      ? '没有可显示的有限实数值。'
      : `有限值范围：f(x) ≈ ${formatNumber(minY)} 至 ${formatNumber(maxY)}`;
  const gapsText =
    gapRanges.length === 0
      ? '未检测到采样缺口。'
      : `检测到 ${gapRanges.length} 处采样缺口位置：${gapRanges
          .slice(0, 6)
          .map(formatGapRange)
          .join(
            '；',
          )}${gapRanges.length > 6 ? ` 等 ${gapRanges.length} 处` : ''}`;
  return (
    <section className="plot-summary" aria-labelledby="plot-summary-heading">
      <h3 id="plot-summary-heading">采样数据摘要</h3>
      <p className="chart-summary">
        键盘与屏幕阅读器可用的文本替代；有限采样不等于数学证明。
      </p>
      <ul>
        <li>
          有效数据点：{finiteCount} 个（共 {totalPoints} 个图像点）
        </li>
        <li>{rangeText}</li>
        <li>{gapsText}</li>
      </ul>
      <p className="chart-summary">
        显示限制：超出定义域、非有限值或 |f(x)| 大于 10⁶
        的点留空。这些采样缺口不代表一定是数学间断；虚线标记的是疑似间断位置
        （启发式检测，可能漏检或误判）。可用键盘在左/右端点调整观察范围，代替鼠标缩放。
      </p>
    </section>
  );
}

// 对比曲线占位字母，按添加顺序分配；上限 3 条。
const COMPARISON_LABELS = ['g', 'h', 'p'];

function ComparisonEntry({
  index,
  range,
  mainRequest,
  onUpdate,
  onRemove,
}: {
  index: number;
  range: { xMin: number; xMax: number };
  mainRequest: PlotRequest | null;
  onUpdate: (
    entry: {
      expression: string;
      result: PlotResult;
      intersections: IntersectionPoint[] | null;
    } | null,
  ) => void;
  onRemove: () => void;
}) {
  const label = COMPARISON_LABELS[index] ?? `g${index + 1}`;
  const [expression, setExpression] = useState('');
  const { state, draw } = useComparisonCalculation();
  const drawnExpression = useRef('');
  const lastRange = useRef(range);
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  });
  // 近似交点只在主曲线与对比曲线都绘制完成后计算（数值近似，非符号求解）。
  const ownRequest = state.status === 'ready' ? state.request : null;
  const intersectionState = useIntersectionCalculation(mainRequest, ownRequest);

  // 把已绘制的对比曲线与交点结果上报给父组件；空闲、计算中或卸载时上报 null。
  useEffect(() => {
    const entry =
      state.status === 'ready'
        ? {
            expression: state.request.expression,
            result: state.result,
            intersections:
              intersectionState.status === 'ready'
                ? intersectionState.points
                : null,
          }
        : null;
    onUpdateRef.current(entry);
    return () => onUpdateRef.current(null);
  }, [state, intersectionState]);

  // 与主曲线共享观察区间：主曲线换区间重绘后，对比曲线用同一区间自动重绘。
  useEffect(() => {
    const { xMin, xMax } = range;
    const changed =
      lastRange.current.xMin !== xMin || lastRange.current.xMax !== xMax;
    lastRange.current = { xMin, xMax };
    if (changed && drawnExpression.current !== '') {
      draw({ expression: drawnExpression.current, xMin, xMax });
    }
  }, [range, draw]);

  const submit = () => {
    const value = expression.trim();
    if (value === '') return;
    drawnExpression.current = value;
    draw({ expression: value, xMin: range.xMin, xMax: range.xMax });
  };

  return (
    <div className="comparison-entry">
      <div className="comparison-controls">
        <Input
          className="comparison-input"
          value={expression}
          onChange={(event) => setExpression(event.target.value)}
          onPressEnter={submit}
          placeholder={`例如 ${label}(x) = abs(x)`}
          aria-label={`对比表达式 ${label}(x)`}
          autoComplete="off"
        />
        <Button
          onClick={submit}
          loading={state.status === 'loading'}
          aria-label={`绘制对比曲线 ${label}(x)`}
        >
          绘制
        </Button>
        <Button
          danger
          onClick={onRemove}
          aria-label={`移除对比曲线 ${label}(x)`}
          icon={<DeleteOutlined />}
        />
      </div>
      {state.status === 'loading' && (
        <p className="chart-summary" role="status">
          正在计算 {label}(x) 的采样点…
        </p>
      )}
      {state.status === 'error' && (
        <p className="chart-summary comparison-error">
          无法绘制 {label}(x)：{state.message}
        </p>
      )}
      {state.status === 'ready' && (
        <p className="chart-summary" role="status">
          {label}(x) = {state.request.expression} · {state.result.points.length}{' '}
          个图像点 · {state.result.gaps} 处采样缺口
        </p>
      )}
    </div>
  );
}

function PlottingWorkspace({
  initial,
  warning,
  initialStorageError,
}: {
  initial: PlotRequest;
  warning?: string;
  initialStorageError?: string;
}) {
  const [form] = Form.useForm<PlotRequest>();
  const { state: plot, draw: drawPlot } = usePlotCalculation(initial);
  const [saving, setSaving] = useState(false);
  const [storageError, setStorageError] = useState(initialStorageError);
  // 知识来源提示只在当前绘图仍与链接示例一致时显示
  const [sourceId, setSourceId] = useState(initial.sourceKnowledgeId);
  const saveController = useRef<AbortController | null>(null);
  const chartRef = useRef<FunctionChartHandle>(null);
  const [exportStatus, setExportStatus] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [saveStatus, setSaveStatus] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [comparisonIds, setComparisonIds] = useState<number[]>([]);
  const nextComparisonId = useRef(1);
  const [comparisonEntries, setComparisonEntries] = useState<
    Map<
      number,
      {
        expression: string;
        result: PlotResult;
        intersections: IntersectionPoint[] | null;
      }
    >
  >(new Map());
  // 对比曲线与主曲线共享观察区间：记录主曲线最近一次有效绘制的区间。
  const [range, setRange] = useState({
    xMin: initial.xMin,
    xMax: initial.xMax,
  });
  const result = plot.status === 'ready' ? plot.result : null;
  // 主曲线绘制完成后才有交点可算；重绘期间置空。
  const mainRequest = plot.status === 'ready' ? plot.request : null;
  const summary = useMemo(
    () => (result ? summarizePlot(result.points) : null),
    [result],
  );
  const updateComparison = useCallback(
    (
      id: number,
      entry: {
        expression: string;
        result: PlotResult;
        intersections: IntersectionPoint[] | null;
      } | null,
    ) => {
      setComparisonEntries((prev) => {
        const existing = prev.get(id);
        if (entry === null) {
          if (existing === undefined) return prev;
          const next = new Map(prev);
          next.delete(id);
          return next;
        }
        if (
          existing &&
          existing.result === entry.result &&
          existing.expression === entry.expression &&
          existing.intersections === entry.intersections
        )
          return prev;
        const next = new Map(prev);
        next.set(id, entry);
        return next;
      });
    },
    [],
  );
  const addComparison = () => {
    setComparisonIds((ids) =>
      ids.length >= 3 ? ids : [...ids, nextComparisonId.current++],
    );
  };
  const removeComparison = (id: number) => {
    setComparisonIds((ids) => ids.filter((item) => item !== id));
    setComparisonEntries((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };
  const comparisonCurves = useMemo(() => {
    const curves: ComparisonCurve[] = [];
    for (const id of comparisonIds) {
      const entry = comparisonEntries.get(id);
      if (!entry) continue;
      const curveSummary = summarizePlot(entry.result.points);
      curves.push({
        points: entry.result.points,
        expression: entry.expression,
        // 与主曲线同样的规则：只标记孤立的单点疑似缺口，控制密度。
        gapMarkers: curveSummary.gapRanges
          .filter((gapRange) => gapRange.from === gapRange.to)
          .map((gapRange) => gapRange.from)
          .slice(0, 8),
        intersections: entry.intersections ?? undefined,
      });
    }
    return curves;
  }, [comparisonIds, comparisonEntries]);
  // Only isolated single-point gaps (suspected poles or jumps) get a dashed
  // marker; merged gap ranges stay unmarked. Cap keeps dense cases readable.
  const gapMarkers = useMemo(
    () =>
      (summary?.gapRanges ?? [])
        .filter((range) => range.from === range.to)
        .map((range) => range.from)
        .slice(0, 8),
    [summary],
  );
  useEffect(() => () => saveController.current?.abort(), []);

  const draw = (value: PlotRequest) => {
    const unchangedFromLink =
      initial.sourceKnowledgeId !== undefined &&
      value.expression === initial.expression &&
      value.xMin === initial.xMin &&
      value.xMax === initial.xMax;
    const sourceKnowledgeId = unchangedFromLink
      ? initial.sourceKnowledgeId
      : undefined;
    if (plotRequestSchema.safeParse(value).success) {
      setSourceId(sourceKnowledgeId);
      setRange({ xMin: value.xMin, xMax: value.xMax });
    }
    setExportStatus(null);
    drawPlot({ ...value, sourceKnowledgeId });
  };
  // 导出当前画布为 PNG（ECharts getDataURL），不重新采样、不上传。
  const exportImage = () => {
    if (plot.status !== 'ready') return;
    try {
      const dataUrl = chartRef.current?.exportPng() ?? '';
      if (!dataUrl) {
        setExportStatus({
          ok: false,
          text: '导出失败：图像尚未绘制完成，请先绘制函数。',
        });
        return;
      }
      const blob = pngDataUrlToBlob(dataUrl);
      if (!blob) {
        setExportStatus({ ok: false, text: '导出失败：画布数据无法解析。' });
        return;
      }
      const filename = buildPlotExportName(
        plot.request.expression,
        plot.request.xMin,
        plot.request.xMax,
      );
      if (!downloadBlob(blob, filename)) {
        setExportStatus({ ok: false, text: '导出失败：浏览器下载不可用。' });
        return;
      }
      setExportStatus({
        ok: true,
        text: '已导出 PNG 图像，请查看浏览器下载。',
      });
    } catch {
      setExportStatus({
        ok: false,
        text: '导出失败：画布当前不可用，请重新绘制后重试。',
      });
    }
  };
  const preset = (expression: string) => {
    const next = { expression, xMin: -5, xMax: 5 };
    form.setFieldsValue(next);
    draw(next);
  };
  const save = async () => {
    if (saveController.current) return;
    const controller = new AbortController();
    saveController.current = controller;
    setSaving(true);
    setSaveStatus(null);
    try {
      let values: PlotRequest;
      try {
        values = await form.validateFields();
      } catch {
        return; // Form fields show validation errors.
      }
      if (controller.signal.aborted) return;
      const valid = plotRequestSchema.safeParse(values);
      if (!valid.success) {
        setSaveStatus({ ok: false, text: valid.error.issues[0].message });
        return;
      }
      await calculatePlot(valid.data, controller.signal);
      if (controller.signal.aborted) return;
      const stored = preferences.read({ defaultPlot: DEFAULT });
      if (!stored.ok) {
        setStorageError(stored.error);
        setSaveStatus({ ok: false, text: '旧设置无法读取，未覆盖原始数据。' });
        return;
      }
      const result = preferences.write({ defaultPlot: valid.data });
      setSaveStatus({
        ok: result.ok,
        text: result.ok
          ? '已保存到当前浏览器，下次访问绘图模块时生效。'
          : result.error,
      });
    } catch (cause: unknown) {
      if (!controller.signal.aborted)
        setSaveStatus({
          ok: false,
          text: `未保存：${cause instanceof Error ? cause.message : '计算失败'}`,
        });
    } finally {
      if (!controller.signal.aborted) {
        saveController.current = null;
        setSaving(false);
      }
    }
  };
  const clearPreferences = () => {
    const stored = preferences.read({ defaultPlot: DEFAULT });
    if (stored.ok) {
      setStorageError(undefined);
      setSaveStatus({ ok: true, text: '设置已恢复可读取，未清除数据。' });
      return;
    }
    const result = preferences.clear();
    if (result.ok) {
      setStorageError(undefined);
      setSaveStatus({ ok: true, text: '旧设置已清除，可以重新保存。' });
    } else {
      setSaveStatus({ ok: false, text: result.error });
    }
  };
  // Export the raw stored string untouched (corrupted JSON and unknown
  // versions included) as a local download; nothing is sent anywhere.
  const backupPreferences = async () => {
    const stored = preferences.readRaw();
    if (!stored.ok) {
      setSaveStatus({ ok: false, text: `无法备份：${stored.error}` });
      return;
    }
    if (stored.data === null) {
      setSaveStatus({
        ok: false,
        text: '当前没有已保存的绘图默认设置，无需备份。',
      });
      return;
    }
    try {
      const blob = new Blob([stored.data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'math-workbench-preferences-backup.json';
      anchor.click();
      URL.revokeObjectURL(url);
      setSaveStatus({
        ok: true,
        text: '已导出原始数据备份，浏览器存储未被修改。',
      });
    } catch {
      setSaveStatus({
        ok: false,
        text: '备份下载失败：浏览器阻止了下载，请改用开发者工具复制原始内容。',
      });
    }
  };

  return (
    <>
      {warning && (
        <Alert
          type="warning"
          showIcon
          title={warning}
          className="section-gap-bottom"
        />
      )}
      {storageError && (
        <Alert
          type="warning"
          showIcon
          className="section-gap-bottom"
          title="本地默认设置无法读取"
          description={`${storageError} 原始数据未被覆盖。可先导出原始内容备份；确认不再需要后可清除。`}
          action={
            <Space>
              <Button size="small" onClick={() => void backupPreferences()}>
                备份原始数据
              </Button>
              <Popconfirm
                title="清除无法读取的默认设置？"
                description="清除后无法恢复，请先备份。"
                okText="确认清除"
                cancelText="取消"
                onConfirm={clearPreferences}
              >
                <Button danger size="small">
                  清除旧设置
                </Button>
              </Popconfirm>
            </Space>
          }
        />
      )}
      {sourceId && (
        <Alert
          type="info"
          showIcon
          title="已接收知识导航中的示例"
          description={`来源卡片：${sourceId}`}
          className="section-gap-bottom"
        />
      )}
      <div className="plot-layout">
        <Card title="设置函数" className="plot-settings">
          <Form
            form={form}
            layout="vertical"
            initialValues={initial}
            onFinish={draw}
            requiredMark={false}
          >
            <Form.Item
              name="expression"
              label="函数表达式 f(x)"
              rules={[
                {
                  required: true,
                  whitespace: true,
                  message: '请输入函数表达式',
                },
                { max: 160, message: '最多 160 个字符' },
              ]}
            >
              <Input placeholder="例如 sin(x) + x^2" autoComplete="off" />
            </Form.Item>
            <div className="range-fields">
              <Form.Item
                name="xMin"
                label="左端点"
                rules={[
                  { required: true, type: 'number', message: '请输入左端点' },
                ]}
              >
                <InputNumber min={-10000} max={10000} />
              </Form.Item>
              <Form.Item
                name="xMax"
                label="右端点"
                rules={[
                  { required: true, type: 'number', message: '请输入右端点' },
                ]}
              >
                <InputNumber min={-10000} max={10000} />
              </Form.Item>
            </div>
            <Button
              type="primary"
              htmlType="submit"
              icon={<LineChartOutlined />}
              block
              loading={plot.status === 'loading'}
            >
              绘制函数
            </Button>
          </Form>
          <Button
            className="section-gap"
            icon={<SaveOutlined />}
            onClick={() => void save()}
            loading={saving}
            block
          >
            保存默认设置
          </Button>
          <h3 className="detail-heading">快速尝试</h3>
          <Space wrap>
            {['x^2', 'abs(x)', '1/x', 'sin(x)'].map((expression) => (
              <Button
                key={expression}
                size="small"
                onClick={() => preset(expression)}
              >
                {expression}
              </Button>
            ))}
          </Space>
          <p className="small-note">
            支持 x、pi、e，以及 sin / cos / tan / asin / acos / atan / abs /
            sqrt / log / exp。log 为自然对数。幂指数限数字常量，绝对值不超过
            20。
          </p>
          <h3 className="detail-heading">对比曲线</h3>
          <p className="small-note comparison-note">
            最多 3
            条，与主曲线共享观察区间与缩放；每条曲线独立有限采样，不构成数学结论。
          </p>
          {comparisonIds.map((id, index) => (
            <ComparisonEntry
              key={id}
              index={index}
              range={range}
              mainRequest={mainRequest}
              onUpdate={(entry) => updateComparison(id, entry)}
              onRemove={() => removeComparison(id)}
            />
          ))}
          <Button
            className="add-comparison"
            block
            icon={<PlusOutlined />}
            onClick={addComparison}
            disabled={comparisonIds.length >= 3}
          >
            添加对比曲线
          </Button>
          {saveStatus && (
            <Alert
              type={saveStatus.ok ? 'success' : 'error'}
              title={saveStatus.text}
              showIcon
            />
          )}
        </Card>
        <Card
          title="函数图像"
          extra={
            <Space>
              <Button
                size="small"
                icon={<DownloadOutlined />}
                disabled={plot.status !== 'ready'}
                onClick={exportImage}
              >
                导出图像
              </Button>
              <Tag>数值采样 · 非符号计算</Tag>
            </Space>
          }
        >
          {plot.status === 'loading' && (
            <div className="chart-loading">
              <Spin />
              <p>正在计算采样点…</p>
            </div>
          )}
          {plot.status === 'error' && (
            <Alert
              type="error"
              showIcon
              title="无法绘制"
              description={plot.message}
            />
          )}
          {plot.status === 'ready' && result && summary && (
            <>
              {comparisonCurves.length > 0 && (
                <ul
                  className="chart-legend"
                  aria-label="图例：曲线颜色与表达式"
                >
                  <li>
                    <span
                      className="legend-swatch"
                      style={{ background: MAIN_CURVE_COLOR }}
                    />
                    f(x) = {plot.request.expression}
                  </li>
                  {comparisonCurves.map((curve, index) => (
                    <li key={curve.expression + index}>
                      <span
                        className="legend-swatch"
                        style={{ background: comparisonCurveColor(index) }}
                      />
                      {COMPARISON_LABELS[index] ?? `g${index + 1}`}(x) ={' '}
                      {curve.expression}
                    </li>
                  ))}
                </ul>
              )}
              <FunctionChart
                ref={chartRef}
                points={result.points}
                expression={plot.request.expression}
                gapMarkers={gapMarkers}
                comparisons={comparisonCurves}
              />
              <p className="chart-summary" role="status">
                f(x) = {plot.request.expression} · 区间 [{plot.request.xMin},{' '}
                {plot.request.xMax}] · {result.points.length} 个图像点 ·{' '}
                {result.gaps} 处采样缺口
              </p>
              {comparisonIds.map((id, index) => {
                const entry = comparisonEntries.get(id);
                if (!entry || entry.intersections === null) return null;
                const label = COMPARISON_LABELS[index] ?? `g${index + 1}`;
                const pointsText =
                  entry.intersections.length === 0
                    ? '近似交点：未检测到。'
                    : `近似交点：${entry.intersections
                        .map(
                          (point) =>
                            `x ≈ ${formatNumber(point.x)}，y ≈ ${formatNumber(point.y)}`,
                        )
                        .join('；')}。`;
                return (
                  <p key={id} className="chart-summary" role="status">
                    {label}(x) 与 f(x) 的{pointsText}
                    （数值近似，非符号求解；切触或采样漏过的交点可能漏检。）
                  </p>
                );
              })}
              {exportStatus && (
                <Alert
                  type={exportStatus.ok ? 'success' : 'error'}
                  title={exportStatus.text}
                  showIcon
                />
              )}
              {result.points.every((point) => point[1] === null) && (
                <Alert
                  type="warning"
                  title="该范围内没有可显示的有限实数值，请调整表达式或范围。"
                />
              )}
              <PlotSummaryPanel
                summary={summary}
                totalPoints={result.points.length}
              />
            </>
          )}
        </Card>
      </div>
      <Alert
        className="section-gap"
        type="warning"
        showIcon
        title="观察图像，不等于证明结论"
        description="这里只做有限采样。超出实数定义域、非有限值和绝对值大于 10⁶ 的结果会留空，留空只是采样缺口，不一定是数学间断；自适应探测与二分定位仅能启发式识别部分疑似间断，可能漏检或误判，不保证识别全部间断点或高频变化。"
      />
    </>
  );
}

function PlottingEntry({ search }: { search: URLSearchParams }) {
  const [entry] = useState(() => {
    const stored = preferences.read({ defaultPlot: DEFAULT });
    const linked = parsePlotSearch(search);
    const warning =
      search.has('expression') && !linked
        ? '链接参数无效，已使用默认设置。'
        : undefined;
    return {
      initial: linked ?? (stored.ok ? stored.data.defaultPlot : DEFAULT),
      warning,
      initialStorageError: stored.ok ? undefined : stored.error,
    };
  });
  return <PlottingWorkspace {...entry} />;
}

export default function PlottingPage() {
  const [search] = useSearchParams();
  return (
    <>
      <PageHeader
        eyebrow="FUNCTION LAB"
        title="让抽象的变化，变得看得见。"
        description="输入一个函数，调整观察范围，探索图像背后的数学条件。"
      />
      <PlottingEntry key={search.toString()} search={search} />
    </>
  );
}
