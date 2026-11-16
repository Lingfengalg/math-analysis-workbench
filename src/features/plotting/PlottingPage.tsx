import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Space,
  Spin,
  Switch,
  Tag,
} from 'antd';
import {
  ArrowLeftOutlined,
  BookOutlined,
  LineChartOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { knowledgeCards } from '@/content/knowledge';
import {
  plotRequestSchema,
  preferencesSchema,
  type PlotRequest,
  type PlotResult,
  type Preferences,
} from '@/shared/contracts';
import { createKnowledgeLink } from '@/shared/navigation/knowledge-link';
import { createMistakeDraftLink } from '@/shared/navigation/mistake-link';
import { parsePlotSearch } from '@/shared/navigation/plot-link';
import { createStorage, type StorageResult } from '@/shared/storage';
import { calculatePlot } from '@/shared/math/client';
import { FunctionChart } from '@/shared/ui/FunctionChart';
import { PageHeader } from '@/shared/ui/PageHeader';
import styles from './PlottingPage.module.css';

const DEFAULT: PlotRequest = { expression: 'x^2', xMin: -5, xMax: 5 };
const QUICK_PRESETS = ['x^2', 'abs(x)', '1/x', 'sin(x)'] as const;
const QUICK_STEPS = [-0.5, -0.1, -0.01, 0.01, 0.1, 0.5] as const;

const LAB_PRESETS: ReadonlyArray<{ label: string; request: PlotRequest }> = [
  {
    label: '尖点 x^(2/3)',
    request: {
      expression: 'x^(2/3)',
      xMin: -3,
      xMax: 3,
      secant: { x0: 0, h: 0.2 },
    },
  },
  {
    label: '夹逼 x·sin(1/x)',
    request: {
      expression: 'x * sin(1/x)',
      compareExpression: 'abs(x)',
      xMin: -1,
      xMax: 1,
      yMin: -1.2,
      yMax: 1.2,
    },
  },
  {
    label: '泰勒逼近 sin(x)',
    request: {
      expression: 'sin(x)',
      compareExpression: 'x - x^3/6',
      xMin: -4,
      xMax: 4,
      yMin: -2,
      yMax: 2,
    },
  },
  {
    label: '可去间断 sin(x)/x',
    request: {
      expression: 'sin(x)/x',
      xMin: -10,
      xMax: 10,
      yMin: -0.5,
      yMax: 1.5,
    },
  },
  {
    label: '跳跃间断 sign(x)',
    request: {
      expression: 'sign(x)',
      xMin: -4,
      xMax: 4,
      yMin: -2,
      yMax: 2,
    },
  },
];

const preferences = createStorage('preferences', preferencesSchema);

interface PlotFormValues {
  expression: string;
  compareExpression?: string;
  xMin: number;
  xMax: number;
  yMin?: number;
  yMax?: number;
  secantX0?: number;
  secantH?: number;
}

interface ActiveWorkspaceState {
  baseSearchKey: string;
  seq: number;
  request: PlotRequest;
  yClampEnabled: boolean;
  secantEnabled: boolean;
}

type CalcState =
  | { requestKey: string; status: 'done'; result: PlotResult }
  | { requestKey: string; status: 'error'; error: string };

function toFormValues(request: PlotRequest): PlotFormValues {
  return {
    expression: request.expression,
    compareExpression: request.compareExpression ?? '',
    xMin: request.xMin,
    xMax: request.xMax,
    yMin: request.yMin ?? -10,
    yMax: request.yMax ?? 10,
    secantX0: request.secant?.x0 ?? 0,
    secantH: request.secant?.h ?? 0.5,
  };
}

function buildPayload(
  values: Partial<PlotFormValues>,
  options: {
    yClampEnabled: boolean;
    secantEnabled: boolean;
    sourceKnowledgeId?: string;
    sourceMistakeId?: string;
  },
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    expression: values.expression?.trim() ?? '',
    xMin: values.xMin,
    xMax: values.xMax,
  };
  const compare = values.compareExpression?.trim();
  if (compare) {
    payload.compareExpression = compare;
  }
  if (options.yClampEnabled) {
    payload.yMin = values.yMin ?? -10;
    payload.yMax = values.yMax ?? 10;
  }
  if (options.secantEnabled) {
    payload.secant = {
      x0: values.secantX0 ?? 0,
      h: values.secantH ?? 0.5,
    };
  }
  if (options.sourceKnowledgeId) {
    payload.sourceKnowledgeId = options.sourceKnowledgeId;
  }
  if (options.sourceMistakeId) {
    payload.sourceMistakeId = options.sourceMistakeId;
  }
  return payload;
}

