import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { knowledgeCards } from '@/content/knowledge';
import KnowledgePage from './KnowledgePage';

const totalPlotLinks = knowledgeCards.reduce(
  (sum, card) =>
    sum + card.examples.filter((example) => Boolean(example.plot)).length,
  0,
);

const totalSurfacePlotLinks = knowledgeCards.reduce(
  (sum, card) =>
    sum +
    card.examples.filter((example) => Boolean(example.surfacePlot)).length,
  0,
);

const totalTriplePlotLinks = knowledgeCards.reduce(
  (sum, card) =>
    sum + card.examples.filter((example) => Boolean(example.triplePlot)).length,
  0,
);

describe('知识导航', () => {
  it('能搜索 18 张知识卡片、展示一元/三维曲面/三重积分仿真与问 AI 助教入口并支持空状态', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <KnowledgePage />
      </MemoryRouter>,
    );
    expect(
      screen.getByText(/18 张核心知识卡片 · 5 大数分板块/),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /去绘图中观察/ })).toHaveLength(
      totalPlotLinks,
    );
    expect(
      screen.getAllByRole('link', { name: /去三维绘图中仿真/ }),
    ).toHaveLength(totalSurfacePlotLinks);
    expect(
      screen.getAllByRole('link', { name: /去三重积分实验室仿真/ }),
    ).toHaveLength(totalTriplePlotLinks);
    expect(screen.getAllByRole('link', { name: /问 AI 助教/ })).toHaveLength(
      18,
    );
    expect(screen.getAllByRole('link', { name: /记入错题本/ })).toHaveLength(
      18,
    );

    const search = screen.getByRole('textbox', { name: '搜索知识卡片' });
    await user.type(search, '可导与连续');
    expect(screen.getAllByRole('link', { name: /去绘图中观察/ })).toHaveLength(
      1,
    );

    await user.clear(search);
    await user.type(search, '不存在的知识点');
    expect(screen.getByText(/没有找到匹配的知识点/)).toBeInTheDocument();
  }, 15000);

  it('支持全字段大小写不敏感检索（含多元曲面、三重积分表达式、格林公式与易错点）', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <KnowledgePage />
      </MemoryRouter>,
    );
    const search = screen.getByRole('textbox', { name: '搜索知识卡片' });

    await user.type(search, '1/X');
    expect(screen.getByText('连续性：先检查定义域')).toBeInTheDocument();
    expect(
      screen.getByText('反常积分敛散性：无穷区间与瑕积分对偶'),
    ).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, '洛必达 振荡');
    expect(
      screen.getByText('洛必达法则：充分条件而非充要条件'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /记入错题本/ })).toHaveLength(1);

    await user.clear(search);
    await user.type(search, 'EXP(-(X^2 + Y^2))');
    expect(
      screen.getByText('二重积分与累次定限：曲顶柱体体积及极坐标雅可比因子'),
    ).toBeInTheDocument();
    const surfaceLinks = screen.getAllByRole('link', {
      name: /去三维绘图中仿真/,
    });
    expect(surfaceLinks).toHaveLength(2);
    expect(surfaceLinks[0]).toHaveAttribute(
      'href',
      expect.stringContaining('mode=3d'),
    );
    expect(surfaceLinks[0]).toHaveAttribute(
      'href',
      expect.stringContaining('sourceKnowledgeId=integral-double-riemann'),
    );

    await user.clear(search);
    await user.type(search, 'X^2 + Y^2 + Z^2');
    expect(
      screen.getByText('三重积分：投影穿线法、截面法与柱球坐标雅可比'),
    ).toBeInTheDocument();
    const tripleLinks = screen.getAllByRole('link', {
      name: /去三重积分实验室仿真/,
    });
    expect(tripleLinks).toHaveLength(2);
    expect(tripleLinks[0]).toHaveAttribute(
      'href',
      expect.stringContaining('mode=3d-triple'),
    );
    expect(tripleLinks[0]).toHaveAttribute(
      'href',
      expect.stringContaining('sourceKnowledgeId=integral-triple-space'),
    );
    const tutorLink = screen.getByRole('link', { name: /问 AI 助教/ });
    expect(tutorLink).toHaveAttribute(
      'href',
      expect.stringContaining('ctxKind=knowledge'),
    );
    expect(tutorLink).toHaveAttribute(
      'href',
      expect.stringContaining('ctxId=integral-triple-space'),
    );
  }, 15000);

  it('支持按路由参数筛选主题，未知主题回退到全部 18 张卡片', () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/knowledge?topic=derivative']}>
        <KnowledgePage />
      </MemoryRouter>,
    );
    expect(screen.getByText('可导与连续：逆命题不成立')).toBeInTheDocument();
    expect(
      screen.getByText('洛必达法则：充分条件而非充要条件'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('二元极限与偏导：沿直线趋近相等不代表二重极限存在'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('偏导存在、连续与可微：全微分的真正条件'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('多元极值与拉格朗日乘数法：驻点判别式 AC-B²'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('函数极限：靠近，而非到达'),
    ).not.toBeInTheDocument();
    unmount();

    render(
      <MemoryRouter initialEntries={['/knowledge?topic=unknown']}>
        <KnowledgePage />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('link', { name: /记入错题本/ })).toHaveLength(
      18,
    );
  });

  it('支持 ?card=derivative-absolute 精确聚焦卡片、跨卡片跳转关联概念及恢复全部', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/knowledge?card=derivative-absolute']}>
        <KnowledgePage />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(/当前聚焦知识卡片：可导与连续：逆命题不成立/),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /记入错题本/ })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: /问 AI 助教/ })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: /去绘图中观察/ })).toHaveLength(
      1,
    );
    expect(
      screen.queryByText('函数极限：靠近，而非到达'),
    ).not.toBeInTheDocument();

    const mistakeLink = screen.getByRole('link', { name: /记入错题本/ });
    expect(mistakeLink).toHaveAttribute(
      'href',
      expect.stringContaining('relatedKnowledgeId=derivative-absolute'),
    );
    expect(mistakeLink).toHaveAttribute(
      'href',
      expect.stringContaining('expression=abs%28x%29'),
    );

    const relatedLink = screen.getByRole('link', {
      name: /拉格朗日中值定理：闭区间连续，开区间可导/,
    });
    expect(relatedLink).toHaveAttribute(
      'href',
      '/knowledge?topic=derivative&card=derivative-mean-value',
    );
    await user.click(relatedLink);

    expect(
      screen.getByText(
        /当前聚焦知识卡片：拉格朗日中值定理：闭区间连续，开区间可导/,
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '查看全部知识卡片' }));
    expect(screen.queryByText(/当前聚焦知识卡片：/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /记入错题本/ })).toHaveLength(
      18,
    );
  });
});
