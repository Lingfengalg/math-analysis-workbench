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
  BulbOutlined,
  LineChartOutlined,
  SaveOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { knowledgeCards } from '@/content/knowledge';
import {
  INTEGRAL_REGION_LABELS,
  RIEMANN_RULE_LABELS,
  TRIPLE_REGION_LABELS,
  plotRequestSchema,
  preferencesSchema,
  surfacePlotRequestSchema,
  tripleIntegralRequestSchema,
  type IntegralRegionType,
  type PlotRequest,
  type PlotResult,
  type Preferences,
  type RiemannRule,
  type SurfacePlotRequest,
  type SurfacePlotResult,
  type TripleIntegralRequest,
  type TripleIntegralResult,
  type TripleRegionType,
} from '@/shared/contracts';
import { createAssistantLink } from '@/shared/navigation/assistant-link';
import { createKnowledgeLink } from '@/shared/navigation/knowledge-link';
import { createMistakeDraftLink } from '@/shared/navigation/mistake-link';
import {
  parsePlotSearch,
  parseSurfacePlotSearch,
  parseTriplePlotSearch,
} from '@/shared/navigation/plot-link';
import { createStorage, type StorageResult } from '@/shared/storage';
import {
  calculatePlot,
  calculateSurface,
  calculateTripleIntegral,
} from '@/shared/math/client';
import { FunctionChart } from '@/shared/ui/FunctionChart';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Surface3DViewer } from '@/shared/ui/Surface3DViewer';
import { Volume3DViewer } from '@/shared/ui/Volume3DViewer';
import styles from './PlottingPage.module.css';

type LabMode = '3d' | '3d-triple' | '2d';

const DEFAULT_1D: PlotRequest = { expression: 'x^2', xMin: -5, xMax: 5 };

