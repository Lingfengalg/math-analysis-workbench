import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PlotRequest,
  PlotResult,
  SurfacePlotRequest,
  SurfacePlotResult,
} from '@/shared/contracts';
import type { FunctionChartProps } from '@/shared/ui/FunctionChart';
import type { Surface3DViewerProps } from '@/shared/ui/Surface3DViewer';
import { calculatePlot, calculateSurface } from '@/shared/math/client';
import PlottingPage from './PlottingPage';

vi.mock('@/shared/math/client', () => ({
  calculatePlot: vi.fn(),
  calculateSurface: vi.fn(),
}));

vi.mock('@/shared/ui/FunctionChart', () => ({
  FunctionChart: ({
    expression,
    compareExpression,
    yDomain,
    secantLine,
  }: FunctionChartProps) => (
    <div
      role="img"
      aria-label={`函数 ${expression} 的采样图像`}
      data-compare={compareExpression ?? ''}
      data-ydomain={yDomain ? JSON.stringify(yDomain) : ''}
      data-secant-slope={
        secantLine && secantLine.slope !== null ? String(secantLine.slope) : ''
      }
    />
  ),
}));

vi.mock('@/shared/ui/Surface3DViewer', () => ({
  Surface3DViewer: ({
    expression,
    xDomain,
    yDomain,
    zDomain,
    integralConfig,
  }: Surface3DViewerProps) => (
    <div
      role="img"
      aria-label={`二元函数 ${expression} 的三维曲面图像`}
      data-xdomain={JSON.stringify(xDomain)}
      data-ydomain={JSON.stringify(yDomain)}
      data-zdomain={zDomain ? JSON.stringify(zDomain) : ''}
      data-integral-region={integralConfig?.regionType ?? ''}
      data-integral-partitions={
        integralConfig ? String(integralConfig.partitions) : ''
      }
    />
  ),
}));

const mockedCalculatePlot = vi.mocked(calculatePlot);
const mockedCalculateSurface = vi.mocked(calculateSurface);

function buildMockPlotResult(request: PlotRequest): PlotResult {
  const result: PlotResult = {
    points: [
      [request.xMin, 1],
      [(request.xMin + request.xMax) / 2, 0],
      [request.xMax, 1],
    ],
    gaps: 0,
  };
  if (request.compareExpression) {
    result.comparePoints = [
      [request.xMin, 0.5],
      [request.xMax, 0.5],
    ];
  }
  if (request.secant) {
    const { x0, h } = request.secant;
    const isAbs = request.expression.includes('abs');
    const leftSlope = isAbs ? -1 : -Math.abs(h);
    const rightSlope = isAbs ? 1 : Math.abs(h);
    const slope = h < 0 ? leftSlope : rightSlope;
    result.secantLine = {
      points: [
        [request.xMin, slope * (request.xMin - x0)],
        [request.xMax, slope * (request.xMax - x0)],
      ],
      x0,
      y0: 0,
      x1: x0 + h,
      y1: slope * h,
      slope,
      leftSlope,
      rightSlope,
    };
  }
  return result;
}

function buildMockSurfaceResult(
  request: SurfacePlotRequest,
): SurfacePlotResult {
  const validCount = request.gridSize * request.gridSize;
  const result: SurfacePlotResult = {
    gridX: [request.xMin, request.xMax],
    gridY: [request.yDomainMin, request.yDomainMax],
    zValues: [1, 1.5, 1.5, 2],
    validCount,
    gaps: 0,
    zDataMin: 0,
    zDataMax: 2,
  };
  if (request.integral) {
    const { partitions, xStart, xEnd, yStart, yEnd, regionType } =
      request.integral;
    const boxArea = (xEnd - xStart) * (yEnd - yStart);
    const domainArea =
      regionType === 'disk'
        ? Number(((Math.PI * boxArea) / 4).toFixed(6))
        : regionType === 'triangle'
          ? boxArea / 2
          : boxArea;
    const referenceIntegral = 21.333333;
    const absError = Number((1.2 / partitions).toFixed(6));
    const riemannSum = Number((referenceIntegral + absError).toFixed(6));
    result.integralResult = {
      prisms: Array.from({ length: partitions * partitions }, (_, idx) => ({
        x: xStart + idx * 0.01,
        y: yStart + idx * 0.01,
        dx: (xEnd - xStart) / partitions,
        dy: (yEnd - yStart) / partitions,
        z: 1.5,
      })),
      riemannSum,
      positiveVolume: riemannSum,
      negativeVolume: 0,
      referenceIntegral,
      absError,
      domainArea,
      meanValue: Number((referenceIntegral / domainArea).toFixed(6)),
    };
  }
  if (request.probe) {
    const { x0, y0 } = request.probe;
    const fx = 2 * x0;
    const fy = -2 * y0;
    const z0 = x0 * x0 - y0 * y0;
    const gradNorm = Math.hypot(fx, fy);
    result.probeResult = {
      x0,
      y0,
      z0,
      fx,
      fy,
      gradNorm,
      sliceX: [
        [request.xMin, 1],
        [request.xMax, 1],
      ],
      sliceY: [
        [request.yDomainMin, -1],
        [request.yDomainMax, -1],
      ],
    };
  }
  return result;
}

