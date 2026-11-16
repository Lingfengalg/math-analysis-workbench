import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlotRequest, PlotResult } from '@/shared/contracts';
import type { FunctionChartProps } from '@/shared/ui/FunctionChart';
import { calculatePlot } from '@/shared/math/client';
import PlottingPage from './PlottingPage';

vi.mock('@/shared/math/client', () => ({
  calculatePlot: vi.fn(),
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

const mockedCalculatePlot = vi.mocked(calculatePlot);

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

describe('函数实验室 PlottingPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    mockedCalculatePlot.mockImplementation(async (request) =>
      buildMockPlotResult(request),
    );
  });

  it('默认加载并渲染初始函数图像与状态摘要', async () => {
    renderPlotting();

    expect(await screen.findByRole('status')).toHaveTextContent('f(x) = x^2');
    expect(
      screen.getByRole('img', { name: '函数 x^2 的采样图像' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('函数表达式 f(x)')).toHaveValue('x^2');
    expect(mockedCalculatePlot).toHaveBeenCalledWith(
      { expression: 'x^2', xMin: -5, xMax: 5 },
      expect.any(AbortSignal),
    );
    expect(screen.getByRole('link', { name: /记入错题本/ })).toHaveAttribute(
      'href',
      expect.stringContaining('/mistakes?draft=1'),
    );
  });

  it('从带 sourceKnowledgeId 的 URL 进入时显示来源卡片与返回链接，切换预设后清除旧来源并清理 URL 参数', async () => {
    const user = userEvent.setup();
    renderPlotting(
      '/plotting?expression=abs(x)&xMin=-3&xMax=3&sourceKnowledgeId=derivative-absolute',
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'f(x) = abs(x)',
    );
    expect(screen.getByText('已接收知识导航中的示例')).toBeInTheDocument();
    expect(screen.getByText(/可导与连续：逆命题不成立/)).toBeInTheDocument();
    const backLink = screen.getByRole('link', { name: /返回知识卡片/ });
    expect(backLink).toHaveAttribute(
      'href',
      '/knowledge?card=derivative-absolute',
    );
    expect(screen.getByTestId('location-search')).not.toHaveTextContent(/^$/);

    await user.click(screen.getByRole('button', { name: 'sin(x)' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('f(x) = sin(x)');
    });
    expect(
      screen.queryByText('已接收知识导航中的示例'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('location-search')).toHaveTextContent('');
    expect(mockedCalculatePlot).toHaveBeenLastCalledWith(
      { expression: 'sin(x)', xMin: -5, xMax: 5 },
      expect.any(AbortSignal),
    );
  });

  it('从带 sourceMistakeId 的 URL 进入时显示错题返回链接，手动提交新函数后清除残留状态', async () => {
    const user = userEvent.setup();
    renderPlotting(
      '/plotting?expression=1%2Fx&xMin=-4&xMax=4&sourceMistakeId=mistake-01',
    );

    expect(await screen.findByRole('status')).toHaveTextContent('f(x) = 1/x');
    expect(screen.getByText(/来源错题：mistake-01/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /返回错题本/ })).toHaveAttribute(
      'href',
      '/mistakes',
    );

    const exprInput = screen.getByLabelText('函数表达式 f(x)');
    await user.clear(exprInput);
    await user.type(exprInput, 'cos(x)');
    await user.click(screen.getByRole('button', { name: /绘制函数/ }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('f(x) = cos(x)');
    });
    expect(screen.queryByText(/来源错题：mistake-01/)).not.toBeInTheDocument();
    expect(screen.getByTestId('location-search')).toHaveTextContent('');
  });

  it('非法横轴区间（xMin >= xMax）与非法纵轴区间（yMin >= yMax）均显示明确校验错误', async () => {
    const user = userEvent.setup();
    renderPlotting();
    await screen.findByRole('status');

    const xMinInput = screen.getByLabelText('左端点');
    await user.clear(xMinInput);
    await user.type(xMinInput, '10');
    await user.click(screen.getByRole('button', { name: /绘制函数/ }));

    expect(screen.getByText('无法绘制')).toBeInTheDocument();
    expect(screen.getByText('左端点必须小于右端点')).toBeInTheDocument();

    await user.clear(xMinInput);
    await user.type(xMinInput, '-5');
    await user.click(
      screen.getByRole('switch', { name: /限制纵轴范围（防奇点压扁）/ }),
    );

    const yMinInput = screen.getByLabelText('纵轴下界');
    const yMaxInput = screen.getByLabelText('纵轴上界');
    await user.clear(yMinInput);
    await user.type(yMinInput, '15');
    await user.clear(yMaxInput);
    await user.type(yMaxInput, '5');
    await user.click(screen.getByRole('button', { name: /绘制函数/ }));

    expect(screen.getByText('无法绘制')).toBeInTheDocument();
    expect(screen.getByText('纵轴下界必须小于纵轴上界')).toBeInTheDocument();
  });

  it('开启对比函数与纵轴限制后正确向 calculatePlot 和图表传递 compareExpression、yMin、yMax', async () => {
    const user = userEvent.setup();
    renderPlotting();
    await screen.findByRole('status');

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

    const chart = await screen.findByRole('img', {
      name: '函数 sin(x) 的采样图像',
    });
    expect(chart).toHaveAttribute('data-compare', 'x - x^3/6');
    expect(chart).toHaveAttribute('data-ydomain', '[-2,2]');
    expect(screen.getByRole('status')).toHaveTextContent(
      '对比 g(x) = x - x^3/6',
    );
  });

  it('开启差商观察后展示左右差商数值与不可导提示，并支持快捷切换步长 h', async () => {
    const user = userEvent.setup();
    renderPlotting();
    await screen.findByRole('status');

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
    expect(screen.getByLabelText('步长 h')).toHaveValue('-0.01');
  });

  it('数分实验预设可一键加载夹逼与尖点实验参数', async () => {
    const user = userEvent.setup();
    renderPlotting();
    await screen.findByRole('status');

    await user.click(screen.getByRole('button', { name: '夹逼 x·sin(1/x)' }));

    await waitFor(() => {
      expect(mockedCalculatePlot).toHaveBeenLastCalledWith(
        {
          expression: 'x * sin(1/x)',
          compareExpression: 'abs(x)',
          xMin: -1,
          xMax: 1,
          yMin: -1.2,
          yMax: 1.2,
        },
        expect.any(AbortSignal),
      );
    });
  });

  it('保存默认设置写入 localStorage，且本地存储损坏时展示警告并回退默认函数', async () => {
    const user = userEvent.setup();
    const { unmount } = renderPlotting();
    await screen.findByRole('status');

    await user.click(screen.getByRole('button', { name: 'sin(x)' }));
    await user.click(screen.getByRole('button', { name: /保存默认设置/ }));

    expect(await screen.findByText(/已保存到当前浏览器/)).toBeInTheDocument();
    const rawSaved = window.localStorage.getItem('math-workbench:preferences');
    expect(rawSaved).not.toBeNull();
    expect(JSON.parse(rawSaved ?? '{}')).toEqual({
      schemaVersion: 1,
      data: {
        defaultPlot: { expression: 'sin(x)', xMin: -5, xMax: 5 },
      },
    });

    unmount();

    window.localStorage.setItem('math-workbench:preferences', '{corrupted');
    renderPlotting();

    expect(await screen.findByText(/无法读取本地数据/)).toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent('f(x) = x^2');
  });
});