const DEFAULT_TRIPLE: TripleIntegralRequest = {
  expression: '1',
  regionType: 'paraboloid-cap',
  xMin: -2,
  xMax: 2,
  yMin: -2,
  yMax: 2,
  zMin: 0,
  zMax: 4,
  partitions: 12,
  sliceZ: 2,
};

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
    label: '叶形曲边域 · X-型累次积分',
    request: {
      expression: 'x + 2 * y',
      xMin: 0,
      xMax: 1,
      yDomainMin: 0,
      yDomainMax: 1,
      gridSize: 56,
      integral: {
        regionType: 'x-type',
        xStart: 0,
        xEnd: 1,
        yStart: 0,
        yEnd: 1,
        yLowerExpr: 'x^2',
        yUpperExpr: 'sqrt(x)',
        partitions: 16,
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

const TRIPLE_QUICK_PARTITIONS = [8, 12, 16, 20] as const;

const TRIPLE_REGION_NOTES: Record<TripleRegionType, string> = {
  box: '长方体域 Ω：x₀ ≤ x ≤ x₁，y₀ ≤ y ≤ y₁，z₀ ≤ z ≤ z₁（直角坐标常限三重累次积分 ∭_Ω f dx dy dz）',
  sphere:
    '球体/椭球体域 Ω：((x - x_c)/r_x)² + ((y - y_c)/r_y)² + ((z - z_c)/r_z)² ≤ 1（球面坐标 dV = ρ² sin φ dρ dφ dθ，φ ∈ [0, π]）',
  cylinder:
    '圆柱体域 Ω：((x - x_c)/r_x)² + ((y - y_c)/r_y)² ≤ 1，z₀ ≤ z ≤ z₁（柱面坐标 dV = r dr dθ dz，切勿漏乘雅可比因子 r）',
  tetrahedron:
    '四面体域 Ω：(x - x₀)/(x₁ - x₀) + (y - y₀)/(y₁ - y₀) + (z - z₀)/(z₁ - z₀) ≤ 1（x≥x₀, y≥y₀, z≥z₀，投影穿线定限）',
  'paraboloid-cap':
    '抛物面顶盖域 Ω：z₀ + (z₁ - z₀)[((x - x_c)/r_x)² + ((y - y_c)/r_y)²] ≤ z ≤ z₁（“先二后一”水平截面法：先固定 z_s 求截面积分，再沿 z 轴积分）',
};

const TRIPLE_PRESETS: ReadonlyArray<{
  label: string;
  request: TripleIntegralRequest;
}> = [
  {
    label: '抛物面顶盖 · 先二后一截面',
    request: DEFAULT_TRIPLE,
  },
  {
    label: '球体转动惯量 · 球面坐标',
    request: {
      expression: 'x^2 + y^2 + z^2',
      regionType: 'sphere',
      xMin: -2,
      xMax: 2,
      yMin: -2,
      yMax: 2,
      zMin: -2,
      zMax: 2,
      partitions: 12,
      sliceZ: 0,
    },
  },
  {
    label: '非均匀圆柱 · 柱面坐标',
    request: {
      expression: 'z * (x^2 + y^2)',
      regionType: 'cylinder',
      xMin: -2,
      xMax: 2,
      yMin: -2,
      yMax: 2,
      zMin: 0,
      zMax: 3,
      partitions: 12,
      sliceZ: 1.5,
    },
  },
  {
    label: '四面体域 · 三重累次定限',
    request: {
      expression: 'x + y + z',
      regionType: 'tetrahedron',
      xMin: 0,
      xMax: 2,
      yMin: 0,
      yMax: 2,
      zMin: 0,
      zMax: 2,
      partitions: 12,
      sliceZ: 0.8,
    },
  },
  {
    label: '长方体非均匀体密度',
    request: {
      expression: 'x^2 + y^2 + z',
      regionType: 'box',
      xMin: -1,
      xMax: 1,
      yMin: -1,
      yMax: 1,
      zMin: 0,
      zMax: 2,
      partitions: 12,
      sliceZ: 1,
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
  intYLowerExpr?: string;
  intYUpperExpr?: string;
  intXLowerExpr?: string;
  intXUpperExpr?: string;
  intPartitions?: number;
  probeX0?: number;
  probeY0?: number;
}

interface TripleFormValues {
  expression: string;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
  partitions: number;
  sliceZ?: number;
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
  tripleRequest: TripleIntegralRequest;
  tripleRegion: TripleRegionType;
  tripleSliceEnabled: boolean;
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

type CalcTripleState =
  | { requestKey: string; status: 'done'; result: TripleIntegralResult }
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
    intYLowerExpr: request.integral?.yLowerExpr ?? 'x^2',
    intYUpperExpr: request.integral?.yUpperExpr ?? 'sqrt(x)',
    intXLowerExpr: request.integral?.xLowerExpr ?? 'y^2',
    intXUpperExpr: request.integral?.xUpperExpr ?? 'sqrt(y)',
    intPartitions: request.integral?.partitions ?? 14,
    probeX0: request.probe?.x0 ?? 0,
    probeY0: request.probe?.y0 ?? 0,
  };
}

function toTripleFormValues(request: TripleIntegralRequest): TripleFormValues {
  return {
    expression: request.expression,
    xMin: request.xMin,
    xMax: request.xMax,
    yMin: request.yMin,
    yMax: request.yMax,
    zMin: request.zMin,
    zMax: request.zMax,
    partitions: request.partitions,
    sliceZ:
      request.sliceZ ?? Number(((request.zMin + request.zMax) / 2).toFixed(2)),
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
    const integralPayload: Record<string, unknown> = {
      regionType: options.integralRegion,
      xStart: values.intXStart ?? values.xMin ?? -2,
      xEnd: values.intXEnd ?? values.xMax ?? 2,
      yStart: values.intYStart ?? values.yDomainMin ?? -2,
      yEnd: values.intYEnd ?? values.yDomainMax ?? 2,
      partitions: Math.round(values.intPartitions ?? 14),
      rule: options.integralRule,
    };
    if (options.integralRegion === 'x-type') {
      const yLower = values.intYLowerExpr?.trim();
      const yUpper = values.intYUpperExpr?.trim();
      if (yLower) integralPayload.yLowerExpr = yLower;
      if (yUpper) integralPayload.yUpperExpr = yUpper;
    }
    if (options.integralRegion === 'y-type') {
      const xLower = values.intXLowerExpr?.trim();
      const xUpper = values.intXUpperExpr?.trim();
      if (xLower) integralPayload.xLowerExpr = xLower;
      if (xUpper) integralPayload.xUpperExpr = xUpper;
    }
    payload.integral = integralPayload;
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

function buildTriplePayload(
  values: Partial<TripleFormValues>,
  options: {
    regionType: TripleRegionType;
    sliceEnabled: boolean;
    sourceKnowledgeId?: string;
    sourceMistakeId?: string;
  },
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    expression: values.expression?.trim() ?? '',
    regionType: options.regionType,
    xMin: values.xMin,
    xMax: values.xMax,
    yMin: values.yMin,
    yMax: values.yMax,
    zMin: values.zMin,
    zMax: values.zMax,
    partitions: Math.round(values.partitions ?? 12),
  };
  if (options.sliceEnabled) {
    const zMin = values.zMin ?? 0;
    const zMax = values.zMax ?? 4;
    payload.sliceZ = values.sliceZ ?? Number(((zMin + zMax) / 2).toFixed(2));
  }
  if (options.sourceKnowledgeId) {
    payload.sourceKnowledgeId = options.sourceKnowledgeId;
  }
  if (options.sourceMistakeId) {
    payload.sourceMistakeId = options.sourceMistakeId;
  }
  return payload;
}

function mergePreferences(
  prev: Preferences,
  patch: Partial<Preferences>,
): Preferences {
  const next: Preferences = {
    defaultPlot: patch.defaultPlot ?? prev.defaultPlot,
  };
  const nextSurface = patch.defaultSurfacePlot ?? prev.defaultSurfacePlot;
  if (nextSurface) next.defaultSurfacePlot = nextSurface;
  const nextTriple = patch.defaultTriplePlot ?? prev.defaultTriplePlot;
  if (nextTriple) next.defaultTriplePlot = nextTriple;
  return next;
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
  const defaultTriple = stored.ok
    ? (stored.data.defaultTriplePlot ?? DEFAULT_TRIPLE)
    : DEFAULT_TRIPLE;

  const isExplicit2D =
    rawMode === '1d' ||
    rawMode === '2d' ||
    (rawMode !== '3d' && rawMode !== '3d-triple' && params.has('expression'));

  if (isExplicit2D) {
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
        mode: '2d',
        surfaceRequest: defaultSurface,
        zClampEnabled:
          defaultSurface.zMin !== undefined ||
          defaultSurface.zMax !== undefined,
        integralEnabled: defaultSurface.integral !== undefined,
        integralRegion: defaultSurface.integral?.regionType ?? 'rectangle',
        integralRule: defaultSurface.integral?.rule ?? 'midpoint',
        probeEnabled: defaultSurface.probe !== undefined,
        tripleRequest: defaultTriple,
        tripleRegion: defaultTriple.regionType,
        tripleSliceEnabled: defaultTriple.sliceZ !== undefined,
        plotRequest: initial1D,
        yClampEnabled:
          initial1D.yMin !== undefined || initial1D.yMax !== undefined,
        secantEnabled: initial1D.secant !== undefined,
      },
      warning,
    };
  }

  if (rawMode === '3d-triple') {
    const linkedTriple = parseTriplePlotSearch(params);
    const initialTriple = linkedTriple ?? defaultTriple;
    const warning =
      params.has('expression') && !linkedTriple
        ? '三重积分链接参数无效，已使用默认三重设置。'
        : !stored.ok
          ? stored.error
          : undefined;

    return {
      state: {
        baseSearchKey: searchKey,
        seq: 0,
        mode: '3d-triple',
        surfaceRequest: defaultSurface,
        zClampEnabled:
          defaultSurface.zMin !== undefined ||
          defaultSurface.zMax !== undefined,
        integralEnabled: defaultSurface.integral !== undefined,
        integralRegion: defaultSurface.integral?.regionType ?? 'rectangle',
        integralRule: defaultSurface.integral?.rule ?? 'midpoint',
        probeEnabled: defaultSurface.probe !== undefined,
        tripleRequest: initialTriple,
        tripleRegion: initialTriple.regionType,
        tripleSliceEnabled: initialTriple.sliceZ !== undefined,
        plotRequest: default1D,
        yClampEnabled:
          default1D.yMin !== undefined || default1D.yMax !== undefined,
        secantEnabled: default1D.secant !== undefined,
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
      tripleRequest: defaultTriple,
      tripleRegion: defaultTriple.regionType,
      tripleSliceEnabled: defaultTriple.sliceZ !== undefined,
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

function getSafeAssistantLink(params: {
  id?: string;
  title: string;
  summary: string;
}): string {
  try {
    return createAssistantLink({
      kind: 'plotting',
      id: params.id,
      title: params.title.slice(0, 160).trim() || '函数仿真实验',
      summary:
        params.summary.slice(0, 800).trim() || '请帮我检查当前推导的条件。',
    });
  } catch {
    return '/assistant';
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
    if (regionType === 'x-type') {
      surfaceForm.setFieldsValue({
        intYLowerExpr: current.intYLowerExpr?.trim() || 'x^2',
        intYUpperExpr: current.intYUpperExpr?.trim() || 'sqrt(x)',
      });
    } else if (regionType === 'y-type') {
      surfaceForm.setFieldsValue({
        intXLowerExpr: current.intXLowerExpr?.trim() || 'y^2',
        intXUpperExpr: current.intXUpperExpr?.trim() || 'sqrt(y)',
      });
    }
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
      const nextPrefs = mergePreferences(persistedPrefs, {
        defaultSurfacePlot: valid.data,
      });
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

                {active.integralRegion === 'x-type' && (
                  <div className={styles.rangeFields}>
                    <Form.Item
                      name="intYLowerExpr"
                      label="下边界函数 φ₁(x)"
                      className={styles.compactItem}
                      rules={[
                        {
                          required: true,
                          whitespace: true,
                          message: '请输入下边界函数 φ₁(x)',
                        },
                        { max: 120, message: '最多 120 个字符' },
                      ]}
                    >
                      <Input placeholder="例如 x^2" autoComplete="off" />
                    </Form.Item>
                    <Form.Item
                      name="intYUpperExpr"
                      label="上边界函数 φ₂(x)"
                      className={styles.compactItem}
                      rules={[
                        {
                          required: true,
                          whitespace: true,
                          message: '请输入上边界函数 φ₂(x)',
                        },
                        { max: 120, message: '最多 120 个字符' },
                      ]}
                    >
                      <Input placeholder="例如 sqrt(x)" autoComplete="off" />
                    </Form.Item>
                  </div>
                )}

                {active.integralRegion === 'y-type' && (
                  <div className={styles.rangeFields}>
                    <Form.Item
                      name="intXLowerExpr"
                      label="左边界函数 ψ₁(y)"
                      className={styles.compactItem}
                      rules={[
                        {
                          required: true,
                          whitespace: true,
                          message: '请输入左边界函数 ψ₁(y)',
                        },
                        { max: 120, message: '最多 120 个字符' },
                      ]}
                    >
                      <Input placeholder="例如 y^2" autoComplete="off" />
                    </Form.Item>
                    <Form.Item
                      name="intXUpperExpr"
                      label="右边界函数 ψ₂(y)"
                      className={styles.compactItem}
                      rules={[
                        {
                          required: true,
                          whitespace: true,
                          message: '请输入右边界函数 ψ₂(y)',
                        },
                        { max: 120, message: '最多 120 个字符' },
                      ]}
                    >
                      <Input placeholder="例如 sqrt(y)" autoComplete="off" />
                    </Form.Item>
                  </div>
                )}

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
              to={getSafeAssistantLink({
                id:
                  activeSurfaceRequest.sourceKnowledgeId ??
                  activeSurfaceRequest.sourceMistakeId,
                title: `三维仿真：z = ${activeSurfaceRequest.expression}`,
                summary: `在区域 [${activeSurfaceRequest.xMin}, ${activeSurfaceRequest.xMax}] × [${activeSurfaceRequest.yDomainMin}, ${activeSurfaceRequest.yDomainMax}] 上观察二元曲面 z = ${activeSurfaceRequest.expression}${
                  activeSurfaceRequest.integral
                    ? `，并开启了 ${INTEGRAL_REGION_LABELS[activeSurfaceRequest.integral.regionType]} 二重积分逼近`
                    : ''
                }。`,
              })}
            >
              <BulbOutlined /> 向 AI 助教追问
            </Link>
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

interface TripleWorkspaceProps {
  active: ActiveWorkspaceState;
  searchKey: string;
  tripleLoading: boolean;
  tripleResult: TripleIntegralResult | null;
  tripleError: string;
  saveStatus: { ok: boolean; text: string } | null;
  persistedPrefs: Preferences;
  clearExternalSearchIfPresent: () => string;
  setValidationError: (msg: string) => void;
  setSaveStatus: (status: { ok: boolean; text: string } | null) => void;
  setPersistedPrefs: (prefs: Preferences) => void;
  setUserState: (next: ActiveWorkspaceState) => void;
}

function TripleWorkspace({
  active,
  searchKey,
  tripleLoading,
  tripleResult,
  tripleError,
  saveStatus,
  persistedPrefs,
  clearExternalSearchIfPresent,
  setValidationError,
  setSaveStatus,
  setPersistedPrefs,
  setUserState,
}: TripleWorkspaceProps) {
  const [tripleForm] = Form.useForm<TripleFormValues>();
  const activeTripleRequest = active.tripleRequest;

  useEffect(() => {
    if (!searchKey) return;
    const linked = parseTriplePlotSearch(new URLSearchParams(searchKey));
    if (linked) {
      tripleForm.setFieldsValue(toTripleFormValues(linked));
    }
  }, [searchKey, tripleForm]);

  const getMergedTripleFormValues = (): TripleFormValues => ({
    ...toTripleFormValues(activeTripleRequest),
    ...(tripleForm.getFieldsValue(true) as Partial<TripleFormValues>),
  });

  const commitTripleCandidate = (
    candidate: Record<string, unknown>,
    overrides: Partial<ActiveWorkspaceState>,
    clearUrl = false,
  ) => {
    const valid = tripleIntegralRequestSchema.safeParse(candidate);
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
      mode: '3d-triple',
      tripleRequest: valid.data,
    });
  };

  const handleTripleFinish = (values: TripleFormValues) => {
    setSaveStatus(null);
    const merged = { ...getMergedTripleFormValues(), ...values };
    const payload = buildTriplePayload(merged, {
      regionType: active.tripleRegion,
      sliceEnabled: active.tripleSliceEnabled,
    });
    commitTripleCandidate(payload, {}, true);
  };

  const applyTriplePreset = (presetRequest: TripleIntegralRequest) => {
    setSaveStatus(null);
    const nextSliceEnabled = presetRequest.sliceZ !== undefined;
    tripleForm.setFieldsValue(toTripleFormValues(presetRequest));
    const valid = tripleIntegralRequestSchema.safeParse(presetRequest);
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
      mode: '3d-triple',
      tripleRequest: valid.data,
      tripleRegion: valid.data.regionType,
      tripleSliceEnabled: nextSliceEnabled,
    });
  };

  const handleChangeTripleRegion = (regionType: TripleRegionType) => {
    setSaveStatus(null);
    const current = getMergedTripleFormValues();
    const candidate = buildTriplePayload(current, {
      regionType,
      sliceEnabled: active.tripleSliceEnabled,
      sourceKnowledgeId: activeTripleRequest.sourceKnowledgeId,
      sourceMistakeId: activeTripleRequest.sourceMistakeId,
    });
    commitTripleCandidate(candidate, { tripleRegion: regionType });
  };

  const handleChangeTriplePartitions = (partitions: number) => {
    setSaveStatus(null);
    const current = getMergedTripleFormValues();
    tripleForm.setFieldsValue({ partitions });
    const candidate = buildTriplePayload(
      { ...current, partitions },
      {
        regionType: active.tripleRegion,
        sliceEnabled: active.tripleSliceEnabled,
        sourceKnowledgeId: activeTripleRequest.sourceKnowledgeId,
        sourceMistakeId: activeTripleRequest.sourceMistakeId,
      },
    );
    commitTripleCandidate(candidate, {});
  };

  const handleToggleSlice = (checked: boolean) => {
    setSaveStatus(null);
    const current = getMergedTripleFormValues();
    const zMin = current.zMin ?? activeTripleRequest.zMin;
    const zMax = current.zMax ?? activeTripleRequest.zMax;
    const fallbackSliceZ =
      current.sliceZ ??
      activeTripleRequest.sliceZ ??
      Number(((zMin + zMax) / 2).toFixed(2));
    if (checked) {
      tripleForm.setFieldsValue({ sliceZ: fallbackSliceZ });
    }
    const candidate = buildTriplePayload(
      { ...current, sliceZ: fallbackSliceZ },
      {
        regionType: active.tripleRegion,
        sliceEnabled: checked,
        sourceKnowledgeId: activeTripleRequest.sourceKnowledgeId,
        sourceMistakeId: activeTripleRequest.sourceMistakeId,
      },
    );
    const parsed = tripleIntegralRequestSchema.safeParse(candidate);
    setValidationError('');
    setUserState({
      ...active,
      seq: active.seq + 1,
      tripleSliceEnabled: checked,
      tripleRequest: parsed.success
        ? parsed.data
        : {
            ...activeTripleRequest,
            sliceZ: checked ? fallbackSliceZ : undefined,
          },
    });
  };

  const handleSaveTripleDefault = async () => {
    try {
      const values = await tripleForm.validateFields();
      const merged = { ...getMergedTripleFormValues(), ...values };
      const payload = buildTriplePayload(merged, {
        regionType: active.tripleRegion,
        sliceEnabled: active.tripleSliceEnabled,
      });
      const valid = tripleIntegralRequestSchema.safeParse(payload);
      if (!valid.success) {
        const message = valid.error.issues[0].message;
        setValidationError(message);
        setSaveStatus({ ok: false, text: message });
        return;
      }
      const nextPrefs = mergePreferences(persistedPrefs, {
        defaultTriplePlot: valid.data,
      });
      const writeResult = preferences.write(nextPrefs);
      const nextSearchKey = clearExternalSearchIfPresent();
      if (writeResult.ok) {
        setPersistedPrefs(nextPrefs);
        setValidationError('');
        setUserState({
          ...active,
          baseSearchKey: nextSearchKey,
          tripleRequest: valid.data,
        });
      }
      setSaveStatus({
        ok: writeResult.ok,
        text: writeResult.ok
          ? '已保存三重默认设置到当前浏览器，下次打开三重积分实验室时直接加载。'
          : writeResult.error,
      });
    } catch {
      /* Ant Design form highlights invalid fields */
    }
  };

  return (
    <div className={styles.plotLayout}>
      <Card title="三重积分空间与截面参数">
        <Form
          form={tripleForm}
          layout="vertical"
          initialValues={toTripleFormValues(activeTripleRequest)}
          onFinish={handleTripleFinish}
          requiredMark={false}
        >
          <Form.Item
            name="expression"
            label="三元被积函数 f(x, y, z)"
            rules={[
              {
                required: true,
                whitespace: true,
                message: '请输入三元被积函数 f(x, y, z)',
              },
              { max: 160, message: '表达式最多 160 个字符' },
            ]}
          >
            <Input placeholder="例如 1 或 x^2 + y^2 + z^2" autoComplete="off" />
          </Form.Item>

          <div className={styles.precisionBlock}>
            <span className={styles.quickStepLabel}>空间积分域 Ω 类型：</span>
            <Space size={[6, 6]} wrap>
              {(
                Object.entries(TRIPLE_REGION_LABELS) as Array<
                  [TripleRegionType, string]
                >
              ).map(([regionKey, regionLabel]) => (
                <Button
                  key={regionKey}
                  size="small"
                  type={
                    active.tripleRegion === regionKey ? 'primary' : 'default'
                  }
                  onClick={() => handleChangeTripleRegion(regionKey)}
                >
                  {regionLabel}
                </Button>
              ))}
            </Space>
            <div className={styles.regionFormulaBox}>
              {TRIPLE_REGION_NOTES[active.tripleRegion]}
            </div>
          </div>

          <div className={styles.rangeFields}>
            <Form.Item
              name="xMin"
              label="x 下限"
              className={styles.compactItem}
              rules={[
                { required: true, type: 'number', message: '请输入 x 下限' },
              ]}
            >
              <InputNumber min={-100} max={100} step={0.5} />
            </Form.Item>
            <Form.Item
              name="xMax"
              label="x 上限"
              className={styles.compactItem}
              rules={[
                { required: true, type: 'number', message: '请输入 x 上限' },
              ]}
            >
              <InputNumber min={-100} max={100} step={0.5} />
            </Form.Item>
          </div>

          <div className={styles.rangeFields}>
            <Form.Item
              name="yMin"
              label="y 下限"
              className={styles.compactItem}
              rules={[
                { required: true, type: 'number', message: '请输入 y 下限' },
              ]}
            >
              <InputNumber min={-100} max={100} step={0.5} />
            </Form.Item>
            <Form.Item
              name="yMax"
              label="y 上限"
              className={styles.compactItem}
              rules={[
                { required: true, type: 'number', message: '请输入 y 上限' },
              ]}
            >
              <InputNumber min={-100} max={100} step={0.5} />
            </Form.Item>
          </div>

          <div className={styles.rangeFields}>
            <Form.Item
              name="zMin"
              label="z 下限"
              className={styles.compactItem}
              rules={[
                { required: true, type: 'number', message: '请输入 z 下限' },
              ]}
            >
              <InputNumber min={-100} max={100} step={0.5} />
            </Form.Item>
            <Form.Item
              name="zMax"
              label="z 上限"
              className={styles.compactItem}
              rules={[
                { required: true, type: 'number', message: '请输入 z 上限' },
              ]}
            >
              <InputNumber min={-100} max={100} step={0.5} />
            </Form.Item>
          </div>

          <Form.Item
            name="partitions"
            label="体素分割数 N（N³，4–22）"
            className={styles.compactItem}
            rules={[
              { required: true, type: 'number', message: '请输入分割数 N' },
            ]}
          >
            <InputNumber min={4} max={22} step={1} />
          </Form.Item>

          <div className={styles.precisionBlock}>
            <span className={styles.quickStepLabel}>
              快捷三维体素加密（N×N×N）：
            </span>
            <Space size={[6, 6]} wrap>
              {TRIPLE_QUICK_PARTITIONS.map((nVal) => (
                <Button
                  key={nVal}
                  size="small"
                  type={
                    activeTripleRequest.partitions === nVal
                      ? 'primary'
                      : 'default'
                  }
                  onClick={() => handleChangeTriplePartitions(nVal)}
                >
                  {`${nVal}³`}
                </Button>
              ))}
            </Space>
          </div>

          <div className={styles.optionPanel}>
            <div className={styles.optionHeader}>
              <label
                htmlFor="triple-slice-switch"
                className={styles.optionLabel}
              >
                截面高度 z_s（先二后一水平切片）
              </label>
              <Switch
                id="triple-slice-switch"
                size="small"
                checked={active.tripleSliceEnabled}
                onChange={handleToggleSlice}
              />
            </div>
            <p className={styles.optionHint}>
              在指定高度 z = z_s 处剖出水平截面 D_z，高亮该层体素并计算截面面积
              A(z_s) 与截面通量 ∬_&#123;D_z&#125; f dσ。
            </p>
            {active.tripleSliceEnabled && (
              <div className={styles.optionBody}>
                <Form.Item
                  name="sliceZ"
                  label="截面高度 z_s"
                  className={styles.compactItemLast}
                  rules={[
                    {
                      required: true,
                      type: 'number',
                      message: '请输入截面高度 z_s',
                    },
                  ]}
                >
                  <InputNumber min={-100} max={100} step={0.2} />
                </Form.Item>
              </div>
            )}
          </div>

          <Button
            type="primary"
            htmlType="submit"
            icon={<AppstoreOutlined />}
            block
            loading={tripleLoading}
          >
            生成三重体素与截面
          </Button>
        </Form>

        <Button
          className={styles.secondaryAction}
          icon={<SaveOutlined />}
          onClick={() => void handleSaveTripleDefault()}
          block
        >
          保存三重默认设置
        </Button>

        <h3 className={styles.presetHeading}>三重积分空间预设</h3>
        <p className={styles.presetSubnote}>
          一键加载抛物面顶盖截面、球体转动惯量、柱面、四面体与长方体 5
          类典型空间域：
        </p>
        <Space size={[6, 8]} wrap>
          {TRIPLE_PRESETS.map((preset) => (
            <Button
              key={preset.label}
              size="small"
              onClick={() => applyTriplePreset(preset.request)}
            >
              {preset.label}
            </Button>
          ))}
        </Space>

        <p className={styles.smallNote}>
          支持三元变量 x、y、z 与常量 pi、e，以及常用初等函数与 min / max
          及有理常数幂运算。体素求和提供几何直观，严格计算须依据投影穿线、截面法或柱/球面坐标雅可比完成。
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
        title="三重积分空间体素与截面视口"
        extra={
          <div className={styles.chartExtra}>
            <Tag>三维体素离散逼近 · 高斯参考积分</Tag>
            <Link
              className={styles.mistakeLink}
              to={getSafeAssistantLink({
                id:
                  activeTripleRequest.sourceKnowledgeId ??
                  activeTripleRequest.sourceMistakeId,
                title: `三重积分仿真：∭ (${activeTripleRequest.expression}) dV`,
                summary: `在 ${TRIPLE_REGION_LABELS[activeTripleRequest.regionType]} [${activeTripleRequest.xMin}, ${activeTripleRequest.xMax}] × [${activeTripleRequest.yMin}, ${activeTripleRequest.yMax}] × [${activeTripleRequest.zMin}, ${activeTripleRequest.zMax}] 上计算三重积分，分割 ${activeTripleRequest.partitions}³${
                  activeTripleRequest.sliceZ !== undefined
                    ? `，截面高度 z_s = ${activeTripleRequest.sliceZ}`
                    : ''
                }。`,
              })}
            >
              <BulbOutlined /> 向 AI 助教追问
            </Link>
            <Link
              className={styles.mistakeLink}
              to={getSafeMistakeDraftLink({
                expression: activeTripleRequest.expression,
                xMin: activeTripleRequest.xMin,
                xMax: activeTripleRequest.xMax,
                sourceKnowledgeId: activeTripleRequest.sourceKnowledgeId,
              })}
            >
              <BookOutlined /> 记入错题本
            </Link>
          </div>
        }
      >
        {tripleLoading && (
          <div className={styles.chartLoading}>
            <Spin />
            <p>正在计算三重积分空间体素与水平截面…</p>
          </div>
        )}

        {tripleError && (
          <Alert
            className={styles.errorAlert}
            type="error"
            showIcon
            title="无法绘制"
            description={tripleError}
          />
        )}

        {!tripleLoading && tripleResult && (
          <>
            <Volume3DViewer
              result={tripleResult}
              request={activeTripleRequest}
            />

            <p className={styles.chartSummary} role="status">
              ∭_Ω ({activeTripleRequest.expression}) dV · 区域：
              {TRIPLE_REGION_LABELS[activeTripleRequest.regionType]} · 外接范围
              [{activeTripleRequest.xMin}, {activeTripleRequest.xMax}] × [
              {activeTripleRequest.yMin}, {activeTripleRequest.yMax}] × [
              {activeTripleRequest.zMin}, {activeTripleRequest.zMax}]
              {activeTripleRequest.sliceZ !== undefined
                ? ` · 截面 z_s = ${activeTripleRequest.sliceZ}`
                : ''}
              {' · '}分割 {activeTripleRequest.partitions}³ · 有效体素{' '}
              {tripleResult.voxels.length} 个
            </p>

            {tripleResult.voxels.length === 0 && (
              <Alert
                className={styles.secantAlert}
                type="warning"
                showIcon
                title="该空间区域内没有落入的有效体素，请调整上下限或被积函数定义域。"
              />
            )}

            <div
              className={styles.secantCard}
              aria-label="三重积分空间体素与截面看板"
            >
              <div className={styles.secantTitleRow}>
                <h3 className={styles.secantTitle}>
                  三重积分空间体素与截面实时看板（
                  {TRIPLE_REGION_LABELS[activeTripleRequest.regionType]}）
                </h3>
                <span className={styles.secantFormulaHint}>
                  分割精度 {activeTripleRequest.partitions}×
                  {activeTripleRequest.partitions}×
                  {activeTripleRequest.partitions}
                </span>
              </div>

              <div className={styles.integralMetrics}>
                <div className={styles.metricItem}>
                  <span className={styles.metricLabel}>
                    体素黎曼和 S_&#123;N³&#125;
                  </span>
                  <span className={styles.metricValue}>
                    {formatMetric(tripleResult.riemannSum)}
                  </span>
                  <span className={styles.metricSub}>
                    共 {tripleResult.voxels.length} 个有效体素
                  </span>
                </div>

                <div className={styles.metricItem}>
                  <span className={styles.metricLabel}>
                    高精度参考积分 ∭_Ω f dV
                  </span>
                  <span className={styles.metricValue}>
                    {formatMetric(tripleResult.referenceIntegral)}
                  </span>
                  <span className={styles.metricSub}>三维高斯求积参考值</span>
                </div>

                <div className={styles.metricItem}>
                  <span className={styles.metricLabel}>
                    离散逼近误差 |S_N - I|
                  </span>
                  <span className={styles.metricValue}>
                    {formatMetric(tripleResult.absError)}
                  </span>
                  <span className={styles.metricSub}>
                    体素加密后误差单调收敛
                  </span>
                </div>

                <div className={styles.metricItem}>
                  <span className={styles.metricLabel}>空间域体积与均值</span>
                  <span className={styles.metricValue}>
                    体积 {formatMetric(tripleResult.domainVolume)}
                  </span>
                  <span className={styles.metricSub}>
                    平均密度 f̄ = {formatMetric(tripleResult.meanDensity)}
                  </span>
                </div>

                <div className={styles.metricItem}>
                  <span className={styles.metricLabel}>
                    水平截面 D_z（先二后一）
                  </span>
                  <span className={styles.metricValue}>
                    {tripleResult.sliceInfo
                      ? `面积 ${formatMetric(tripleResult.sliceInfo.area)}`
                      : '未启用截面'}
                  </span>
                  <span className={styles.metricSub}>
                    {tripleResult.sliceInfo
                      ? `z_s = ${formatMetric(tripleResult.sliceInfo.z)} · 截面通量 ${formatMetric(tripleResult.sliceInfo.sliceIntegral)} · ${tripleResult.sliceInfo.voxelCount} 个高亮体素`
                      : '开启“截面高度 z_s”观察水平截面通量'}
                  </span>
                </div>
              </div>
            </div>
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
      mode: '2d',
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
      mode: '2d',
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
      const nextPrefs = mergePreferences(persistedPrefs, {
        defaultPlot: valid.data,
      });
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
              to={getSafeAssistantLink({
                id:
                  activePlotRequest.sourceKnowledgeId ??
                  activePlotRequest.sourceMistakeId,
                title: `二维函数仿真：f(x) = ${activePlotRequest.expression}`,
                summary: `在区间 [${activePlotRequest.xMin}, ${activePlotRequest.xMax}] 上观察一元函数 f(x) = ${activePlotRequest.expression}${
                  activePlotRequest.compareExpression
                    ? ` 与对比函数 g(x) = ${activePlotRequest.compareExpression}`
                    : ''
                }${
                  activePlotRequest.secant
                    ? `，并在 x₀ = ${activePlotRequest.secant.x0}, h = ${activePlotRequest.secant.h} 处观察差商割线`
                    : ''
                }。`,
              })}
            >
              <BulbOutlined /> 向 AI 助教追问
            </Link>
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
      defaultTriplePlot: DEFAULT_TRIPLE,
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
  const [calcTripleState, setCalcTripleState] =
    useState<CalcTripleState | null>(null);
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
  const activeTripleRequest = active.tripleRequest;

  const request1DKey = `2d:${active.seq}:${JSON.stringify(activePlotRequest)}`;
  const request3DKey = `3d:${active.seq}:${JSON.stringify(activeSurfaceRequest)}`;
  const requestTripleKey = `3d-triple:${active.seq}:${JSON.stringify(activeTripleRequest)}`;

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
    if (activeMode !== '3d-triple') return;
    const controller = new AbortController();
    calculateTripleIntegral(activeTripleRequest, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setCalcTripleState({
            requestKey: requestTripleKey,
            status: 'done',
            result: data,
          });
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setCalcTripleState({
            requestKey: requestTripleKey,
            status: 'error',
            error: cause instanceof Error ? cause.message : '三重积分计算失败',
          });
        }
      });
    return () => controller.abort();
  }, [activeMode, activeTripleRequest, requestTripleKey]);

  useEffect(() => {
    if (activeMode !== '2d') return;
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
    const nextMode: LabMode =
      value === '3d-triple'
        ? '3d-triple'
        : value === '2d' || value === '1d'
          ? '2d'
          : '3d';
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
    const cleanTriple: TripleIntegralRequest = {
      ...activeTripleRequest,
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
      tripleRequest: cleanTriple,
    });
  };

  const sourceKnowledgeId =
    activeMode === '3d'
      ? activeSurfaceRequest.sourceKnowledgeId
      : activeMode === '3d-triple'
        ? activeTripleRequest.sourceKnowledgeId
        : activePlotRequest.sourceKnowledgeId;
  const sourceMistakeId =
    activeMode === '3d'
      ? activeSurfaceRequest.sourceMistakeId
      : activeMode === '3d-triple'
        ? activeTripleRequest.sourceMistakeId
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

  const isTripleSettled = calcTripleState?.requestKey === requestTripleKey;
  const tripleLoading =
    activeMode === '3d-triple' && !validationError && !isTripleSettled;
  const tripleResult =
    activeMode === '3d-triple' &&
    !validationError &&
    isTripleSettled &&
    calcTripleState.status === 'done'
      ? calcTripleState.result
      : null;
  const tripleError =
    activeMode === '3d-triple'
      ? validationError ||
        (isTripleSettled && calcTripleState.status === 'error'
          ? calcTripleState.error
          : '')
      : '';

  const is1DSettled = calc1DState?.requestKey === request1DKey;
  const plotLoading = activeMode === '2d' && !validationError && !is1DSettled;
  const plotResult =
    activeMode === '2d' &&
    !validationError &&
    is1DSettled &&
    calc1DState.status === 'done'
      ? calc1DState.result
      : null;
  const plotError =
    activeMode === '2d'
      ? validationError ||
        (is1DSettled && calc1DState.status === 'error' ? calc1DState.error : '')
      : '';

  return (
    <>
      <PageHeader
        eyebrow="∬ · 多元曲面与函数仿真实验室"
        title="让抽象的变化，变得看得见。"
        description="三维多元曲面与二重积分、三重积分空间截面与一元函数差商分析三模式一体化仿真。"
      />

      <div className={styles.modeBar}>
        <div className={styles.modeSegmentedWrap}>
          <Segmented
            aria-label="仿真维度模式"
            value={activeMode}
            options={[
              {
                label: '三维多元与二重积分 z = f(x, y)',
                value: '3d',
              },
              {
                label: '三重积分空间与截面 ∭_Ω f dV',
                value: '3d-triple',
              },
              {
                label: '二维一元与差商 y = f(x)',
                value: '2d',
              },
            ]}
            onChange={handleModeChange}
          />
        </div>
        <span className={styles.modeHint}>
          <AppstoreOutlined />
          {activeMode === '3d'
            ? '黎曼柱体分割求和 · 曲边定限与切平面联动'
            : activeMode === '3d-triple'
              ? '空间体素离散逼近 · 先二后一水平截面剖切'
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
      ) : activeMode === '3d-triple' ? (
        <TripleWorkspace
          active={active}
          searchKey={searchKey}
          tripleLoading={tripleLoading}
          tripleResult={tripleResult}
          tripleError={tripleError}
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