function LocationSearchProbe() {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
}

function renderPlotting(initialEntry = '/plotting') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocationSearchProbe />
      <PlottingPage />
    </MemoryRouter>,
  );
}

describe('多元曲面与函数仿真实验室 PlottingPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    mockedCalculatePlot.mockImplementation(async (request) =>
      buildMockPlotResult(request),
    );
    mockedCalculateSurface.mockImplementation(async (request) =>
      buildMockSurfaceResult(request),
    );
  });

  it('默认进入旗舰三维多元模式，渲染曲顶抛物面与二重积分黎曼柱体看板，并支持区域切换与分割加密', async () => {
    const user = userEvent.setup();
    renderPlotting();

    expect(
      screen.getByRole('heading', { level: 1, name: /让抽象的变化/ }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent(
      'z = f(x, y) = 2 - 0.25 * (x^2 + y^2)',
    );
    expect(
      screen.getByRole('img', {
        name: '二元函数 2 - 0.25 * (x^2 + y^2) 的三维曲面图像',
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('多元函数表达式 f(x, y)')).toHaveValue(
      '2 - 0.25 * (x^2 + y^2)',
    );
    expect(mockedCalculateSurface).toHaveBeenCalledWith(
      {
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
      expect.any(AbortSignal),
    );

    const integralBoard = screen.getByLabelText('二重积分黎曼柱体量化看板');
    expect(integralBoard).toBeInTheDocument();
    expect(screen.getByText('21.333333')).toBeInTheDocument();
    expect(screen.getByText(/分割 14×14 · 共 196 根柱体/)).toBeInTheDocument();

    // 切换圆域极坐标并展示对应不等式说明
    await user.click(
      screen.getByRole('button', { name: '圆域（极坐标变换）' }),
    );
    expect(screen.getByText(/极坐标变换 dx dy = r dr dθ/)).toBeInTheDocument();
    await waitFor(() => {
      expect(mockedCalculateSurface).toHaveBeenLastCalledWith(
        expect.objectContaining({
          integral: expect.objectContaining({
            regionType: 'disk',
          }),
        }),
        expect.any(AbortSignal),
      );
    });

    // 点击快捷加密 32×32
    await user.click(screen.getByRole('button', { name: '32×32' }));
    await waitFor(() => {
      expect(mockedCalculateSurface).toHaveBeenLastCalledWith(
        expect.objectContaining({
          integral: expect.objectContaining({
            regionType: 'disk',
            partitions: 32,
          }),
        }),
        expect.any(AbortSignal),
      );
    });
    expect(
      await screen.findByText(/分割 32×32 · 共 1024 根柱体/),
    ).toBeInTheDocument();
  });

  it('支持多元微积分预设（高斯圆域与马鞍面驻点切平面）及三维区间合法性校验', async () => {
    const user = userEvent.setup();
    renderPlotting();
    await screen.findByRole('status');

    // 切换至双曲马鞍面 · 驻点切平面预设
    await user.click(
      screen.getByRole('button', { name: '双曲马鞍面 · 驻点切平面' }),
    );

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'z = f(x, y) = x^2 - y^2',
      );
    });
    expect(screen.getByLabelText('偏导数与切平面实时看板')).toBeInTheDocument();
    expect(screen.getByText(/切平面线性近似方程：/)).toBeInTheDocument();

    // 切换快捷观察点 (1, -1) 对比非驻点切平面斜率
    await user.click(screen.getByRole('button', { name: '对比点 (1, -1)' }));
    await waitFor(() => {
      expect(mockedCalculateSurface).toHaveBeenLastCalledWith(
        expect.objectContaining({
          expression: 'x^2 - y^2',
          probe: { x0: 1, y0: -1 },
        }),
        expect.any(AbortSignal),
      );
    });

    // 校验三维定义域与竖轴范围错误
    const xMinInput = screen.getByLabelText('x 左端点');
    await user.clear(xMinInput);
    await user.type(xMinInput, '8');
    await user.click(screen.getByRole('button', { name: /生成三维曲面/ }));

    expect(screen.getByText('无法绘制')).toBeInTheDocument();
    expect(screen.getByText('x 左端点必须小于右端点')).toBeInTheDocument();

    await user.clear(xMinInput);
    await user.type(xMinInput, '-2.5');
    await user.click(
      screen.getByRole('switch', { name: /限制竖轴 z 范围（防奇点拉伸）/ }),
    );
    const zMinInput = screen.getByLabelText('z 下界');
    const zMaxInput = screen.getByLabelText('z 上界');
    await user.clear(zMinInput);
    await user.type(zMinInput, '10');
    await user.clear(zMaxInput);
    await user.type(zMaxInput, '2');
    await user.click(screen.getByRole('button', { name: /生成三维曲面/ }));

    expect(screen.getByText('z 轴下界必须小于上界')).toBeInTheDocument();
  });

  it('从 ?mode=3d 知识卡片链接进入时激活三维模式，从一元 ?expression=... 链接进入时自动激活二维模式并支持清理旧来源', async () => {
    const user = userEvent.setup();
    const { unmount } = renderPlotting(
      '/plotting?mode=3d&expression=exp(-(x%5E2%2By%5E2))&xMin=-2.5&xMax=2.5&yDomainMin=-2.5&yDomainMax=2.5&gridSize=64&intRegion=disk&intX0=-2&intX1=2&intY0=-2&intY1=2&intN=18&intRule=midpoint&sourceKnowledgeId=integral-double-riemann',
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'z = f(x, y) = exp(-(x^2+y^2))',
    );
    expect(screen.getByText('已接收知识导航中的示例')).toBeInTheDocument();
    expect(
      screen.getByText(/二重积分与累次定限：曲顶柱体体积及极坐标雅可比因子/),
    ).toBeInTheDocument();

    // 切换多元预设后清除旧来源与 URL 参数
    await user.click(
      screen.getByRole('button', { name: '二元极限反例 · 方向脊线' }),
    );
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'z = f(x, y) = (x * y) / (x^2 + y^2)',
      );
    });
    expect(
      screen.queryByText('已接收知识导航中的示例'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('location-search')).toHaveTextContent('');

    unmount();

    // 一元卡片链接（不含 mode=3d）自动激活二维模式
    renderPlotting(
      '/plotting?expression=abs(x)&xMin=-3&xMax=3&sourceKnowledgeId=derivative-absolute',
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'f(x) = abs(x)',
    );
    expect(screen.getByText('已接收知识导航中的示例')).toBeInTheDocument();
    expect(screen.getByText(/可导与连续：逆命题不成立/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /返回知识卡片/ })).toHaveAttribute(
      'href',
      '/knowledge?card=derivative-absolute',
    );

    await user.click(screen.getByRole('button', { name: 'sin(x)' }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('f(x) = sin(x)');
    });
    expect(
      screen.queryByText('已接收知识导航中的示例'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('location-search')).toHaveTextContent('');
  });

  it('支持手动切换至二维一元模式进行对比函数、纵轴保护与差商割线实验', async () => {
    const user = userEvent.setup();
    renderPlotting();
    await screen.findByRole('status');

    await user.click(screen.getByText('二维一元与差商 y = f(x)'));

    expect(await screen.findByRole('status')).toHaveTextContent('f(x) = x^2');
    expect(
      screen.getByRole('img', { name: '函数 x^2 的采样图像' }),
    ).toBeInTheDocument();

    // 测试对比函数与纵轴限制
    const exprInput = screen.getByLabelText('函数表达式 f(x)');
    await user.clear(exprInput);
    await user.type(exprInput, 'sin(x)');
    const compareInput = screen.getByLabelText('对比函数 g(x)（可选）');
    await user.type(compareInput, 'x - x^3/6');
    await user.click(
      screen.getByRole('switch', { name: /限制纵轴范围（防奇点压扁）/ }),
    );
    const yMinInput = screen.getByLabelText('纵轴下界');
    const yMaxInput = screen.getByLabelText('纵轴上界');
    await user.clear(yMinInput);
    await user.type(yMinInput, '-2');
    await user.clear(yMaxInput);
    await user.type(yMaxInput, '2');
    await user.click(screen.getByRole('button', { name: /绘制函数/ }));

    await waitFor(() => {
      expect(mockedCalculatePlot).toHaveBeenLastCalledWith(
        {
          expression: 'sin(x)',
          compareExpression: 'x - x^3/6',
          xMin: -5,
          xMax: 5,
          yMin: -2,
          yMax: 2,
        },
        expect.any(AbortSignal),
      );
    });

    // 测试差商与割线观察
    await user.click(screen.getByRole('button', { name: 'abs(x)' }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('f(x) = abs(x)');
    });
    await user.click(screen.getByRole('switch', { name: /差商与割线观察/ }));
    expect(
      await screen.findByLabelText('差商与割线数值观察'),
    ).toBeInTheDocument();
    expect(screen.getByText('左 -1 / 右 1')).toBeInTheDocument();
    expect(
      screen.getByText(
        '左右差商不一致，提示该点可能不可导，请用导数定义严格论证',
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '-0.01' }));
    await waitFor(() => {
      expect(mockedCalculatePlot).toHaveBeenLastCalledWith(
        {
          expression: 'abs(x)',
          xMin: -5,
          xMax: 5,
          secant: { x0: 0, h: -0.01 },
        },
        expect.any(AbortSignal),
      );
    });
  });

  it('支持保存三维与二维默认设置写入 localStorage，且本地存储损坏时展示警告并回退默认场景', async () => {
    const user = userEvent.setup();
    const { unmount } = renderPlotting();
    await screen.findByRole('status');

    // 保存三维默认设置
    await user.click(
      screen.getByRole('button', { name: '高斯钟形 · 圆域极坐标' }),
    );
    await user.click(screen.getByRole('button', { name: /保存三维默认设置/ }));
    expect(
      await screen.findByText(/已保存三维默认设置到当前浏览器/),
    ).toBeInTheDocument();

    // 切换到二维并保存二维默认设置，验证二者共存不互冲
    await user.click(screen.getByText('二维一元与差商 y = f(x)'));
    await screen.findByRole('status');
    await user.click(screen.getByRole('button', { name: 'sin(x)' }));
    await user.click(screen.getByRole('button', { name: /保存默认设置/ }));
    expect(await screen.findByText(/已保存到当前浏览器/)).toBeInTheDocument();

    const rawSaved = window.localStorage.getItem('math-workbench:preferences');
    expect(rawSaved).not.toBeNull();
    const parsedSaved = JSON.parse(rawSaved ?? '{}');
    expect(parsedSaved.data.defaultPlot).toEqual({
      expression: 'sin(x)',
      xMin: -5,
      xMax: 5,
    });
    expect(parsedSaved.data.defaultSurfacePlot).toMatchObject({
      expression: 'exp(-(x^2 + y^2))',
      gridSize: 64,
    });

    unmount();

    // 存储损坏时回退默认三维曲顶抛物面并显示警告
    window.localStorage.setItem('math-workbench:preferences', '{corrupted');
    renderPlotting();

    expect(await screen.findByText(/无法读取本地数据/)).toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent(
      'z = f(x, y) = 2 - 0.25 * (x^2 + y^2)',
    );
  });

  it('支持曲面采样精度切换、三角形域不等式提示、取样规则切换与同步当前定义域，以及错题反例来源横幅', async () => {
    const user = userEvent.setup();
    renderPlotting(
      '/plotting?mode=3d&expression=x%2B2*y%2B1&xMin=-1&xMax=3&yDomainMin=-1&yDomainMax=3&gridSize=48&intRegion=triangle&intX0=0&intX1=2&intY0=0&intY1=2&intN=12&intRule=midpoint&sourceMistakeId=mistake-3d-01',
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'z = f(x, y) = x+2*y+1',
    );
    expect(screen.getByText(/来源错题：mistake-3d-01/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /返回错题本/ })).toHaveAttribute(
      'href',
      '/mistakes',
    );
    expect(screen.getByText(/三角形域不等式 D：a ≤ x ≤ b/)).toBeInTheDocument();

    // 切换曲面采样精度与黎曼取样规则，并同步当前定义域
    await user.click(screen.getByRole('button', { name: '精细 64×64' }));
    await user.click(screen.getByRole('button', { name: '左下端点' }));
    await user.click(screen.getByRole('button', { name: /同步当前定义域/ }));

    await waitFor(() => {
      expect(mockedCalculateSurface).toHaveBeenLastCalledWith(
        expect.objectContaining({
          gridSize: 64,
          integral: {
            regionType: 'triangle',
            xStart: -1,
            xEnd: 3,
            yStart: -1,
            yEnd: 3,
            partitions: 12,
            rule: 'lower-left',
          },
        }),
        expect.any(AbortSignal),
      );
    });
  });
});
