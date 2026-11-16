import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Segmented,
  Space,
  Spin,
  Switch,
  Tag,
} from 'antd';
import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  BookOutlined,
  LineChartOutlined,
  SaveOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { knowledgeCards } from '@/content/knowledge';
import {
  INTEGRAL_REGION_LABELS,
  RIEMANN_RULE_LABELS,
  plotRequestSchema,
  preferencesSchema,
  surfacePlotRequestSchema,
  type IntegralRegionType,
  type PlotRequest,
  type PlotResult,
  type Preferences,
  type RiemannRule,
  type SurfacePlotRequest,
  type SurfacePlotResult,
} from '@/shared/contracts';
import { createKnowledgeLink } from '@/shared/navigation/knowledge-link';
import { createMistakeDraftLink } from '@/shared/navigation/mistake-link';
import {
  parsePlotSearch,
  parseSurfacePlotSearch,
} from '@/shared/navigation/plot-link';
import { createStorage, type StorageResult } from '@/shared/storage';
import { calculatePlot, calculateSurface } from '@/shared/math/client';
import { FunctionChart } from '@/shared/ui/FunctionChart';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Surface3DViewer } from '@/shared/ui/Surface3DViewer';
import styles from './PlottingPage.module.css';

type LabMode = '3d' | '1d';

const DEFAULT_1D: PlotRequest = { expression: 'x^2', xMin: -5, xMax: 5 };

const DEFAULT_SURFACE: SurfacePlotRequest = {
  expression: '2 - 0.25 * (x^2 + y^2)',
  xMin: -2,
  xMax: 2,
  yDomainMin: -2,
  yDomainMax: 2,
  gridSize: 56,
  integral: {
    regionType: 'rectangle',
    xStart: -2,
    xEnd: 2,
    yStart: -2,
    yEnd: 2,
    partitions: 14,
    rule: 'midpoint',
  },
};

const GRID_PRECISION_OPTIONS = [
  { label: '标准 48×48', value: 48 },
  { label: '精细 64×64', value: 64 },
  { label: '超清 84×84', value: 84 },
] as const;

const QUICK_PARTITIONS = [6, 12, 20, 32] as const;

const QUICK_PROBE_POINTS = [
  { label: '驻点 (0, 0)', x0: 0, y0: 0 },
  { label: '对比点 (1, -1)', x0: 1, y0: -1 },
] as const;

const REGION_INEQUALITY_NOTES: Record<IntegralRegionType, string> = {
  rectangle:
    '区域不等式 D：a ≤ x ≤ b，c ≤ y ≤ d（直角坐标常数上下限累次积分 ∫_a^b dx ∫_c^d f(x, y) dy）',
  disk: '圆/椭圆域不等式 D：(x - x_c)² / r_x² + (y - y_c)² / r_y² ≤ 1（宜用极坐标变换 dx dy = r dr dθ，切勿漏乘雅可比因子 r）',
  triangle:
    '三角形域不等式 D：a ≤ x ≤ b，c ≤ y ≤ c + k(x - a)，其中 k = (d - c)/(b - a)（先 y 后 x 穿线法变上限累次积分）',
  'x-type':
    '一般 X-型曲边域 D：a ≤ x ≤ b，φ₁(x) ≤ y ≤ φ₂(x)（先对 y 积分再对 x 积分：∫_a^b dx ∫_{φ₁(x)}^{φ₂(x)} f(x, y) dy）',
  'y-type':
    '一般 Y-型曲边域 D：c ≤ y ≤ d，ψ₁(y) ≤ x ≤ ψ₂(y)（交换积分次序：先对 x 积分再对 y 积分：∫_c^d dy ∫_{ψ₁(y)}^{ψ₂(y)} f(x, y) dx）',
};

const SURFACE_PRESETS: ReadonlyArray<{
  label: string;
  request: SurfacePlotRequest;
}> = [
  {
    label: '曲顶柱体 · 二重积分',
    request: {
      expression: '2 - 0.25 * (x^2 + y^2)',
      xMin: -2,
      xMax: 2,
      yDomainMin: -2,
      yDomainMax: 2,
      gridSize: 56,
      integral: {
        regionType: 'rectangle',
        xStart: -2,
        xEnd: 2,
        yStart: -2,
        yEnd: 2,
        partitions: 14,
        rule: 'midpoint',
      },
    },
  },
  {
    label: '高斯钟形 · 圆域极坐标',
    request: {
      expression: 'exp(-(x^2 + y^2))',
      xMin: -2.5,
      xMax: 2.5,
      yDomainMin: -2.5,
      yDomainMax: 2.5,
      gridSize: 64,
      integral: {
        regionType: 'disk',
        xStart: -2,
        xEnd: 2,
        yStart: -2,
        yEnd: 2,
        partitions: 18,
        rule: 'midpoint',
      },
    },
  },
  {
    label: '斜面体积 · 三角形累次积分',
    request: {
      expression: 'x + 2 * y + 1',
      xMin: 0,
      xMax: 2,
      yDomainMin: 0,
      yDomainMax: 2,
      gridSize: 56,
      integral: {
        regionType: 'triangle',
        xStart: 0,
        xEnd: 2,
        yStart: 0,
        yEnd: 2,
        partitions: 16,
        rule: 'midpoint',
      },
    },
  },
  {
    label: '双曲马鞍面 · 驻点切平面',
    request: {
      expression: 'x^2 - y^2',
      xMin: -2.5,
      xMax: 2.5,
      yDomainMin: -2.5,
      yDomainMax: 2.5,
      gridSize: 64,
      probe: { x0: 0, y0: 0 },
    },
  },
  {
    label: '上半球面 · 曲顶体积',
    request: {
      expression: 'sqrt(4 - x^2 - y^2)',
      xMin: -2.2,
      xMax: 2.2,
      yDomainMin: -2.2,
      yDomainMax: 2.2,
      gridSize: 64,
      integral: {
        regionType: 'disk',
        xStart: -2,
        xEnd: 2,
        yStart: -2,
        yEnd: 2,
        partitions: 20,
        rule: 'midpoint',
      },
    },
  },
  {
    label: '二元极限反例 · 方向脊线',
    request: {
      expression: '(x * y) / (x^2 + y^2)',
      xMin: -2,
      xMax: 2,
      yDomainMin: -2,
      yDomainMax: 2,
      gridSize: 64,
    },
  },
];

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

interface SurfaceFormValues {
  expression: string;
  xMin: number;
  xMax: number;
  yDomainMin: number;
  yDomainMax: number;
  zMin?: number;
  zMax?: number;
  intXStart?: number;
  intXEnd?: number;
  intYStart?: number;
  intYEnd?: number;
  intPartitions?: number;
  probeX0?: number;
  probeY0?: number;
}

interface ActiveWorkspaceState {
  baseSearchKey: string;
  seq: number;
  mode: LabMode;
  surfaceRequest: SurfacePlotRequest;
  zClampEnabled: boolean;
  integralEnabled: boolean;
  integralRegion: IntegralRegionType;
  integralRule: RiemannRule;
  probeEnabled: boolean;
  plotRequest: PlotRequest;
  yClampEnabled: boolean;
  secantEnabled: boolean;
}

type Calc1DState =
  | { requestKey: string; status: 'done'; result: PlotResult }
  | { requestKey: string; status: 'error'; error: string };

type Calc3DState =
  | { requestKey: string; status: 'done'; result: SurfacePlotResult }
  | { requestKey: string; status: 'error'; error: string };

