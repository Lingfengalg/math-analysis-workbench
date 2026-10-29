import { useEffect, useMemo, useRef, useState } from 'react';
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
import { LineChartOutlined, SaveOutlined } from '@ant-design/icons';
import {
  plotRequestSchema,
  preferencesSchema,
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
import { FunctionChart } from '@/shared/ui/FunctionChart';
import { PageHeader } from '@/shared/ui/PageHeader';

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
      ? '未检测到间断或缺口。'
      : `检测到 ${gapRanges.length} 处缺口位置：${gapRanges
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
        的点留空；虚线为启发式检测的间断位置，可能漏检或误判。
        可用键盘在左/右端点调整观察范围，代替鼠标缩放。
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
  const [form] = Form.useForm<PlotRequest>();
  const [request, setRequest] = useState(initial);
  const [result, setResult] = useState<PlotResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [storageError, setStorageError] = useState(initialStorageError);
  const saveController = useRef<AbortController | null>(null);
  const [saveStatus, setSaveStatus] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    calculatePlot(request, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setResult(data);
          setLoading(false);
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : '计算失败');
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [request]);
  const summary = useMemo(
    () => (result ? summarizePlot(result.points) : null),
    [result],
  );
  // Only isolated gap points (poles, jumps) get a dashed marker; merged
  // domain-hole ranges stay unmarked. Cap keeps dense cases readable.
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
    const valid = plotRequestSchema.safeParse(value);
    if (!valid.success) {
      setError(valid.error.issues[0].message);
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    setRequest({ ...valid.data, sourceKnowledgeId: initial.sourceKnowledgeId });
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
          description={`${storageError} 原始数据未被覆盖。请先备份；确认不再需要后可清除。`}
          action={
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
          }
        />
      )}
      {initial.sourceKnowledgeId && (
        <Alert
          type="info"
          showIcon
          title="已接收知识导航中的示例"
          description={`来源卡片：${initial.sourceKnowledgeId}`}
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
              loading={loading}
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
          {saveStatus && (
            <Alert
              type={saveStatus.ok ? 'success' : 'error'}
              title={saveStatus.text}
              showIcon
            />
          )}
        </Card>
        <Card title="函数图像" extra={<Tag>数值采样 · 非符号计算</Tag>}>
          {loading && (
            <div className="chart-loading">
              <Spin />
              <p>正在计算采样点…</p>
            </div>
          )}
          {error && (
            <Alert type="error" showIcon title="无法绘制" description={error} />
          )}
          {!loading && result && summary && (
            <>
              <FunctionChart
                points={result.points}
                expression={request.expression}
                gapMarkers={gapMarkers}
              />
              <p className="chart-summary" role="status">
                f(x) = {request.expression} · 区间 [{request.xMin},{' '}
                {request.xMax}] · {result.points.length} 个图像点 ·{' '}
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
        description="这里只做有限采样。超出实数定义域、非有限值和绝对值大于 10⁶ 的结果会留空；自适应探测与二分定位仅能启发式识别部分间断，可能漏检或误判，不保证识别全部间断点或高频变化。"
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