function resolveEnvState(
  searchKey: string,
  stored: StorageResult<Preferences>,
): {
  state: ActiveWorkspaceState;
  warning?: string;
} {
  const params = new URLSearchParams(searchKey);
  const linked = parsePlotSearch(params);
  const warning =
    params.has('expression') && !linked
      ? '链接参数无效，已使用默认设置。'
      : !stored.ok
        ? stored.error
        : undefined;
  const initial = linked ?? (stored.ok ? stored.data.defaultPlot : DEFAULT);
  return {
    state: {
      baseSearchKey: searchKey,
      seq: 0,
      request: initial,
      yClampEnabled: initial.yMin !== undefined || initial.yMax !== undefined,
      secantEnabled: initial.secant !== undefined,
    },
    warning,
  };
}

function getSafeKnowledgeLink(cardId: string): string {
  try {
    return createKnowledgeLink({ cardId });
  } catch {
    return createKnowledgeLink();
  }
}

function getSafeMistakeDraftLink(request: PlotRequest): string {
  const validCardId =
    request.sourceKnowledgeId &&
    /^[a-z][a-z0-9-]*$/.test(request.sourceKnowledgeId)
      ? request.sourceKnowledgeId
      : undefined;
  const matchedCard = validCardId
    ? knowledgeCards.find((card) => card.id === validCardId)
    : undefined;
  try {
    return createMistakeDraftLink({
      topic: matchedCard?.topic,
      expression: request.expression,
      xMin: request.xMin,
      xMax: request.xMax,
      relatedKnowledgeId: validCardId,
    });
  } catch {
    return '/mistakes?draft=1';
  }
}

function formatMetric(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '无定义 / 超界';
  }
  const rounded = Number(value.toFixed(6));
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

