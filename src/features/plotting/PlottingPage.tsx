import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
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
import { FunctionChart } from '@/shared/ui/FunctionChart';
import { PageHeader } from '@/shared/ui/PageHeader';

const DEFAULT: PlotRequest = { expression: 'x^2', xMin: -5, xMax: 5 };
const preferences = createStorage('preferences', preferencesSchema);

function PlottingWorkspace({
  initial,
  warning,
}: {
  initial: PlotRequest;
  warning?: string;
}) {
  const [form] = Form.useForm<PlotRequest>();
  const [request, setRequest] = useState(initial);
  const [result, setResult] = useState<PlotResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
    try {
      const values = await form.validateFields();
      const result = preferences.write({ defaultPlot: values });
      setSaveStatus({
        ok: result.ok,
        text: result.ok
          ? '已保存到当前浏览器，下次访问绘图模块时生效。'
          : result.error,
      });
    } catch {
      /* Form fields show validation errors. */
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
          {!loading && result && (
            <>
              <FunctionChart
                points={result.points}
                expression={request.expression}
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
            </>
          )}
        </Card>
      </div>
      <Alert
        className="section-gap"
        type="warning"
        showIcon
        title="观察图像，不等于证明结论"
        description="这里只做有限采样。超出实数定义域、非有限值和绝对值大于 10⁶ 的结果会留空；中点检查仅能启发式识别部分间断，可能漏检或误判，不保证识别全部间断点或高频变化。"
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
        : !stored.ok
          ? stored.error
          : undefined;
    return {
      initial: linked ?? (stored.ok ? stored.data.defaultPlot : DEFAULT),
      warning,
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