function toPlotFormValues(request: PlotRequest): PlotFormValues {
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

function toSurfaceFormValues(request: SurfacePlotRequest): SurfaceFormValues {
  return {
    expression: request.expression,
    xMin: request.xMin,
    xMax: request.xMax,
    yDomainMin: request.yDomainMin,
    yDomainMax: request.yDomainMax,
    zMin: request.zMin ?? -6,
    zMax: request.zMax ?? 6,
    intXStart: request.integral?.xStart ?? request.xMin,
    intXEnd: request.integral?.xEnd ?? request.xMax,
    intYStart: request.integral?.yStart ?? request.yDomainMin,
    intYEnd: request.integral?.yEnd ?? request.yDomainMax,
    intPartitions: request.integral?.partitions ?? 14,
    probeX0: request.probe?.x0 ?? 0,
    probeY0: request.probe?.y0 ?? 0,
  };
}

function buildPlotPayload(
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

function buildSurfacePayload(
  values: Partial<SurfaceFormValues>,
  options: {
    gridSize: number;
    zClampEnabled: boolean;
    integralEnabled: boolean;
    integralRegion: IntegralRegionType;
    integralRule: RiemannRule;
    probeEnabled: boolean;
    sourceKnowledgeId?: string;
    sourceMistakeId?: string;
  },
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    expression: values.expression?.trim() ?? '',
    xMin: values.xMin,
    xMax: values.xMax,
    yDomainMin: values.yDomainMin,
    yDomainMax: values.yDomainMax,
    gridSize: options.gridSize,
  };
  if (options.zClampEnabled) {
    payload.zMin = values.zMin ?? -6;
    payload.zMax = values.zMax ?? 6;
  }
  if (options.integralEnabled) {
    payload.integral = {
      regionType: options.integralRegion,
      xStart: values.intXStart ?? values.xMin ?? -2,
      xEnd: values.intXEnd ?? values.xMax ?? 2,
      yStart: values.intYStart ?? values.yDomainMin ?? -2,
      yEnd: values.intYEnd ?? values.yDomainMax ?? 2,
      partitions: Math.round(values.intPartitions ?? 14),
      rule: options.integralRule,
    };
  }
  if (options.probeEnabled) {
    payload.probe = {
      x0: values.probeX0 ?? 0,
      y0: values.probeY0 ?? 0,
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
  const rawMode = params.get('mode');
  const default1D = stored.ok ? stored.data.defaultPlot : DEFAULT_1D;
  const defaultSurface = stored.ok
    ? (stored.data.defaultSurfacePlot ?? DEFAULT_SURFACE)
    : DEFAULT_SURFACE;

  const isExplicit1D =
    rawMode === '1d' ||
    rawMode === '2d' ||
    (rawMode !== '3d' && params.has('expression'));

  if (isExplicit1D) {
    const linked1D = parsePlotSearch(params);
    const initial1D = linked1D ?? default1D;
    const warning =
      params.has('expression') && !linked1D
        ? '链接参数无效，已使用默认设置。'
        : !stored.ok
          ? stored.error
          : undefined;

    return {
      state: {
        baseSearchKey: searchKey,
        seq: 0,
        mode: '1d',
        surfaceRequest: defaultSurface,
        zClampEnabled:
          defaultSurface.zMin !== undefined ||
          defaultSurface.zMax !== undefined,
        integralEnabled: defaultSurface.integral !== undefined,
        integralRegion: defaultSurface.integral?.regionType ?? 'rectangle',
        integralRule: defaultSurface.integral?.rule ?? 'midpoint',
        probeEnabled: defaultSurface.probe !== undefined,
        plotRequest: initial1D,
        yClampEnabled:
          initial1D.yMin !== undefined || initial1D.yMax !== undefined,
        secantEnabled: initial1D.secant !== undefined,
      },
      warning,
    };
  }

  const linkedSurface =
    rawMode === '3d' ? parseSurfacePlotSearch(params) : null;
  const initialSurface = linkedSurface ?? defaultSurface;
  const warning =
    rawMode === '3d' && params.has('expression') && !linkedSurface
      ? '三维链接参数无效，已使用默认三维设置。'
      : !stored.ok
        ? stored.error
        : undefined;

  return {
    state: {
      baseSearchKey: searchKey,
      seq: 0,
      mode: '3d',
      surfaceRequest: initialSurface,
      zClampEnabled:
        initialSurface.zMin !== undefined || initialSurface.zMax !== undefined,
      integralEnabled: initialSurface.integral !== undefined,
      integralRegion: initialSurface.integral?.regionType ?? 'rectangle',
      integralRule: initialSurface.integral?.rule ?? 'midpoint',
      probeEnabled: initialSurface.probe !== undefined,
      plotRequest: default1D,
      yClampEnabled:
        default1D.yMin !== undefined || default1D.yMax !== undefined,
      secantEnabled: default1D.secant !== undefined,
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

function getSafeMistakeDraftLink(params: {
  expression: string;
  xMin: number;
  xMax: number;
  sourceKnowledgeId?: string;
}): string {
  const validCardId =
    params.sourceKnowledgeId &&
    /^[a-z][a-z0-9-]*$/.test(params.sourceKnowledgeId)
      ? params.sourceKnowledgeId
      : undefined;
  const matchedCard = validCardId
    ? knowledgeCards.find((card) => card.id === validCardId)
    : undefined;
  try {
    return createMistakeDraftLink({
      topic: matchedCard?.topic,
      expression: params.expression,
      xMin: params.xMin,
      xMax: params.xMax,
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

interface SurfaceWorkspaceProps {
  active: ActiveWorkspaceState;
  searchKey: string;
  surfaceLoading: boolean;
  surfaceResult: SurfacePlotResult | null;
  surfaceError: string;
  saveStatus: { ok: boolean; text: string } | null;
  persistedPrefs: Preferences;
  clearExternalSearchIfPresent: () => string;
  setValidationError: (msg: string) => void;
  setSaveStatus: (status: { ok: boolean; text: string } | null) => void;
  setPersistedPrefs: (prefs: Preferences) => void;
  setUserState: (next: ActiveWorkspaceState) => void;
}

function SurfaceWorkspace({
  active,
  searchKey,
  surfaceLoading,
  surfaceResult,
  surfaceError,
  saveStatus,
  persistedPrefs,
  clearExternalSearchIfPresent,
  setValidationError,
  setSaveStatus,
  setPersistedPrefs,
  setUserState,
}: SurfaceWorkspaceProps) {
  const [surfaceForm] = Form.useForm<SurfaceFormValues>();
  const activeSurfaceRequest = active.surfaceRequest;

  useEffect(() => {
    if (!searchKey) return;
    const linked = parseSurfacePlotSearch(new URLSearchParams(searchKey));
    if (linked) {
      surfaceForm.setFieldsValue(toSurfaceFormValues(linked));
    }
  }, [searchKey, surfaceForm]);

  const getMergedSurfaceFormValues = (): SurfaceFormValues => ({
    ...toSurfaceFormValues(activeSurfaceRequest),
    ...(surfaceForm.getFieldsValue(true) as Partial<SurfaceFormValues>),
  });

  const commitSurfaceCandidate = (
    candidate: Record<string, unknown>,
    overrides: Partial<ActiveWorkspaceState>,
    clearUrl = false,
  ) => {
    const valid = surfacePlotRequestSchema.safeParse(candidate);
    if (!valid.success) {
      setValidationError(valid.error.issues[0].message);
      return;
    }
    const nextSearchKey = clearUrl ? clearExternalSearchIfPresent() : searchKey;
    setValidationError('');
    setUserState({
      ...active,
      ...overrides,
      baseSearchKey: nextSearchKey,
      seq: active.seq + 1,
      mode: '3d',
      surfaceRequest: valid.data,
    });
  };

  const handleSurfaceFinish = (values: SurfaceFormValues) => {
    setSaveStatus(null);
    const merged = { ...getMergedSurfaceFormValues(), ...values };
    const payload = buildSurfacePayload(merged, {
      gridSize: activeSurfaceRequest.gridSize,
      zClampEnabled: active.zClampEnabled,
      integralEnabled: active.integralEnabled,
      integralRegion: active.integralRegion,
      integralRule: active.integralRule,
      probeEnabled: active.probeEnabled,
    });
    commitSurfaceCandidate(payload, {}, true);
  };

  const applySurfacePreset = (presetRequest: SurfacePlotRequest) => {
    setSaveStatus(null);
    const nextZClamp =
      presetRequest.zMin !== undefined || presetRequest.zMax !== undefined;
    const nextIntegral = presetRequest.integral !== undefined;
    const nextRegion = presetRequest.integral?.regionType ?? 'rectangle';
    const nextRule = presetRequest.integral?.rule ?? 'midpoint';
    const nextProbe = presetRequest.probe !== undefined;
    surfaceForm.setFieldsValue(toSurfaceFormValues(presetRequest));
    const valid = surfacePlotRequestSchema.safeParse(presetRequest);
    if (!valid.success) {
      setValidationError(valid.error.issues[0].message);
      return;
    }
    const nextSearchKey = clearExternalSearchIfPresent();
    setValidationError('');
    setUserState({
      ...active,
      baseSearchKey: nextSearchKey,
      seq: active.seq + 1,
      mode: '3d',
      surfaceRequest: valid.data,
      zClampEnabled: nextZClamp,
      integralEnabled: nextIntegral,
      integralRegion: nextRegion,
      integralRule: nextRule,
      probeEnabled: nextProbe,
    });
  };

  const handleChangeGridSize = (nextGridSize: number) => {
    setSaveStatus(null);
    const current = getMergedSurfaceFormValues();
    const candidate = buildSurfacePayload(current, {
      gridSize: nextGridSize,
      zClampEnabled: active.zClampEnabled,
      integralEnabled: active.integralEnabled,
      integralRegion: active.integralRegion,
      integralRule: active.integralRule,
      probeEnabled: active.probeEnabled,
      sourceKnowledgeId: activeSurfaceRequest.sourceKnowledgeId,
      sourceMistakeId: activeSurfaceRequest.sourceMistakeId,
    });
    commitSurfaceCandidate(candidate, {});
  };

  const handleToggleZClamp = (checked: boolean) => {
    const current = getMergedSurfaceFormValues();
    const nextZMin = current.zMin ?? activeSurfaceRequest.zMin ?? -6;
    const nextZMax = current.zMax ?? activeSurfaceRequest.zMax ?? 6;
    if (checked) {
      surfaceForm.setFieldsValue({ zMin: nextZMin, zMax: nextZMax });
    }
    const candidate = buildSurfacePayload(
      { ...current, zMin: nextZMin, zMax: nextZMax },
      {
        gridSize: activeSurfaceRequest.gridSize,
        zClampEnabled: checked,
        integralEnabled: active.integralEnabled,
        integralRegion: active.integralRegion,
        integralRule: active.integralRule,
        probeEnabled: active.probeEnabled,
        sourceKnowledgeId: activeSurfaceRequest.sourceKnowledgeId,
        sourceMistakeId: activeSurfaceRequest.sourceMistakeId,
      },
    );
    const parsed = surfacePlotRequestSchema.safeParse(candidate);
    setValidationError('');
    setUserState({
      ...active,
      seq: active.seq + 1,
      zClampEnabled: checked,
      surfaceRequest: parsed.success
        ? parsed.data
        : {
            ...activeSurfaceRequest,
            zMin: checked ? -6 : undefined,
            zMax: checked ? 6 : undefined,
          },
    });
  };

  const handleToggleIntegral = (checked: boolean) => {
    const current = getMergedSurfaceFormValues();
    const fallbackX0 =
      current.intXStart ??
      activeSurfaceRequest.integral?.xStart ??
      activeSurfaceRequest.xMin;
    const fallbackX1 =
      current.intXEnd ??
      activeSurfaceRequest.integral?.xEnd ??
      activeSurfaceRequest.xMax;
    const fallbackY0 =
      current.intYStart ??
      activeSurfaceRequest.integral?.yStart ??
      activeSurfaceRequest.yDomainMin;
    const fallbackY1 =
      current.intYEnd ??
      activeSurfaceRequest.integral?.yEnd ??
      activeSurfaceRequest.yDomainMax;
    const fallbackN =
      current.intPartitions ?? activeSurfaceRequest.integral?.partitions ?? 14;

    if (checked) {
      surfaceForm.setFieldsValue({
        intXStart: fallbackX0,
        intXEnd: fallbackX1,
        intYStart: fallbackY0,
        intYEnd: fallbackY1,
        intPartitions: fallbackN,
      });
    }
    const candidate = buildSurfacePayload(
      {
        ...current,
        intXStart: fallbackX0,
        intXEnd: fallbackX1,
        intYStart: fallbackY0,
        intYEnd: fallbackY1,
        intPartitions: fallbackN,
      },
      {
        gridSize: activeSurfaceRequest.gridSize,
        zClampEnabled: active.zClampEnabled,
        integralEnabled: checked,
        integralRegion: active.integralRegion,
        integralRule: active.integralRule,
        probeEnabled: active.probeEnabled,
        sourceKnowledgeId: activeSurfaceRequest.sourceKnowledgeId,
        sourceMistakeId: activeSurfaceRequest.sourceMistakeId,
      },
    );
    const parsed = surfacePlotRequestSchema.safeParse(candidate);
    setValidationError('');
    setUserState({
      ...active,
      seq: active.seq + 1,
      integralEnabled: checked,
      surfaceRequest: parsed.success
        ? parsed.data
        : {
            ...activeSurfaceRequest,
            integral: checked
              ? {
                  regionType: active.integralRegion,
                  xStart: activeSurfaceRequest.xMin,
                  xEnd: activeSurfaceRequest.xMax,
                  yStart: activeSurfaceRequest.yDomainMin,
                  yEnd: activeSurfaceRequest.yDomainMax,
                  partitions: 14,
                  rule: active.integralRule,
                }
              : undefined,
          },
    });
  };

  const handleChangeRegionType = (regionType: IntegralRegionType) => {
    const current = getMergedSurfaceFormValues();
    const candidate = buildSurfacePayload(current, {
      gridSize: activeSurfaceRequest.gridSize,
      zClampEnabled: active.zClampEnabled,
      integralEnabled: true,
      integralRegion: regionType,
      integralRule: active.integralRule,
      probeEnabled: active.probeEnabled,
      sourceKnowledgeId: activeSurfaceRequest.sourceKnowledgeId,
      sourceMistakeId: activeSurfaceRequest.sourceMistakeId,
    });
    commitSurfaceCandidate(candidate, {
      integralEnabled: true,
      integralRegion: regionType,
    });
  };

  const handleChangePartitions = (partitions: number) => {
    const current = getMergedSurfaceFormValues();
    surfaceForm.setFieldsValue({ intPartitions: partitions });
    const candidate = buildSurfacePayload(
      { ...current, intPartitions: partitions },
      {
        gridSize: activeSurfaceRequest.gridSize,
        zClampEnabled: active.zClampEnabled,
        integralEnabled: true,
        integralRegion: active.integralRegion,
        integralRule: active.integralRule,
        probeEnabled: active.probeEnabled,
        sourceKnowledgeId: activeSurfaceRequest.sourceKnowledgeId,
        sourceMistakeId: activeSurfaceRequest.sourceMistakeId,
      },
    );
    commitSurfaceCandidate(candidate, { integralEnabled: true });
  };

  const handleChangeRule = (rule: RiemannRule) => {
    const current = getMergedSurfaceFormValues();
    const candidate = buildSurfacePayload(current, {
      gridSize: activeSurfaceRequest.gridSize,
      zClampEnabled: active.zClampEnabled,
      integralEnabled: true,
      integralRegion: active.integralRegion,
      integralRule: rule,
      probeEnabled: active.probeEnabled,
      sourceKnowledgeId: activeSurfaceRequest.sourceKnowledgeId,
      sourceMistakeId: activeSurfaceRequest.sourceMistakeId,
    });
    commitSurfaceCandidate(candidate, {
      integralEnabled: true,
      integralRule: rule,
    });
  };

  const handleSyncIntegralDomain = () => {
    const current = getMergedSurfaceFormValues();
    const synced = {
      ...current,
      intXStart: current.xMin,
      intXEnd: current.xMax,
      intYStart: current.yDomainMin,
      intYEnd: current.yDomainMax,
    };
    surfaceForm.setFieldsValue({
      intXStart: current.xMin,
      intXEnd: current.xMax,
      intYStart: current.yDomainMin,
      intYEnd: current.yDomainMax,
    });
    const candidate = buildSurfacePayload(synced, {
      gridSize: activeSurfaceRequest.gridSize,
      zClampEnabled: active.zClampEnabled,
      integralEnabled: true,
      integralRegion: active.integralRegion,
      integralRule: active.integralRule,
      probeEnabled: active.probeEnabled,
      sourceKnowledgeId: activeSurfaceRequest.sourceKnowledgeId,
      sourceMistakeId: activeSurfaceRequest.sourceMistakeId,
    });
    commitSurfaceCandidate(candidate, { integralEnabled: true });
  };

  const handleToggleProbe = (checked: boolean) => {
    const current = getMergedSurfaceFormValues();
    const nextX0 = current.probeX0 ?? activeSurfaceRequest.probe?.x0 ?? 0;
    const nextY0 = current.probeY0 ?? activeSurfaceRequest.probe?.y0 ?? 0;
    if (checked) {
      surfaceForm.setFieldsValue({ probeX0: nextX0, probeY0: nextY0 });
    }
    const candidate = buildSurfacePayload(
      { ...current, probeX0: nextX0, probeY0: nextY0 },
      {
        gridSize: activeSurfaceRequest.gridSize,
        zClampEnabled: active.zClampEnabled,
        integralEnabled: active.integralEnabled,
        integralRegion: active.integralRegion,
        integralRule: active.integralRule,
        probeEnabled: checked,
        sourceKnowledgeId: activeSurfaceRequest.sourceKnowledgeId,
        sourceMistakeId: activeSurfaceRequest.sourceMistakeId,
      },
    );
    const parsed = surfacePlotRequestSchema.safeParse(candidate);
    setValidationError('');
    setUserState({
      ...active,
      seq: active.seq + 1,
      probeEnabled: checked,
      surfaceRequest: parsed.success
        ? parsed.data
        : {
            ...activeSurfaceRequest,
            probe: checked ? { x0: 0, y0: 0 } : undefined,
          },
    });
  };

  const handleQuickProbe = (x0: number, y0: number) => {
    const current = getMergedSurfaceFormValues();
    surfaceForm.setFieldsValue({ probeX0: x0, probeY0: y0 });
    const candidate = buildSurfacePayload(
      { ...current, probeX0: x0, probeY0: y0 },
      {
        gridSize: activeSurfaceRequest.gridSize,
        zClampEnabled: active.zClampEnabled,
        integralEnabled: active.integralEnabled,
        integralRegion: active.integralRegion,
        integralRule: active.integralRule,
        probeEnabled: true,
        sourceKnowledgeId: activeSurfaceRequest.sourceKnowledgeId,
        sourceMistakeId: activeSurfaceRequest.sourceMistakeId,
      },
    );
    commitSurfaceCandidate(candidate, { probeEnabled: true });
  };

  const handleSaveSurfaceDefault = async () => {
    try {
      const values = await surfaceForm.validateFields();
      const merged = { ...getMergedSurfaceFormValues(), ...values };
      const payload = buildSurfacePayload(merged, {
        gridSize: activeSurfaceRequest.gridSize,
        zClampEnabled: active.zClampEnabled,
        integralEnabled: active.integralEnabled,
        integralRegion: active.integralRegion,
        integralRule: active.integralRule,
        probeEnabled: active.probeEnabled,
      });
      const valid = surfacePlotRequestSchema.safeParse(payload);
      if (!valid.success) {
        const message = valid.error.issues[0].message;
        setValidationError(message);
        setSaveStatus({ ok: false, text: message });
        return;
      }
      const nextPrefs: Preferences = {
        defaultPlot: persistedPrefs.defaultPlot,
        defaultSurfacePlot: valid.data,
      };
      const writeResult = preferences.write(nextPrefs);
      const nextSearchKey = clearExternalSearchIfPresent();
      if (writeResult.ok) {
        setPersistedPrefs(nextPrefs);
        setValidationError('');
        setUserState({
          ...active,
          baseSearchKey: nextSearchKey,
          surfaceRequest: valid.data,
        });
      }
      setSaveStatus({
        ok: writeResult.ok,
        text: writeResult.ok
          ? '已保存三维默认设置到当前浏览器，下次打开实验室时直接加载。'
          : writeResult.error,
      });
    } catch {
      /* Ant Design form highlights invalid fields */
    }
  };

  const zDomain: [number | undefined, number | undefined] | undefined =
    activeSurfaceRequest.zMin !== undefined ||
    activeSurfaceRequest.zMax !== undefined
      ? [activeSurfaceRequest.zMin, activeSurfaceRequest.zMax]
      : undefined;

  const integralResult = surfaceResult?.integralResult;
  const probeResult = surfaceResult?.probeResult;

  return (
    <div className={styles.plotLayout}>
      <Card title="三维多元与重积分参数">
        <Form
          form={surfaceForm}
          layout="vertical"
          initialValues={toSurfaceFormValues(activeSurfaceRequest)}
          onFinish={handleSurfaceFinish}
          requiredMark={false}
        >
          <Form.Item
            name="expression"
            label="多元函数表达式 f(x, y)"
            rules={[
              {
                required: true,
                whitespace: true,
                message: '请输入多元函数表达式 f(x, y)',
              },
              { max: 160, message: '表达式最多 160 个字符' },
            ]}
          >
            <Input
              placeholder="例如 sin(x)*cos(y) 或 exp(-(x^2+y^2))"
              autoComplete="off"
            />
          </Form.Item>

          <div className={styles.rangeFields}>
            <Form.Item
              name="xMin"
              label="x 左端点"
              className={styles.compactItem}
              rules={[
                {
                  required: true,
                  type: 'number',
                  message: '请输入 x 左端点',
                },
              ]}
            >
              <InputNumber min={-1000} max={1000} step={0.5} />
            </Form.Item>
            <Form.Item
              name="xMax"
              label="x 右端点"
              className={styles.compactItem}
              rules={[
                {
                  required: true,
                  type: 'number',
                  message: '请输入 x 右端点',
                },
              ]}
            >
              <InputNumber min={-1000} max={1000} step={0.5} />
            </Form.Item>
          </div>

          <div className={styles.rangeFields}>
            <Form.Item
              name="yDomainMin"
              label="y 下界"
              rules={[
                {
                  required: true,
                  type: 'number',
                  message: '请输入 y 下界',
                },
              ]}
            >
              <InputNumber min={-1000} max={1000} step={0.5} />
            </Form.Item>
            <Form.Item
              name="yDomainMax"
              label="y 上界"
              rules={[
                {
                  required: true,
                  type: 'number',
                  message: '请输入 y 上界',
                },
              ]}
            >
              <InputNumber min={-1000} max={1000} step={0.5} />
            </Form.Item>
          </div>

          <div className={styles.precisionBlock}>
            <div className={styles.precisionHeader}>
              <span className={styles.precisionLabel}>曲面采样精度</span>
              <span className={styles.precisionBadge}>
                当前 {activeSurfaceRequest.gridSize}×
                {activeSurfaceRequest.gridSize}
              </span>
            </div>
            <Space size={[6, 6]} wrap>
              {GRID_PRECISION_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  size="small"
                  type={
                    activeSurfaceRequest.gridSize === opt.value
                      ? 'primary'
                      : 'default'
                  }
                  onClick={() => handleChangeGridSize(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </Space>
          </div>

          <div className={styles.optionPanel}>
            <div className={styles.optionHeader}>
              <label htmlFor="z-clamp-switch" className={styles.optionLabel}>
                限制竖轴 z 范围（防奇点拉伸）
              </label>
              <Switch
                id="z-clamp-switch"
                size="small"
                checked={active.zClampEnabled}
                onChange={handleToggleZClamp}
              />
            </div>
            <p className={styles.optionHint}>
              考察含无界极点或陡峭脊线的二元函数时锁定竖轴范围，保持局部曲面曲率清晰。
            </p>
            {active.zClampEnabled && (
              <div className={styles.optionBody}>
                <div className={styles.rangeFields}>
                  <Form.Item
                    name="zMin"
                    label="z 下界"
                    className={styles.compactItemLast}
                    rules={[
                      {
                        required: true,
                        type: 'number',
                        message: '请输入 z 下界',
                      },
                    ]}
                  >
                    <InputNumber min={-1000000} max={1000000} step={0.5} />
                  </Form.Item>
                  <Form.Item
                    name="zMax"
                    label="z 上界"
                    className={styles.compactItemLast}
                    rules={[
                      {
                        required: true,
                        type: 'number',
                        message: '请输入 z 上界',
                      },
                    ]}
                  >
                    <InputNumber min={-1000000} max={1000000} step={0.5} />
                  </Form.Item>
                </div>
              </div>
            )}
          </div>

          <div className={styles.optionPanel}>
            <div className={styles.optionHeader}>
              <label htmlFor="integral-switch" className={styles.optionLabel}>
                二重积分与黎曼柱体仿真（∬_D f(x, y) dσ）
              </label>
              <Switch
                id="integral-switch"
                size="small"
                checked={active.integralEnabled}
                onChange={handleToggleIntegral}
              />
            </div>
            <p className={styles.optionHint}>
              在平面积分域 D 上立起 N×N
              根黎曼取样柱体，直观检验累次积分定限与离散体积逼近。
            </p>
            {active.integralEnabled && (
              <div className={styles.optionBody}>
                <span className={styles.quickStepLabel}>
                  积分区域类型（D）：
                </span>
                <Space size={[6, 6]} wrap>
                  {(
                    Object.entries(INTEGRAL_REGION_LABELS) as Array<
                      [IntegralRegionType, string]
                    >
                  ).map(([regionKey, regionLabel]) => (
                    <Button
                      key={regionKey}
                      size="small"
                      type={
                        active.integralRegion === regionKey
                          ? 'primary'
                          : 'default'
                      }
                      onClick={() => handleChangeRegionType(regionKey)}
                    >
                      {regionLabel}
                    </Button>
                  ))}
                </Space>

                <div className={styles.regionFormulaBox}>
                  {REGION_INEQUALITY_NOTES[active.integralRegion]}
                </div>

                <div className={styles.subSectionRow}>
                  <span className={styles.subSectionTitle}>积分边界范围</span>
                  <Button
                    size="small"
                    type="link"
                    icon={<SyncOutlined />}
                    className={styles.syncBtn}
                    onClick={handleSyncIntegralDomain}
                  >
                    同步当前定义域
                  </Button>
                </div>

                <div className={styles.rangeFields}>
                  <Form.Item
                    name="intXStart"
                    label="积分 x 下限"
                    className={styles.compactItem}
                    rules={[
                      {
                        required: true,
                        type: 'number',
                        message: '请输入积分 x 下限',
                      },
                    ]}
                  >
                    <InputNumber min={-1000} max={1000} step={0.5} />
                  </Form.Item>
                  <Form.Item
                    name="intXEnd"
                    label="积分 x 上限"
                    className={styles.compactItem}
                    rules={[
                      {
                        required: true,
                        type: 'number',
                        message: '请输入积分 x 上限',
                      },
                    ]}
                  >
                    <InputNumber min={-1000} max={1000} step={0.5} />
                  </Form.Item>
                </div>

                <div className={styles.rangeFields}>
                  <Form.Item
                    name="intYStart"
                    label="积分 y 下限"
                    className={styles.compactItem}
                    rules={[
                      {
                        required: true,
                        type: 'number',
                        message: '请输入积分 y 下限',
                      },
                    ]}
                  >
                    <InputNumber min={-1000} max={1000} step={0.5} />
                  </Form.Item>
                  <Form.Item
                    name="intYEnd"
                    label="积分 y 上限"
                    className={styles.compactItem}
                    rules={[
                      {
                        required: true,
                        type: 'number',
                        message: '请输入积分 y 上限',
                      },
                    ]}
                  >
                    <InputNumber min={-1000} max={1000} step={0.5} />
                  </Form.Item>
                </div>

                <Form.Item
                  name="intPartitions"
                  label="黎曼分割数 N（N×N，4–36）"
                  className={styles.compactItem}
                  rules={[
                    {
                      required: true,
                      type: 'number',
                      message: '请输入分割数 N',
                    },
                  ]}
                >
                  <InputNumber min={4} max={36} step={1} />
                </Form.Item>

                <div className={styles.quickStepBar}>
                  <span className={styles.quickStepLabel}>
                    快捷加密分割（见证 |S_N - I| → 0）：
                  </span>
                  <Space size={[6, 6]} wrap>
                    {QUICK_PARTITIONS.map((nVal) => (
                      <Button
                        key={nVal}
                        size="small"
                        type={
                          activeSurfaceRequest.integral?.partitions === nVal
                            ? 'primary'
                            : 'default'
                        }
                        onClick={() => handleChangePartitions(nVal)}
                      >
                        {`${nVal}×${nVal}`}
                      </Button>
                    ))}
                  </Space>
                </div>

                <div className={styles.quickStepBar}>
                  <span className={styles.quickStepLabel}>
                    柱体高度取样规则：
                  </span>
                  <Space size={[6, 6]} wrap>
                    {(
                      Object.entries(RIEMANN_RULE_LABELS) as Array<
                        [RiemannRule, string]
                      >
                    ).map(([ruleKey, ruleLabel]) => (
                      <Button
                        key={ruleKey}
                        size="small"
                        type={
                          active.integralRule === ruleKey
                            ? 'primary'
                            : 'default'
                        }
                        onClick={() => handleChangeRule(ruleKey)}
                      >
                        {ruleLabel}
                      </Button>
                    ))}
                  </Space>
                </div>
              </div>
            )}
          </div>

          <div className={styles.optionPanel}>
            <div className={styles.optionHeader}>
              <label htmlFor="probe-switch" className={styles.optionLabel}>
                偏导数截痕与切平面探索（∇f(x₀, y₀)）
              </label>
              <Switch
                id="probe-switch"
                size="small"
                checked={active.probeEnabled}
                onChange={handleToggleProbe}
              />
            </div>
            <p className={styles.optionHint}>
              在曲面上剖出 x = x₀、y = y₀
              两条空间截痕曲线，并贴合观察点处的线性切平面。
            </p>
            {active.probeEnabled && (
              <div className={styles.optionBody}>
                <div className={styles.rangeFields}>
                  <Form.Item
                    name="probeX0"
                    label="观察点 x₀"
                    className={styles.compactItemLast}
                    rules={[
                      {
                        required: true,
                        type: 'number',
                        message: '请输入观察点 x₀',
                      },
                    ]}
                  >
                    <InputNumber min={-1000} max={1000} step={0.2} />
                  </Form.Item>
                  <Form.Item
                    name="probeY0"
                    label="观察点 y₀"
                    className={styles.compactItemLast}
                    rules={[
                      {
                        required: true,
                        type: 'number',
                        message: '请输入观察点 y₀',
                      },
                    ]}
                  >
                    <InputNumber min={-1000} max={1000} step={0.2} />
                  </Form.Item>
                </div>
                <div className={styles.quickStepBar}>
                  <span className={styles.quickStepLabel}>
                    快捷观察点对比：
                  </span>
                  <Space size={[6, 6]} wrap>
                    {QUICK_PROBE_POINTS.map((pt) => (
                      <Button
                        key={pt.label}
                        size="small"
                        type={
                          activeSurfaceRequest.probe?.x0 === pt.x0 &&
                          activeSurfaceRequest.probe?.y0 === pt.y0
                            ? 'primary'
                            : 'default'
                        }
                        onClick={() => handleQuickProbe(pt.x0, pt.y0)}
                      >
                        {pt.label}
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
            icon={<AppstoreOutlined />}
            block
            loading={surfaceLoading}
          >
            生成三维曲面
          </Button>
        </Form>

        <Button
          className={styles.secondaryAction}
          icon={<SaveOutlined />}
          onClick={() => void handleSaveSurfaceDefault()}
          block
        >
          保存三维默认设置
        </Button>

        <h3 className={styles.presetHeading}>多元微积分与重积分精选实验预设</h3>
        <p className={styles.presetSubnote}>
          一键加载曲顶抛物面、极坐标圆域、三角形累次积分、马鞍面切平面与二元极限反例：
        </p>
        <Space size={[6, 8]} wrap>
          {SURFACE_PRESETS.map((preset) => (
            <Button
              key={preset.label}
              size="small"
              onClick={() => applySurfacePreset(preset.request)}
            >
              {preset.label}
            </Button>
          ))}
        </Space>

        <p className={styles.smallNote}>
          支持二元变量 x、y 与常量 pi、e，以及 sin / cos / tan / asin / acos /
          atan / sinh / cosh / tanh / abs / sqrt / cbrt / sign / floor / ceil /
          exp / log / ln / lg 及有理常数幂运算。
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
        title="三维曲面与重积分视口"
        extra={
          <div className={styles.chartExtra}>
            <Tag>三维网格采样 · 黎曼柱体数值积分</Tag>
            <Link
              className={styles.mistakeLink}
              to={getSafeMistakeDraftLink({
                expression: activeSurfaceRequest.expression,
                xMin: activeSurfaceRequest.xMin,
                xMax: activeSurfaceRequest.xMax,
                sourceKnowledgeId: activeSurfaceRequest.sourceKnowledgeId,
              })}
            >
              <BookOutlined /> 记入错题本
            </Link>
          </div>
        }
      >
        {surfaceLoading && (
          <div className={styles.chartLoading}>
            <Spin />
            <p>正在计算三维曲面网格与黎曼积分柱体…</p>
          </div>
        )}

        {surfaceError && (
          <Alert
            className={styles.errorAlert}
            type="error"
            showIcon
            title="无法绘制"
            description={surfaceError}
          />
        )}

        {!surfaceLoading && surfaceResult && (
          <>
            <Surface3DViewer
              result={surfaceResult}
              expression={activeSurfaceRequest.expression}
              xDomain={[activeSurfaceRequest.xMin, activeSurfaceRequest.xMax]}
              yDomain={[
                activeSurfaceRequest.yDomainMin,
                activeSurfaceRequest.yDomainMax,
              ]}
              zDomain={zDomain}
              integralConfig={activeSurfaceRequest.integral}
            />

            <p className={styles.chartSummary} role="status">
              z = f(x, y) = {activeSurfaceRequest.expression}
              {' · '}定义域 [{activeSurfaceRequest.xMin},{' '}
              {activeSurfaceRequest.xMax}] × [{activeSurfaceRequest.yDomainMin},{' '}
              {activeSurfaceRequest.yDomainMax}]
              {activeSurfaceRequest.zMin !== undefined &&
              activeSurfaceRequest.zMax !== undefined
                ? ` · 竖轴 [${activeSurfaceRequest.zMin}, ${activeSurfaceRequest.zMax}]`
                : ''}
              {' · '}
              {surfaceResult.validCount} 个有效网格点 · {surfaceResult.gaps}{' '}
              处采样缺口
            </p>

            {surfaceResult.validCount === 0 && (
              <Alert
                className={styles.secantAlert}
                type="warning"
                showIcon
                title="该定义域内没有可显示的有限实数值，请调整多元表达式或定义域。"
              />
            )}

            {integralResult && activeSurfaceRequest.integral && (
              <div
                className={styles.secantCard}
                aria-label="二重积分黎曼柱体量化看板"
              >
                <div className={styles.secantTitleRow}>
                  <h3 className={styles.secantTitle}>
                    二重积分黎曼柱体实时看板（
                    {
                      INTEGRAL_REGION_LABELS[
                        activeSurfaceRequest.integral.regionType
                      ]
                    }{' '}
                    · {RIEMANN_RULE_LABELS[activeSurfaceRequest.integral.rule]}
                    ）
                  </h3>
                  <span className={styles.secantFormulaHint}>
                    外接范围 [{activeSurfaceRequest.integral.xStart},{' '}
                    {activeSurfaceRequest.integral.xEnd}] × [
                    {activeSurfaceRequest.integral.yStart},{' '}
                    {activeSurfaceRequest.integral.yEnd}]
                  </span>
                </div>

                <div className={styles.integralMetrics}>
                  <div className={styles.metricItem}>
                    <span className={styles.metricLabel}>
                      黎曼和近似 S_&#123;N×N&#125;
                    </span>
                    <span className={styles.metricValue}>
                      {formatMetric(integralResult.riemannSum)}
                    </span>
                    <span className={styles.metricSub}>
                      分割 {activeSurfaceRequest.integral.partitions}×
                      {activeSurfaceRequest.integral.partitions} · 共{' '}
                      {integralResult.prisms.length} 根柱体
                    </span>
                  </div>

                  <div className={styles.metricItem}>
                    <span className={styles.metricLabel}>
                      高精度参考积分 ∬_D f dσ
                    </span>
                    <span className={styles.metricValue}>
                      {formatMetric(integralResult.referenceIntegral)}
                    </span>
                    <span className={styles.metricSub}>二维高斯求积参考值</span>
                  </div>

                  <div className={styles.metricItem}>
                    <span className={styles.metricLabel}>
                      离散逼近误差 |S_N - I|
                    </span>
                    <span className={styles.metricValue}>
                      {formatMetric(integralResult.absError)}
                    </span>
                    <span className={styles.metricSub}>
                      随网格直径 λ → 0 趋近于 0
                    </span>
                  </div>

                  <div className={styles.metricItem}>
                    <span className={styles.metricLabel}>
                      有向体积分解（V⁺ / V⁻）
                    </span>
                    <span className={styles.metricValue}>
                      +{formatMetric(integralResult.positiveVolume)} /{' '}
                      {formatMetric(integralResult.negativeVolume)}
                    </span>
                    <span className={styles.metricSub}>
                      曲顶正体积 / 曲底负体积
                    </span>
                  </div>

                  <div className={styles.metricItem}>
                    <span className={styles.metricLabel}>积分域面积与均值</span>
                    <span className={styles.metricValue}>
                      面积 {formatMetric(integralResult.domainArea)}
                    </span>
                    <span className={styles.metricSub}>
                      中值高度 f̄ = {formatMetric(integralResult.meanValue)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {probeResult && activeSurfaceRequest.probe && (
              <div
                className={styles.secantCard}
                aria-label="偏导数与切平面实时看板"
              >
                <div className={styles.secantTitleRow}>
                  <h3 className={styles.secantTitle}>
                    偏导数与切平面实时看板（(x₀, y₀) = (
                    {formatMetric(probeResult.x0)},{' '}
                    {formatMetric(probeResult.y0)})）
                  </h3>
                  <span className={styles.secantFormulaHint}>
                    全微分线性主部 dz = f_x dx + f_y dy
                  </span>
                </div>

                <div className={styles.secantMetrics}>
                  <div className={styles.metricItem}>
                    <span className={styles.metricLabel}>
                      曲面高度 f(x₀, y₀)
                    </span>
                    <span className={styles.metricValue}>
                      {formatMetric(probeResult.z0)}
                    </span>
                    <span className={styles.metricSub}>
                      观察点基准竖坐标 z₀
                    </span>
                  </div>

                  <div className={styles.metricItem}>
                    <span className={styles.metricLabel}>
                      偏导数 f_x(x₀, y₀)
                    </span>
                    <span className={styles.metricValue}>
                      {formatMetric(probeResult.fx)}
                    </span>
                    <span className={styles.metricSub}>
                      固定 y = {formatMetric(probeResult.y0)} 截痕斜率
                    </span>
                  </div>

                  <div className={styles.metricItem}>
                    <span className={styles.metricLabel}>
                      偏导数 f_y(x₀, y₀)
                    </span>
                    <span className={styles.metricValue}>
                      {formatMetric(probeResult.fy)}
                    </span>
                    <span className={styles.metricSub}>
                      固定 x = {formatMetric(probeResult.x0)} 截痕斜率
                    </span>
                  </div>

                  <div className={styles.metricItem}>
                    <span className={styles.metricLabel}>梯度模长 ‖∇f‖</span>
                    <span className={styles.metricValue}>
                      {formatMetric(probeResult.gradNorm)}
                    </span>
                    <span className={styles.metricSub}>最快上升方向变化率</span>
                  </div>
                </div>

                <div className={styles.tangentEquationBar}>
                  {probeResult.z0 !== null &&
                  probeResult.fx !== null &&
                  probeResult.fy !== null ? (
                    <>
                      <strong>切平面线性近似方程：</strong>z ≈{' '}
                      {formatMetric(probeResult.z0)} + (
                      {formatMetric(probeResult.fx)})·(x -{' '}
                      {formatMetric(probeResult.x0)}) + (
                      {formatMetric(probeResult.fy)})·(y -{' '}
                      {formatMetric(probeResult.y0)})
                    </>
                  ) : (
                    '当前观察点处函数值或数值偏导无定义，请检查奇点并结合可微定义严格判别（注意：偏导数存在不一定可微！）。'
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

interface UnivariateWorkspaceProps {
  active: ActiveWorkspaceState;
  searchKey: string;
  plotLoading: boolean;
  plotResult: PlotResult | null;
  plotError: string;
  saveStatus: { ok: boolean; text: string } | null;
  persistedPrefs: Preferences;
  clearExternalSearchIfPresent: () => string;
  setValidationError: (msg: string) => void;
  setSaveStatus: (status: { ok: boolean; text: string } | null) => void;
  setPersistedPrefs: (prefs: Preferences) => void;
  setUserState: (next: ActiveWorkspaceState) => void;
}

function UnivariateWorkspace({
  active,
  searchKey,
  plotLoading,
  plotResult,
  plotError,
  saveStatus,
  persistedPrefs,
  clearExternalSearchIfPresent,
  setValidationError,
  setSaveStatus,
  setPersistedPrefs,
  setUserState,
}: UnivariateWorkspaceProps) {
  const [plotForm] = Form.useForm<PlotFormValues>();
  const activePlotRequest = active.plotRequest;

  useEffect(() => {
    if (!searchKey) return;
    const linked = parsePlotSearch(new URLSearchParams(searchKey));
    if (linked) {
      plotForm.setFieldsValue(toPlotFormValues(linked));
    }
  }, [searchKey, plotForm]);

  const handlePlotFinish = (values: PlotFormValues) => {
    setSaveStatus(null);
    const payload = buildPlotPayload(values, {
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
      ...active,
      baseSearchKey: nextSearchKey,
      seq: active.seq + 1,
      mode: '1d',
      plotRequest: valid.data,
    });
  };

  const applyPlotPreset = (presetRequest: PlotRequest) => {
    setSaveStatus(null);
    const nextYClamp =
      presetRequest.yMin !== undefined || presetRequest.yMax !== undefined;
    const nextSecant = presetRequest.secant !== undefined;
    plotForm.setFieldsValue(toPlotFormValues(presetRequest));
    const valid = plotRequestSchema.safeParse(presetRequest);
    if (!valid.success) {
      setValidationError(valid.error.issues[0].message);
      return;
    }
    const nextSearchKey = clearExternalSearchIfPresent();
    setValidationError('');
    setUserState({
      ...active,
      baseSearchKey: nextSearchKey,
      seq: active.seq + 1,
      mode: '1d',
      plotRequest: valid.data,
      yClampEnabled: nextYClamp,
      secantEnabled: nextSecant,
    });
  };

  const handleToggleYClamp = (checked: boolean) => {
    const current = {
      ...toPlotFormValues(activePlotRequest),
      ...(plotForm.getFieldsValue(true) as Partial<PlotFormValues>),
    };
    const nextYMin = current.yMin ?? activePlotRequest.yMin ?? -10;
    const nextYMax = current.yMax ?? activePlotRequest.yMax ?? 10;
    if (checked) {
      plotForm.setFieldsValue({ yMin: nextYMin, yMax: nextYMax });
    }
    const candidate = buildPlotPayload(
      { ...current, yMin: nextYMin, yMax: nextYMax },
      {
        yClampEnabled: checked,
        secantEnabled: active.secantEnabled,
        sourceKnowledgeId: activePlotRequest.sourceKnowledgeId,
        sourceMistakeId: activePlotRequest.sourceMistakeId,
      },
    );
    const parsed = plotRequestSchema.safeParse(candidate);
    setValidationError('');
    setUserState({
      ...active,
      seq: active.seq + 1,
      yClampEnabled: checked,
      plotRequest: parsed.success
        ? parsed.data
        : {
            ...activePlotRequest,
            yMin: checked ? -10 : undefined,
            yMax: checked ? 10 : undefined,
          },
    });
  };

  const handleToggleSecant = (checked: boolean) => {
    const current = {
      ...toPlotFormValues(activePlotRequest),
      ...(plotForm.getFieldsValue(true) as Partial<PlotFormValues>),
    };
    const nextX0 = current.secantX0 ?? activePlotRequest.secant?.x0 ?? 0;
    const nextH =
      current.secantH && Math.abs(current.secantH) >= 1e-8
        ? current.secantH
        : (activePlotRequest.secant?.h ?? 0.5);
    if (checked) {
      plotForm.setFieldsValue({ secantX0: nextX0, secantH: nextH });
    }
    const candidate = buildPlotPayload(
      { ...current, secantX0: nextX0, secantH: nextH },
      {
        yClampEnabled: active.yClampEnabled,
        secantEnabled: checked,
        sourceKnowledgeId: activePlotRequest.sourceKnowledgeId,
        sourceMistakeId: activePlotRequest.sourceMistakeId,
      },
    );
    const parsed = plotRequestSchema.safeParse(candidate);
    setValidationError('');
    setUserState({
      ...active,
      seq: active.seq + 1,
      secantEnabled: checked,
      plotRequest: parsed.success
        ? parsed.data
        : {
            ...activePlotRequest,
            secant: checked ? { x0: 0, h: 0.5 } : undefined,
          },
    });
  };

  const handleQuickStep = (stepH: number) => {
    const current = {
      ...toPlotFormValues(activePlotRequest),
      ...(plotForm.getFieldsValue(true) as Partial<PlotFormValues>),
    };
    const nextX0 = current.secantX0 ?? activePlotRequest.secant?.x0 ?? 0;
    plotForm.setFieldsValue({ secantX0: nextX0, secantH: stepH });
    const candidate = buildPlotPayload(
      { ...current, secantX0: nextX0, secantH: stepH },
      {
        yClampEnabled: active.yClampEnabled,
        secantEnabled: true,
        sourceKnowledgeId: activePlotRequest.sourceKnowledgeId,
        sourceMistakeId: activePlotRequest.sourceMistakeId,
      },
    );
    const parsed = plotRequestSchema.safeParse(candidate);
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0].message);
      return;
    }
    setValidationError('');
    setUserState({
      ...active,
      seq: active.seq + 1,
      secantEnabled: true,
      plotRequest: parsed.data,
    });
  };

  const handleSavePlotDefault = async () => {
    try {
      const values = await plotForm.validateFields();
      const payload = buildPlotPayload(values, {
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
      const nextPrefs: Preferences = persistedPrefs.defaultSurfacePlot
        ? {
            defaultPlot: valid.data,
            defaultSurfacePlot: persistedPrefs.defaultSurfacePlot,
          }
        : { defaultPlot: valid.data };
      const writeResult = preferences.write(nextPrefs);
      const nextSearchKey = clearExternalSearchIfPresent();
      if (writeResult.ok) {
        setPersistedPrefs(nextPrefs);
        setValidationError('');
        setUserState({
          ...active,
          baseSearchKey: nextSearchKey,
          plotRequest: valid.data,
        });
      }
      setSaveStatus({
        ok: writeResult.ok,
        text: writeResult.ok
          ? '已保存到当前浏览器，下次访问绘图模块时生效。'
          : writeResult.error,
      });
    } catch {
      /* Ant Design form highlights invalid fields */
    }
  };

  const yDomain: [number | undefined, number | undefined] | undefined =
    activePlotRequest.yMin !== undefined || activePlotRequest.yMax !== undefined
      ? [activePlotRequest.yMin, activePlotRequest.yMax]
      : undefined;

  const secantResult = plotResult?.secantLine;
  const hasSlopeMismatch =
    secantResult !== undefined &&
    secantResult.leftSlope !== null &&
    secantResult.rightSlope !== null &&
    Math.abs(secantResult.leftSlope - secantResult.rightSlope) > 0.25;

  return (
    <div className={styles.plotLayout}>
      <Card title="设置函数">
        <Form
          form={plotForm}
          layout="vertical"
          initialValues={toPlotFormValues(activePlotRequest)}
          onFinish={handlePlotFinish}
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
                    className={styles.compactItemLast}
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
                    className={styles.compactItemLast}
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
                    className={styles.compactItemLast}
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
                    className={styles.compactItemLast}
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
                          activePlotRequest.secant?.h === stepVal
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
            loading={plotLoading}
          >
            绘制函数
          </Button>
        </Form>

        <Button
          className={styles.secondaryAction}
          icon={<SaveOutlined />}
          onClick={() => void handleSavePlotDefault()}
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
              onClick={() => applyPlotPreset({ expression, xMin: -5, xMax: 5 })}
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
              onClick={() => applyPlotPreset(preset.request)}
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
              to={getSafeMistakeDraftLink({
                expression: activePlotRequest.expression,
                xMin: activePlotRequest.xMin,
                xMax: activePlotRequest.xMax,
                sourceKnowledgeId: activePlotRequest.sourceKnowledgeId,
              })}
            >
              <BookOutlined /> 记入错题本
            </Link>
          </div>
        }
      >
        {plotLoading && (
          <div className={styles.chartLoading}>
            <Spin />
            <p>正在计算采样点…</p>
          </div>
        )}

        {plotError && (
          <Alert
            className={styles.errorAlert}
            type="error"
            showIcon
            title="无法绘制"
            description={plotError}
          />
        )}

        {!plotLoading && plotResult && (
          <>
            <FunctionChart
              points={plotResult.points}
              expression={activePlotRequest.expression}
              comparePoints={plotResult.comparePoints}
              compareExpression={activePlotRequest.compareExpression}
              secantLine={plotResult.secantLine}
              yDomain={yDomain}
            />
            <p className={styles.chartSummary} role="status">
              f(x) = {activePlotRequest.expression}
              {activePlotRequest.compareExpression
                ? ` · 对比 g(x) = ${activePlotRequest.compareExpression}`
                : ''}
              {' · '}区间 [{activePlotRequest.xMin}, {activePlotRequest.xMax}]
              {activePlotRequest.yMin !== undefined &&
              activePlotRequest.yMax !== undefined
                ? ` · 纵轴 [${activePlotRequest.yMin}, ${activePlotRequest.yMax}]`
                : ''}
              {' · '}
              {plotResult.points.length} 个图像点 · {plotResult.gaps} 处采样缺口
            </p>

            {plotResult.points.every((point) => point[1] === null) && (
              <Alert
                className={styles.secantAlert}
                type="warning"
                showIcon
                title="该范围内没有可显示的有限实数值，请调整表达式或范围。"
              />
            )}

            {secantResult && activePlotRequest.secant && (
              <div
                className={styles.secantCard}
                aria-label="差商与割线数值观察"
              >
                <div className={styles.secantTitleRow}>
                  <h3 className={styles.secantTitle}>
                    差商与割线数值观察（x₀ = {formatMetric(secantResult.x0)}，h
                    = {formatMetric(activePlotRequest.secant.h)}）
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
                      步长 h = {formatMetric(activePlotRequest.secant.h)}
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
                      |h| = {formatMetric(Math.abs(activePlotRequest.secant.h))}
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
  );
}

export default function PlottingPage() {
  const [search, setSearch] = useSearchParams();
  const searchKey = search.toString();

  const [stored] = useState(() =>
    preferences.read({
      defaultPlot: DEFAULT_1D,
      defaultSurfacePlot: DEFAULT_SURFACE,
    }),
  );
  const [persistedPrefs, setPersistedPrefs] = useState<Preferences>(() =>
    stored.ok ? stored.data : { defaultPlot: DEFAULT_1D },
  );

  const envResolved = useMemo(
    () => resolveEnvState(searchKey, stored),
    [searchKey, stored],
  );

  const [userState, setUserState] = useState<ActiveWorkspaceState | null>(null);
  const [validationError, setValidationError] = useState('');
  const [calc1DState, setCalc1DState] = useState<Calc1DState | null>(null);
  const [calc3DState, setCalc3DState] = useState<Calc3DState | null>(null);
  const [saveStatus, setSaveStatus] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const active =
    userState && userState.baseSearchKey === searchKey
      ? userState
      : envResolved.state;

  const activeMode = active.mode;
  const activePlotRequest = active.plotRequest;
  const activeSurfaceRequest = active.surfaceRequest;

  const request1DKey = `1d:${active.seq}:${JSON.stringify(activePlotRequest)}`;
  const request3DKey = `3d:${active.seq}:${JSON.stringify(activeSurfaceRequest)}`;

  useEffect(() => {
    if (activeMode !== '3d') return;
    const controller = new AbortController();
    calculateSurface(activeSurfaceRequest, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setCalc3DState({
            requestKey: request3DKey,
            status: 'done',
            result: data,
          });
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setCalc3DState({
            requestKey: request3DKey,
            status: 'error',
            error: cause instanceof Error ? cause.message : '三维曲面计算失败',
          });
        }
      });
    return () => controller.abort();
  }, [activeMode, activeSurfaceRequest, request3DKey]);

  useEffect(() => {
    if (activeMode !== '1d') return;
    const controller = new AbortController();
    calculatePlot(activePlotRequest, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setCalc1DState({
            requestKey: request1DKey,
            status: 'done',
            result: data,
          });
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setCalc1DState({
            requestKey: request1DKey,
            status: 'error',
            error: cause instanceof Error ? cause.message : '计算失败',
          });
        }
      });
    return () => controller.abort();
  }, [activeMode, activePlotRequest, request1DKey]);

  const clearExternalSearchIfPresent = (): string => {
    if (search.has('expression') || searchKey.length > 0) {
      setSearch({}, { replace: true });
      return '';
    }
    return searchKey;
  };

  const handleModeChange = (value: string | number) => {
    const nextMode: LabMode = value === '1d' ? '1d' : '3d';
    if (nextMode === activeMode) return;
    setSaveStatus(null);
    setValidationError('');
    const nextSearchKey = clearExternalSearchIfPresent();
    const cleanPlot: PlotRequest = {
      ...activePlotRequest,
      sourceKnowledgeId: undefined,
      sourceMistakeId: undefined,
    };
    const cleanSurface: SurfacePlotRequest = {
      ...activeSurfaceRequest,
      sourceKnowledgeId: undefined,
      sourceMistakeId: undefined,
    };
    setUserState({
      ...active,
      baseSearchKey: nextSearchKey,
      seq: active.seq + 1,
      mode: nextMode,
      plotRequest: cleanPlot,
      surfaceRequest: cleanSurface,
    });
  };

  const sourceKnowledgeId =
    activeMode === '3d'
      ? activeSurfaceRequest.sourceKnowledgeId
      : activePlotRequest.sourceKnowledgeId;
  const sourceMistakeId =
    activeMode === '3d'
      ? activeSurfaceRequest.sourceMistakeId
      : activePlotRequest.sourceMistakeId;

  const sourceCard = sourceKnowledgeId
    ? knowledgeCards.find((card) => card.id === sourceKnowledgeId)
    : undefined;

  const is3DSettled = calc3DState?.requestKey === request3DKey;
  const surfaceLoading =
    activeMode === '3d' && !validationError && !is3DSettled;
  const surfaceResult =
    activeMode === '3d' &&
    !validationError &&
    is3DSettled &&
    calc3DState.status === 'done'
      ? calc3DState.result
      : null;
  const surfaceError =
    activeMode === '3d'
      ? validationError ||
        (is3DSettled && calc3DState.status === 'error' ? calc3DState.error : '')
      : '';

  const is1DSettled = calc1DState?.requestKey === request1DKey;
  const plotLoading = activeMode === '1d' && !validationError && !is1DSettled;
  const plotResult =
    activeMode === '1d' &&
    !validationError &&
    is1DSettled &&
    calc1DState.status === 'done'
      ? calc1DState.result
      : null;
  const plotError =
    activeMode === '1d'
      ? validationError ||
        (is1DSettled && calc1DState.status === 'error' ? calc1DState.error : '')
      : '';

  return (
    <>
      <PageHeader
        eyebrow="∬ · 多元曲面与函数仿真实验室"
        title="让抽象的变化，变得看得见。"
        description="三维多元曲面旋转剖切、二重积分黎曼柱体逼近与一元函数差商分析一体化仿真。"
      />

      <div className={styles.modeBar}>
        <div className={styles.modeSegmentedWrap}>
          <Segmented
            aria-label="仿真维度模式"
            value={activeMode}
            options={[
              {
                label: '三维多元与重积分 z = f(x, y)',
                value: '3d',
              },
              {
                label: '二维一元与差商 y = f(x)',
                value: '1d',
              },
            ]}
            onChange={handleModeChange}
          />
        </div>
        <span className={styles.modeHint}>
          <AppstoreOutlined />
          {activeMode === '3d'
            ? '黎曼柱体分割求和 · 偏导截痕与切平面联动'
            : '主副函数同屏对比 · 对称差商与割线逼近'}
        </span>
      </div>

      {envResolved.warning && (
        <Alert
          type="warning"
          showIcon
          title={envResolved.warning}
          className={styles.alertGap}
        />
      )}

      {sourceKnowledgeId && (
        <Alert
          type="info"
          showIcon
          title="已接收知识导航中的示例"
          description={
            <div className={styles.bannerRow}>
              <span>
                来源卡片：{sourceCard ? sourceCard.title : sourceKnowledgeId}
              </span>
              <Link
                className={styles.bannerLink}
                to={getSafeKnowledgeLink(sourceKnowledgeId)}
              >
                <ArrowLeftOutlined /> 返回知识卡片
              </Link>
            </div>
          }
          className={styles.alertGap}
        />
      )}

      {sourceMistakeId && (
        <Alert
          type="info"
          showIcon
          title="已接收错题本中的反例函数"
          description={
            <div className={styles.bannerRow}>
              <span>来源错题：{sourceMistakeId}</span>
              <Link className={styles.bannerLink} to="/mistakes">
                <ArrowLeftOutlined /> 返回错题本
              </Link>
            </div>
          }
          className={styles.alertGap}
        />
      )}

      {activeMode === '3d' ? (
        <SurfaceWorkspace
          active={active}
          searchKey={searchKey}
          surfaceLoading={surfaceLoading}
          surfaceResult={surfaceResult}
          surfaceError={surfaceError}
          saveStatus={saveStatus}
          persistedPrefs={persistedPrefs}
          clearExternalSearchIfPresent={clearExternalSearchIfPresent}
          setValidationError={setValidationError}
          setSaveStatus={setSaveStatus}
          setPersistedPrefs={setPersistedPrefs}
          setUserState={setUserState}
        />
      ) : (
        <UnivariateWorkspace
          active={active}
          searchKey={searchKey}
          plotLoading={plotLoading}
          plotResult={plotResult}
          plotError={plotError}
          saveStatus={saveStatus}
          persistedPrefs={persistedPrefs}
          clearExternalSearchIfPresent={clearExternalSearchIfPresent}
          setValidationError={setValidationError}
          setSaveStatus={setSaveStatus}
          setPersistedPrefs={setPersistedPrefs}
          setUserState={setUserState}
        />
      )}

      <div className={styles.footerNotice}>
        <strong>观察图像 ≠ 证明结论</strong>
        <span>
          此处仅执行有限网格与黎曼数值采样：定义域外、非有限值与绝对值大于 10⁶
          的结果留空；二元极限存在性与可微性不能仅凭有限方向或网格图像判定，请务必结合严格分析定义完成证明。
        </span>
      </div>
    </>
  );
}