export default function PlottingPage() {
  const [search, setSearch] = useSearchParams();
  const searchKey = search.toString();

  const [stored] = useState(() => preferences.read({ defaultPlot: DEFAULT }));
  const envResolved = useMemo(
    () => resolveEnvState(searchKey, stored),
    [searchKey, stored],
  );

  const [userState, setUserState] = useState<ActiveWorkspaceState | null>(null);
  const [validationError, setValidationError] = useState('');
  const [calcState, setCalcState] = useState<CalcState | null>(null);
  const [saveStatus, setSaveStatus] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const active =
    userState && userState.baseSearchKey === searchKey
      ? userState
      : envResolved.state;
  const activeRequest = active.request;
  const requestKey = `${active.seq}:${JSON.stringify(activeRequest)}`;

  const [form] = Form.useForm<PlotFormValues>();

  useEffect(() => {
    if (!searchKey) return;
    const linked = parsePlotSearch(new URLSearchParams(searchKey));
    if (linked) {
      form.setFieldsValue(toFormValues(linked));
    }
  }, [searchKey, form]);

  useEffect(() => {
    const controller = new AbortController();
    calculatePlot(activeRequest, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setCalcState({ requestKey, status: 'done', result: data });
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setCalcState({
            requestKey,
            status: 'error',
            error: cause instanceof Error ? cause.message : '计算失败',
          });
        }
      });
    return () => controller.abort();
  }, [activeRequest, requestKey]);

  const clearExternalSearchIfPresent = (): string => {
    if (search.has('expression') || searchKey.length > 0) {
      setSearch({}, { replace: true });
      return '';
    }
    return searchKey;
  };

  const handleFinish = (values: PlotFormValues) => {
    setSaveStatus(null);
    const payload = buildPayload(values, {
      yClampEnabled: active.yClampEnabled,
      secantEnabled: active.secantEnabled,
    });
    const valid = plotRequestSchema.safeParse(payload);
    if (!valid.success) {
      setValidationError(valid.error.issues[0].message);
      return;
    }
    const nextSearchKey = clearExternalSearchIfPresent();
    setValidationError('');
    setUserState({
      baseSearchKey: nextSearchKey,
      seq: active.seq + 1,
      request: valid.data,
      yClampEnabled: active.yClampEnabled,
      secantEnabled: active.secantEnabled,
    });
  };

  const applyPreset = (presetRequest: PlotRequest) => {
    setSaveStatus(null);
    const nextYClamp =
      presetRequest.yMin !== undefined || presetRequest.yMax !== undefined;
    const nextSecant = presetRequest.secant !== undefined;
    form.setFieldsValue(toFormValues(presetRequest));
    const valid = plotRequestSchema.safeParse(presetRequest);
    if (!valid.success) {
      setValidationError(valid.error.issues[0].message);
      return;
    }
    const nextSearchKey = clearExternalSearchIfPresent();
    setValidationError('');
    setUserState({
      baseSearchKey: nextSearchKey,
      seq: active.seq + 1,
      request: valid.data,
      yClampEnabled: nextYClamp,
      secantEnabled: nextSecant,
    });
  };

  const handleToggleYClamp = (checked: boolean) => {
    const current = {
      ...toFormValues(activeRequest),
      ...(form.getFieldsValue(true) as Partial<PlotFormValues>),
    };
    const nextYMin = current.yMin ?? activeRequest.yMin ?? -10;
    const nextYMax = current.yMax ?? activeRequest.yMax ?? 10;
    if (checked) {
      form.setFieldsValue({ yMin: nextYMin, yMax: nextYMax });
    }
    const candidate = buildPayload(
      { ...current, yMin: nextYMin, yMax: nextYMax },
      {
        yClampEnabled: checked,
        secantEnabled: active.secantEnabled,
        sourceKnowledgeId: activeRequest.sourceKnowledgeId,
        sourceMistakeId: activeRequest.sourceMistakeId,
      },
    );
    const parsed = plotRequestSchema.safeParse(candidate);
    setValidationError('');
    setUserState({
      baseSearchKey: searchKey,
      seq: active.seq + 1,
      request: parsed.success
        ? parsed.data
        : {
            ...activeRequest,
            yMin: checked ? -10 : undefined,
            yMax: checked ? 10 : undefined,
          },
      yClampEnabled: checked,
      secantEnabled: active.secantEnabled,
    });
  };

  const handleToggleSecant = (checked: boolean) => {
    const current = {
      ...toFormValues(activeRequest),
      ...(form.getFieldsValue(true) as Partial<PlotFormValues>),
    };
    const nextX0 = current.secantX0 ?? activeRequest.secant?.x0 ?? 0;
    const nextH =
      current.secantH && Math.abs(current.secantH) >= 1e-8
        ? current.secantH
        : (activeRequest.secant?.h ?? 0.5);
    if (checked) {
      form.setFieldsValue({ secantX0: nextX0, secantH: nextH });
    }
    const candidate = buildPayload(
      { ...current, secantX0: nextX0, secantH: nextH },
      {
        yClampEnabled: active.yClampEnabled,
        secantEnabled: checked,
        sourceKnowledgeId: activeRequest.sourceKnowledgeId,
        sourceMistakeId: activeRequest.sourceMistakeId,
      },
    );
    const parsed = plotRequestSchema.safeParse(candidate);
    setValidationError('');
    setUserState({
      baseSearchKey: searchKey,
      seq: active.seq + 1,
      request: parsed.success
        ? parsed.data
        : {
            ...activeRequest,
            secant: checked ? { x0: 0, h: 0.5 } : undefined,
          },
      yClampEnabled: active.yClampEnabled,
      secantEnabled: checked,
    });
  };

  const handleQuickStep = (stepH: number) => {
    const current = {
      ...toFormValues(activeRequest),
      ...(form.getFieldsValue(true) as Partial<PlotFormValues>),
    };
    const nextX0 = current.secantX0 ?? activeRequest.secant?.x0 ?? 0;
    form.setFieldsValue({ secantX0: nextX0, secantH: stepH });
    const candidate = buildPayload(
      { ...current, secantX0: nextX0, secantH: stepH },
      {
        yClampEnabled: active.yClampEnabled,
        secantEnabled: true,
        sourceKnowledgeId: activeRequest.sourceKnowledgeId,
        sourceMistakeId: activeRequest.sourceMistakeId,
      },
    );
    const parsed = plotRequestSchema.safeParse(candidate);
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0].message);
      return;
    }
    setValidationError('');
    setUserState({
      baseSearchKey: searchKey,
      seq: active.seq + 1,
      request: parsed.data,
      yClampEnabled: active.yClampEnabled,
      secantEnabled: true,
    });
  };

  const handleSaveDefault = async () => {
    try {
      const values = await form.validateFields();
      const payload = buildPayload(values, {
        yClampEnabled: active.yClampEnabled,
        secantEnabled: active.secantEnabled,
      });
      const valid = plotRequestSchema.safeParse(payload);
      if (!valid.success) {
        const message = valid.error.issues[0].message;
        setValidationError(message);
        setSaveStatus({ ok: false, text: message });
        return;
      }
      const writeResult = preferences.write({ defaultPlot: valid.data });
      const nextSearchKey = clearExternalSearchIfPresent();
      if (writeResult.ok) {
        setValidationError('');
        setUserState({
          baseSearchKey: nextSearchKey,
          seq: active.seq,
          request: valid.data,
          yClampEnabled: active.yClampEnabled,
          secantEnabled: active.secantEnabled,
        });
      }
      setSaveStatus({
        ok: writeResult.ok,
        text: writeResult.ok
          ? '已保存到当前浏览器，下次访问绘图模块时生效。'
          : writeResult.error,
      });
    } catch {
      /* Form fields show validation errors. */
    }
  };

  const isSettled = calcState?.requestKey === requestKey;
  const loading = !validationError && !isSettled;
  const result =
    !validationError && isSettled && calcState.status === 'done'
      ? calcState.result
      : null;
  const error =
    validationError ||
    (isSettled && calcState.status === 'error' ? calcState.error : '');

  const sourceCard = activeRequest.sourceKnowledgeId
    ? knowledgeCards.find((card) => card.id === activeRequest.sourceKnowledgeId)
    : undefined;

  const yDomain: [number | undefined, number | undefined] | undefined =
    activeRequest.yMin !== undefined || activeRequest.yMax !== undefined
      ? [activeRequest.yMin, activeRequest.yMax]
      : undefined;

  const secantResult = result?.secantLine;
  const hasSlopeMismatch =
    secantResult !== undefined &&
    secantResult.leftSlope !== null &&
    secantResult.rightSlope !== null &&
    Math.abs(secantResult.leftSlope - secantResult.rightSlope) > 0.25;

  return (
    <>
      <PageHeader
        eyebrow="FUNCTION LAB"
        title="让抽象的变化，变得看得见。"
        description="输入主函数与对比函数，借助纵轴保护与割线差商实验探索极限、连续与可导条件。"
      />

      {envResolved.warning && (
        <Alert
          type="warning"
          showIcon
          title={envResolved.warning}
          className={styles.alertGap}
        />
      )}

      {activeRequest.sourceKnowledgeId && (
        <Alert
          type="info"
          showIcon
          title="已接收知识导航中的示例"
          description={
            <div className={styles.bannerRow}>
              <span>
                来源卡片：
                {sourceCard
                  ? sourceCard.title
                  : activeRequest.sourceKnowledgeId}
              </span>
              <Link
                className={styles.bannerLink}
                to={getSafeKnowledgeLink(activeRequest.sourceKnowledgeId)}
              >
                <ArrowLeftOutlined /> 返回知识卡片
              </Link>
            </div>
          }
          className={styles.alertGap}
        />
      )}

      {activeRequest.sourceMistakeId && (
        <Alert
          type="info"
          showIcon
          title="已接收错题本中的反例函数"
          description={
            <div className={styles.bannerRow}>
              <span>来源错题：{activeRequest.sourceMistakeId}</span>
              <Link className={styles.bannerLink} to="/mistakes">
                <ArrowLeftOutlined /> 返回错题本
              </Link>
            </div>
          }
          className={styles.alertGap}
        />
      )}

      <div className={styles.plotLayout}>
        <Card title="设置函数">
          <Form
            form={form}
            layout="vertical"
            initialValues={toFormValues(activeRequest)}
            onFinish={handleFinish}
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

            <Form.Item
              name="compareExpression"
              label="对比函数 g(x)（可选）"
              rules={[{ max: 160, message: '对比表达式最多 160 个字符' }]}
            >
              <Input
                placeholder="例如 x - x^3/6 或 abs(x)"
                autoComplete="off"
                allowClear
              />
            </Form.Item>

            <div className={styles.rangeFields}>
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

            <div className={styles.optionPanel}>
              <div className={styles.optionHeader}>
                <label htmlFor="y-clamp-switch" className={styles.optionLabel}>
                  限制纵轴范围（防奇点压扁）
                </label>
                <Switch
                  id="y-clamp-switch"
                  size="small"
                  checked={active.yClampEnabled}
                  onChange={handleToggleYClamp}
                />
              </div>
              <p className={styles.optionHint}>
                观察 1/x、tan(x)
                等含渐近线函数时固定纵轴视窗，避免局部细节被压成直线。
              </p>
              {active.yClampEnabled && (
                <div className={styles.optionBody}>
                  <div className={styles.rangeFields}>
                    <Form.Item
                      name="yMin"
                      label="纵轴下界"
                      className={styles.compactItem}
                      rules={[
                        {
                          required: true,
                          type: 'number',
                          message: '请输入纵轴下界',
                        },
                      ]}
                    >
                      <InputNumber min={-1000000} max={1000000} />
                    </Form.Item>
                    <Form.Item
                      name="yMax"
                      label="纵轴上界"
                      className={styles.compactItem}
                      rules={[
                        {
                          required: true,
                          type: 'number',
                          message: '请输入纵轴上界',
                        },
                      ]}
                    >
                      <InputNumber min={-1000000} max={1000000} />
                    </Form.Item>
                  </div>
                </div>
              )}
            </div>

            <div className={styles.optionPanel}>
              <div className={styles.optionHeader}>
                <label htmlFor="secant-switch" className={styles.optionLabel}>
                  差商与割线观察
                </label>
                <Switch
                  id="secant-switch"
                  size="small"
                  checked={active.secantEnabled}
                  onChange={handleToggleSecant}
                />
              </div>
              <p className={styles.optionHint}>
                计算观察点 x₀
                处的割线与对称左右差商，直观检验可导与尖点、折点现象。
              </p>
              {active.secantEnabled && (
                <div className={styles.optionBody}>
                  <div className={styles.rangeFields}>
                    <Form.Item
                      name="secantX0"
                      label="观察点 x₀"
                      className={styles.compactItem}
                      rules={[
                        {
                          required: true,
                          type: 'number',
                          message: '请输入观察点 x₀',
                        },
                      ]}
                    >
                      <InputNumber min={-10000} max={10000} step={0.1} />
                    </Form.Item>
                    <Form.Item
                      name="secantH"
                      label="步长 h"
                      className={styles.compactItem}
                      rules={[
                        {
                          required: true,
                          type: 'number',
                          message: '请输入步长 h',
                        },
                      ]}
                    >
                      <InputNumber min={-1000} max={1000} step={0.05} />
                    </Form.Item>
                  </div>
                  <div className={styles.quickStepBar}>
                    <span className={styles.quickStepLabel}>
                      快捷逼近步长 h（0⁻ / 0⁺）：
                    </span>
                    <Space size={[6, 6]} wrap>
                      {QUICK_STEPS.map((stepVal) => (
                        <Button
                          key={stepVal}
                          size="small"
                          type={
                            activeRequest.secant?.h === stepVal
                              ? 'primary'
                              : 'default'
                          }
                          onClick={() => handleQuickStep(stepVal)}
                        >
                          {String(stepVal)}
                        </Button>
                      ))}
                    </Space>
                  </div>
                </div>
              )}
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
            className={styles.secondaryAction}
            icon={<SaveOutlined />}
            onClick={() => void handleSaveDefault()}
            block
          >
            保存默认设置
          </Button>

          <h3 className={styles.presetHeading}>快速尝试</h3>
          <Space wrap>
            {QUICK_PRESETS.map((expression) => (
              <Button
                key={expression}
                size="small"
                onClick={() => applyPreset({ expression, xMin: -5, xMax: 5 })}
              >
                {expression}
              </Button>
            ))}
          </Space>

          <h3 className={styles.presetHeading}>数分实验预设</h3>
          <p className={styles.presetSubnote}>
            一键加载典型极限、间断、夹逼与不可导反例实验配置：
          </p>
          <Space size={[6, 8]} wrap>
            {LAB_PRESETS.map((preset) => (
              <Button
                key={preset.label}
                size="small"
                onClick={() => applyPreset(preset.request)}
              >
                {preset.label}
              </Button>
            ))}
          </Space>

          <p className={styles.smallNote}>
            支持变量与常量 x、pi、e，以及 sin / cos / tan / asin / acos / atan /
            sinh / cosh / tanh / abs / sqrt / cbrt / sign / floor / ceil / exp /
            log / ln / lg（log 与 ln 为自然对数，lg 为以 10
            为底常用对数）。支持常数幂与有理分数指数如
            x^(1/3)、x^(2/3)（绝对值不超过 20）。
          </p>

          {saveStatus && (
            <Alert
              className={styles.saveAlert}
              type={saveStatus.ok ? 'success' : 'error'}
              title={saveStatus.text}
              showIcon
            />
          )}
        </Card>

        <Card
          title="函数图像"
          extra={
            <div className={styles.chartExtra}>
              <Tag>数值采样 · 非符号计算</Tag>
              <Link
                className={styles.mistakeLink}
                to={getSafeMistakeDraftLink(activeRequest)}
              >
                <BookOutlined /> 记入错题本
              </Link>
            </div>
          }
        >
          {loading && (
            <div className={styles.chartLoading}>
              <Spin />
              <p>正在计算采样点…</p>
            </div>
          )}

          {error && (
            <Alert
              className={styles.errorAlert}
              type="error"
              showIcon
              title="无法绘制"
              description={error}
            />
          )}

          {!loading && result && (
            <>
              <FunctionChart
                points={result.points}
                expression={activeRequest.expression}
                comparePoints={result.comparePoints}
                compareExpression={activeRequest.compareExpression}
                secantLine={result.secantLine}
                yDomain={yDomain}
              />
              <p className={styles.chartSummary} role="status">
                f(x) = {activeRequest.expression}
                {activeRequest.compareExpression
                  ? ` · 对比 g(x) = ${activeRequest.compareExpression}`
                  : ''}
                {' · '}区间 [{activeRequest.xMin}, {activeRequest.xMax}]
                {activeRequest.yMin !== undefined &&
                activeRequest.yMax !== undefined
                  ? ` · 纵轴 [${activeRequest.yMin}, ${activeRequest.yMax}]`
                  : ''}
                {' · '}
                {result.points.length} 个图像点 · {result.gaps} 处采样缺口
              </p>

              {result.points.every((point) => point[1] === null) && (
                <Alert
                  className={styles.secantAlert}
                  type="warning"
                  showIcon
                  title="该范围内没有可显示的有限实数值，请调整表达式或范围。"
                />
              )}

              {secantResult && activeRequest.secant && (
                <div
                  className={styles.secantCard}
                  aria-label="差商与割线数值观察"
                >
                  <div className={styles.secantTitleRow}>
                    <h3 className={styles.secantTitle}>
                      差商与割线数值观察（x₀ = {formatMetric(secantResult.x0)}
                      ，h = {formatMetric(activeRequest.secant.h)}）
                    </h3>
                    <span className={styles.secantFormulaHint}>
                      割线斜率 = [f(x₀ + h) - f(x₀)] / h
                    </span>
                  </div>
                  <div className={styles.secantMetrics}>
                    <div className={styles.metricItem}>
                      <span className={styles.metricLabel}>
                        基准点函数值 f(x₀)
                      </span>
                      <span className={styles.metricValue}>
                        {formatMetric(secantResult.y0)}
                      </span>
                      <span className={styles.metricSub}>
                        x₀ = {formatMetric(secantResult.x0)}
                      </span>
                    </div>
                    <div className={styles.metricItem}>
                      <span className={styles.metricLabel}>
                        邻近点函数值 f(x₀ + h)
                      </span>
                      <span className={styles.metricValue}>
                        {formatMetric(secantResult.y1)}
                      </span>
                      <span className={styles.metricSub}>
                        x₀ + h = {formatMetric(secantResult.x1)}
                      </span>
                    </div>
                    <div className={styles.metricItem}>
                      <span className={styles.metricLabel}>当前割线斜率</span>
                      <span className={styles.metricValue}>
                        {formatMetric(secantResult.slope)}
                      </span>
                      <span className={styles.metricSub}>
                        步长 h = {formatMetric(activeRequest.secant.h)}
                      </span>
                    </div>
                    <div className={styles.metricItem}>
                      <span className={styles.metricLabel}>
                        对称左右差商（-|h| / +|h|）
                      </span>
                      <span className={styles.metricValue}>
                        左 {formatMetric(secantResult.leftSlope)} / 右{' '}
                        {formatMetric(secantResult.rightSlope)}
                      </span>
                      <span className={styles.metricSub}>
                        |h| = {formatMetric(Math.abs(activeRequest.secant.h))}
                      </span>
                    </div>
                  </div>
                  {hasSlopeMismatch && (
                    <Alert
                      className={styles.secantAlert}
                      type="warning"
                      showIcon
                      title="左右差商不一致，提示该点可能不可导，请用导数定义严格论证"
                      description={`当前对称左差商为 ${formatMetric(secantResult.leftSlope)}，右差商为 ${formatMetric(secantResult.rightSlope)}。有限步长数值仅提供直观线索，请结合左导数与右导数的极限定义进一步验证。`}
                    />
                  )}
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      <Alert
        className={styles.footerNotice}
        type="warning"
        showIcon
        title="观察图像，不等于证明结论"
        description="这里只做有限采样。超出实数定义域、非有限值和绝对值大于 10⁶ 的结果会留空；中点检查仅能启发式识别部分间断，可能漏检或误判，不保证识别全部间断点或高频变化。"
      />
    </>
  );
}
