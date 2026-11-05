import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  Alert,
  Button,
  Card,
  Collapse,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Segmented,
  Space,
  Spin,
  Tag,
} from 'antd';
import {
  DownloadOutlined,
  LineChartOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import {
  plotRequestSchema,
  preferencesSchema,
  type HorizontalAsymptoteCandidate,
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
  FunctionChart,
  type FunctionChartHandle,
} from '@/shared/ui/FunctionChart';
import { PageHeader } from '@/shared/ui/PageHeader';
import {
  buildPlotExportName,
  buildSequenceExportName,
  downloadBlob,
  pngDataUrlToBlob,
} from '@/shared/ui/plot-export';
import {
  usePlotCalculation,
  useSequenceCalculation,
} from './usePlotCalculation';
import { plotPresets } from '@/content/plot-presets';
import styles from './PlottingPage.module.css';

type PlotMode = 'function' | 'sequence';

/** 两种模式共用一个表单：函数模式用 xMin/xMax，数列模式用 terms。 */
type WorkspaceFormValues = {
  expression: string;
  xMin?: number;
  xMax?: number;
  terms?: number;
};

const DEFAULT: PlotRequest = { expression: 'x^2', xMin: -5, xMax: 5 };
const preferences = createStorage('preferences', preferencesSchema);

function PlotSummaryPanel({
  summary,
  totalPoints,
  asymptotes,
}: {
  summary: PlotSummary;
  totalPoints: number;
  asymptotes: HorizontalAsymptoteCandidate[];
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
  const asymptoteText =
    asymptotes.length === 0
      ? '未检测到水平渐近趋势候选。'
      : `水平渐近趋势提示：${asymptotes
          .map(
            (candidate) =>
              `${candidate.side === 'left' ? '左侧' : '右侧'}疑似趋于 y ≈ ${formatNumber(candidate.y)}`,
          )
          .join('；')}（数值观察，不构成极限证明）`;
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
        <li>{asymptoteText}</li>
      </ul>
      <p className="chart-summary">
        显示限制：超出定义域、非有限值或 |f(x)| 大于 10⁶
        的点留空。这些采样缺口不代表一定是数学间断；虚线标记的是疑似间断位置
        （启发式检测，可能漏检或误判）。水平渐近趋势提示同样是数值启发式：在观察范围
        外额外探测少量点（不绘制）判断趋势是否延续，可能漏检或误判，不构成极限证明。
        可用键盘在左/右端点调整观察范围，代替鼠标缩放。
      </p>
    </section>
  );
}

function SequenceSummaryPanel({
  result,
  terms,
}: {
  result: PlotResult;
  terms: number;
}) {
  const finiteYs = result.points
    .map((point) => point[1])
    .filter((y): y is number => y !== null);
  const minY = finiteYs.length > 0 ? Math.min(...finiteYs) : null;
  const maxY = finiteYs.length > 0 ? Math.max(...finiteYs) : null;
  const rangeText =
    minY === null || maxY === null
      ? '前若干项中没有可显示的有限实数值。'
      : `前 ${terms} 项中的有限值范围：a_n ≈ ${formatNumber(minY)} 至 ${formatNumber(maxY)}`;
  return (
    <section
      className="plot-summary"
      aria-labelledby="sequence-summary-heading"
    >
      <h3 id="sequence-summary-heading">数列数据摘要</h3>
      <p className="chart-summary">
        键盘与屏幕阅读器可用的文本替代；只观察前若干项的数值，不构成收敛性、
        单调性等数学结论的证明。
      </p>
      <ul>
        <li>
          有效项：{finiteYs.length} 项（共 {terms} 项）
        </li>
        <li>{rangeText}</li>
        <li>
          {result.gaps === 0
            ? '所有项都采样到有限实数值。'
            : `${result.gaps} 项未采样到有限实数值（如超出定义域），散点图中留空；留空不代表该处是数学间断。`}
        </li>
      </ul>
      <p className="chart-summary">
        显示限制：非有限值或 |a_n| 大于 10⁶ 的项留空。散点图只呈现前 {terms}{' '}
        项的数值，观察有限多项不能证明数列收敛、单调或有界。
      </p>
    </section>
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
  const [form] = Form.useForm<WorkspaceFormValues>();
  const { state: plot, draw: drawPlot } = usePlotCalculation(initial);
  const { state: sequence, draw: drawSequence } = useSequenceCalculation();
  const [mode, setMode] = useState<PlotMode>('function');
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
  const result = plot.status === 'ready' ? plot.result : null;
  const summary = useMemo(
    () => (result ? summarizePlot(result.points) : null),
    [result],
  );
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
    if (plotRequestSchema.safeParse(value).success)
      setSourceId(sourceKnowledgeId);
    setExportStatus(null);
    drawPlot({ ...value, sourceKnowledgeId });
  };
  // 模式切换后提交：数列走通项+项数，函数走表达式+区间。
  const onFinish = (values: WorkspaceFormValues) => {
    if (mode === 'sequence') {
      if (typeof values.terms !== 'number') return; // 表单校验已兜底
      setExportStatus(null);
      drawSequence({ expression: values.expression, terms: values.terms });
      return;
    }
    const { expression, xMin, xMax } = values;
    if (typeof xMin !== 'number' || typeof xMax !== 'number') return;
    draw({ expression, xMin, xMax });
  };
  // 导出当前画布为 PNG（ECharts getDataURL），不重新采样、不上传。
  const exportImage = () => {
    let dataUrl: string;
    let filename: string;
    if (mode === 'function') {
      if (plot.status !== 'ready') return;
      dataUrl = chartRef.current?.exportPng() ?? '';
      filename = buildPlotExportName(
        plot.request.expression,
        plot.request.xMin,
        plot.request.xMax,
      );
    } else {
      if (sequence.status !== 'ready') return;
      dataUrl = chartRef.current?.exportPng() ?? '';
      filename = buildSequenceExportName(
        sequence.request.expression,
        sequence.request.terms,
      );
    }
    try {
      if (!dataUrl) {
        setExportStatus({
          ok: false,
          text: `导出失败：图像尚未绘制完成，请先绘制${mode === 'function' ? '函数' : '数列'}。`,
        });
        return;
      }
      const blob = pngDataUrlToBlob(dataUrl);
      if (!blob) {
        setExportStatus({ ok: false, text: '导出失败：画布数据无法解析。' });
        return;
      }
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
  const preset = (value: {
    expression: string;
    xMin: number;
    xMax: number;
  }) => {
    const next = { ...value };
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
      let values: WorkspaceFormValues;
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
      {mode === 'function' && sourceId && (
        <Alert
          type="info"
          showIcon
          title="已接收知识导航中的示例"
          description={`来源卡片：${sourceId}`}
          className="section-gap-bottom"
        />
      )}
      <Segmented
        className="section-gap-bottom"
        options={[
          { label: '函数图像', value: 'function' },
          { label: '数列散点', value: 'sequence' },
        ]}
        value={mode}
        onChange={(value) => {
          setMode(value as PlotMode);
          setExportStatus(null);
        }}
      />
      <div className="plot-layout">
        <Card
          title={mode === 'function' ? '设置函数' : '设置数列'}
          className="plot-settings"
        >
          <Form
            form={form}
            layout="vertical"
            initialValues={initial}
            onFinish={onFinish}
            requiredMark={false}
          >
            <Form.Item
              name="expression"
              label={mode === 'function' ? '函数表达式 f(x)' : '通项表达式 a_n'}
              rules={[
                {
                  required: true,
                  whitespace: true,
                  message:
                    mode === 'function'
                      ? '请输入函数表达式'
                      : '请输入通项表达式',
                },
                { max: 160, message: '最多 160 个字符' },
              ]}
            >
              <Input
                placeholder={
                  mode === 'function' ? '例如 sin(x) + x^2' : '例如 sin(n)/n'
                }
                autoComplete="off"
              />
            </Form.Item>
            {mode === 'function' && (
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
            )}
            {mode === 'sequence' && (
              <Form.Item
                name="terms"
                label="绘制项数"
                initialValue={30}
                rules={[
                  { required: true, type: 'number', message: '请输入项数' },
                ]}
              >
                <InputNumber min={2} max={1000} precision={0} />
              </Form.Item>
            )}
            <Button
              type="primary"
              htmlType="submit"
              icon={<LineChartOutlined />}
              block
              loading={
                mode === 'function'
                  ? plot.status === 'loading'
                  : sequence.status === 'loading'
              }
            >
              {mode === 'function' ? '绘制函数' : '绘制数列'}
            </Button>
          </Form>
          {mode === 'function' && (
            <>
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
                    onClick={() => preset({ expression, xMin: -5, xMax: 5 })}
                  >
                    {expression}
                  </Button>
                ))}
              </Space>
            </>
          )}
          <p className="small-note">
            支持 {mode === 'function' ? 'x' : 'n'}、pi、e，以及 sin / cos / tan
            / asin / acos / atan / abs / sqrt / log / exp。log
            为自然对数。幂指数限数字常量，绝对值不超过 20。
          </p>
          {mode === 'function' && (
            <Collapse
              className="section-gap"
              items={[
                {
                  key: 'presets',
                  label: `经典函数示例（${plotPresets.length} 个）`,
                  children: (
                    <>
                      <ul className={styles.presetList}>
                        {plotPresets.map((item) => (
                          <li key={item.id}>
                            <button
                              type="button"
                              className={styles.presetItem}
                              onClick={() =>
                                preset({
                                  expression: item.expression,
                                  xMin: item.xMin,
                                  xMax: item.xMax,
                                })
                              }
                            >
                              <span className={styles.presetName}>
                                {item.name}
                              </span>
                              <code className={styles.presetExpression}>
                                {item.expression}
                              </code>
                              <span className={styles.presetNote}>
                                {item.note}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                      <p className="small-note">
                        预置示例仅用于观察图像，不构成数学证明；内容需按教材核验。
                      </p>
                    </>
                  ),
                },
              ]}
            />
          )}
          {saveStatus && (
            <Alert
              type={saveStatus.ok ? 'success' : 'error'}
              title={saveStatus.text}
              showIcon
            />
          )}
        </Card>
        <Card
          title={mode === 'function' ? '函数图像' : '数列散点'}
          extra={
            <Space>
              <Button
                size="small"
                icon={<DownloadOutlined />}
                disabled={
                  mode === 'function'
                    ? plot.status !== 'ready'
                    : sequence.status !== 'ready'
                }
                onClick={exportImage}
              >
                导出图像
              </Button>
              <Tag>数值采样 · 非符号计算</Tag>
            </Space>
          }
        >
          {mode === 'function' ? (
            <>
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
                  <FunctionChart
                    ref={chartRef}
                    points={result.points}
                    expression={plot.request.expression}
                    gapMarkers={gapMarkers}
                    horizontalMarkers={result.asymptotes}
                  />
                  <p className="chart-summary" role="status">
                    f(x) = {plot.request.expression} · 区间 [{plot.request.xMin}
                    , {plot.request.xMax}] · {result.points.length} 个图像点 ·{' '}
                    {result.gaps} 处采样缺口
                  </p>
                  {result.points.every((point) => point[1] === null) && (
                    <Alert
                      type="warning"
                      title="该范围内没有可显示的有限实数值，请调整表达式或范围。"
                    />
                  )}
                  <PlotSummaryPanel
                    summary={summary}
                    totalPoints={result.points.length}
                    asymptotes={result.asymptotes ?? []}
                  />
                </>
              )}
            </>
          ) : (
            <>
              {sequence.status === 'idle' && (
                <p className="chart-summary">
                  输入通项表达式与项数，点击“绘制数列”后显示前若干项的散点。
                </p>
              )}
              {sequence.status === 'loading' && (
                <div className="chart-loading">
                  <Spin />
                  <p>正在计算前若干项…</p>
                </div>
              )}
              {sequence.status === 'error' && (
                <Alert
                  type="error"
                  showIcon
                  title="无法绘制"
                  description={sequence.message}
                />
              )}
              {sequence.status === 'ready' && (
                <>
                  <FunctionChart
                    ref={chartRef}
                    points={sequence.result.points}
                    expression={sequence.request.expression}
                    variant="sequence"
                  />
                  <p className="chart-summary" role="status">
                    a_n = {sequence.request.expression} · 前{' '}
                    {sequence.request.terms} 项 · {sequence.result.gaps}{' '}
                    项无定义（留空）
                  </p>
                  {sequence.result.points.every(
                    (point) => point[1] === null,
                  ) && (
                    <Alert
                      type="warning"
                      title="前若干项中没有可显示的有限实数值，请调整通项表达式。"
                    />
                  )}
                  <SequenceSummaryPanel
                    result={sequence.result}
                    terms={sequence.request.terms}
                  />
                </>
              )}
            </>
          )}
          {(mode === 'function'
            ? plot.status === 'ready'
            : sequence.status === 'ready') &&
            exportStatus && (
              <Alert
                type={exportStatus.ok ? 'success' : 'error'}
                title={exportStatus.text}
                showIcon
              />
            )}
        </Card>
      </div>
      <Alert
        className="section-gap"
        type="warning"
        showIcon
        title="观察图像，不等于证明结论"
        description={
          mode === 'function'
            ? '这里只做有限采样。超出实数定义域、非有限值和绝对值大于 10⁶ 的结果会留空，留空只是采样缺口，不一定是数学间断；自适应探测与二分定位仅能启发式识别部分疑似间断，可能漏检或误判，不保证识别全部间断点或高频变化。水平渐近趋势提示同样是数值启发式（含观察范围外的少量探测点），可能漏检或误判，不构成极限证明。'
            : '这里只对前若干项做数值采样。无定义或非有限的项会留空，留空只是采样缺口，不一定是数学间断；观察前若干项的散点不能证明数列收敛、单调或有界，也不能代替极限计算。'
        }
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
