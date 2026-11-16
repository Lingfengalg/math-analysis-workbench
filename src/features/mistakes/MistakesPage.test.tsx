import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import katex from 'katex';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { starterMistakes } from '@/content/mistakes/starter';
import { mistakeItemSchema } from '@/shared/contracts';
import { compileExpression } from '@/shared/math/sample';
import MistakesPage from './MistakesPage';

const STORAGE_KEY = 'math-workbench:mistakes';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver =
    ResizeObserverMock as unknown as typeof ResizeObserver;
}

const nativeGetComputedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = (elt: Element) => nativeGetComputedStyle(elt);

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="current-search">{location.search}</div>;
}

function renderMistakes(initialEntry = '/mistakes') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocationProbe />
      <MistakesPage />
    </MemoryRouter>,
  );
}

describe('错题本模块与典型错题库', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('内置 4 道典型错题符合契约、KaTeX 严格渲染零报错且反例表达式通过白名单', () => {
    expect(starterMistakes).toHaveLength(4);
    expect(new Set(starterMistakes.map((item) => item.id)).size).toBe(4);

    for (const item of starterMistakes) {
      expect(mistakeItemSchema.safeParse(item).success).toBe(true);
      if (item.formula) {
        expect(() =>
          katex.renderToString(item.formula!, {
            throwOnError: true,
            trust: false,
            strict: 'error',
          }),
        ).not.toThrow();
      }
      if (item.counterexamplePlot) {
        expect(() =>
          compileExpression(item.counterexamplePlot!.expression),
        ).not.toThrow();
      }
    }
  });

  it('展示初始空状态，点击“载入典型错题示例”加载 4 道错题并持久化到 localStorage', async () => {
    const user = userEvent.setup();
    renderMistakes();

    expect(
      screen.getByRole('region', { name: '错题本空状态' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /记录新错题/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /载入典型错题示例/ }));

    expect(
      screen.getByRole('article', {
        name: '误用洛必达法则判定振荡型极限不存在',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('article', {
        name: '跨越无界奇点直接套用牛顿-莱布尼茨公式',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('article', {
        name: '把“连续”误当成“可导”的充分条件',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('article', {
        name: '在加减运算中盲目使用一阶等价无穷小相消',
      }),
    ).toBeInTheDocument();

    expect(screen.getAllByRole('link', { name: /复习关联概念/ })).toHaveLength(
      4,
    );
    expect(
      screen.getAllByRole('link', { name: /去绘图中验证反例/ }),
    ).toHaveLength(4);

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const persisted = JSON.parse(raw!);
    expect(persisted.schemaVersion).toBe(1);
    expect(persisted.data.items).toHaveLength(4);
  });

  it('支持新建错题表单校验、创建、公式实时预览、编辑、状态切换与二次确认删除', async () => {
    const user = userEvent.setup();
    renderMistakes();

    await user.click(screen.getByRole('button', { name: /记录新错题/ }));
    const dialog = screen.getByRole('dialog', { name: '记录新错题' });

    await user.click(within(dialog).getByRole('button', { name: /保存错题/ }));
    expect(
      await within(dialog).findByText('请输入错题标题'),
    ).toBeInTheDocument();

    await user.type(
      within(dialog).getByLabelText('错题标题'),
      '忽略去心邻域直接代入孤立点',
    );
    await user.type(
      within(dialog).getByLabelText('题目背景'),
      '讨论函数在 x = 0 处的极限与函数值关系。',
    );
    await user.type(
      within(dialog).getByLabelText('核心公式 LaTeX（可选）'),
      '\\lim_{{x\\to 0}\\frac{{\\sin x}{{x}=1',
    );
    expect(within(dialog).getByLabelText('公式实时预览')).toBeInTheDocument();

    await user.type(
      within(dialog).getByLabelText('当时的错误思路'),
      '直接将 x = 0 代入分式导致 0/0 无定义便认为无极限。',
    );
    await user.type(
      within(dialog).getByLabelText('严谨订正与条件核查'),
      '函数极限只考察 x 在 0 的去心邻域内的变化趋势，不要求 x = 0 处有定义。',
    );
    await user.type(
      within(dialog).getByLabelText('反例函数表达式（可选）'),
      'sin(x) / x',
    );

    await user.click(within(dialog).getByRole('button', { name: /保存错题/ }));

    const card = await screen.findByRole('article', {
      name: '忽略去心邻域直接代入孤立点',
    });
    expect(
      within(card).getByRole('link', { name: /去绘图中验证反例/ }),
    ).toHaveAttribute('href', expect.stringContaining('expression=sin'));

    // 快捷切换掌握状态
    await user.click(within(card).getByText('已掌握'));
    const updatedStore = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(updatedStore.data.items[0].status).toBe('mastered');

    // 编辑已有错题
    await user.click(within(card).getByRole('button', { name: /编辑/ }));
    const editDialog = screen.getByRole('dialog', { name: '编辑错题记录' });
    const titleInput = within(editDialog).getByLabelText('错题标题');
    await user.clear(titleInput);
    await user.type(titleInput, '混淆去心邻域极限与函数值（已订正）');
    await user.click(
      within(editDialog).getByRole('button', { name: /保存修改/ }),
    );

    const editedCard = await screen.findByRole('article', {
      name: '混淆去心邻域极限与函数值（已订正）',
    });
    expect(editedCard).toBeInTheDocument();

    // 二次确认删除
    await user.click(within(editedCard).getByRole('button', { name: /删除/ }));
    expect(within(editedCard).getByText('确认删除？')).toBeInTheDocument();
    await user.click(
      within(editedCard).getByRole('button', { name: '确认删除' }),
    );

    expect(
      screen.queryByRole('article', {
        name: '混淆去心邻域极限与函数值（已订正）',
      }),
    ).not.toBeInTheDocument();
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)!).data.items,
    ).toHaveLength(0);
  });

  it('支持按知识主题、错因标签、掌握状态筛选以及不区分大小写关键词搜索', async () => {
    const user = userEvent.setup();
    renderMistakes();

    await user.click(screen.getByRole('button', { name: /载入典型错题示例/ }));
    expect(screen.getAllByRole('article')).toHaveLength(4);

    // 按主题筛选：积分学
    const topicSegmented = screen.getByLabelText('按主题筛选');
    await user.click(within(topicSegmented).getByText('积分学'));
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(
      screen.getByRole('article', {
        name: '跨越无界奇点直接套用牛顿-莱布尼茨公式',
      }),
    ).toBeInTheDocument();

    await user.click(within(topicSegmented).getByText('全部主题'));
    expect(screen.getAllByRole('article')).toHaveLength(4);

    // 按掌握状态筛选：复习中
    const statusSegmented = screen.getByLabelText('按掌握状态筛选');
    await user.click(within(statusSegmented).getByText('复习中'));
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(
      screen.getByRole('article', {
        name: '把“连续”误当成“可导”的充分条件',
      }),
    ).toBeInTheDocument();

    await user.click(within(statusSegmented).getByText('全部状态'));

    // 按错因标签筛选：混淆命题与逆命题
    const errorSelect = screen.getByRole('combobox', {
      name: '按错因标签筛选',
    });
    await user.click(errorSelect);
    await user.click(await screen.findByTitle('混淆命题与逆命题'));
    expect(screen.getAllByRole('article')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: '清空筛选' }));
    expect(screen.getAllByRole('article')).toHaveLength(4);

    // 关键词搜索（不区分大小写）
    const searchBox = screen.getByRole('textbox', { name: '搜索错题' });
    await user.type(searchBox, 'TAN X');
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(
      screen.getByRole('article', {
        name: '在加减运算中盲目使用一阶等价无穷小相消',
      }),
    ).toBeInTheDocument();
  });

  it('通过 URL 草稿参数进入页面时自动打开新建弹窗、预填字段并清理查询参数', async () => {
    renderMistakes(
      '/mistakes?draft=1&topic=derivative&relatedKnowledgeId=derivative-absolute&expression=abs(x)&xMin=-3&xMax=3',
    );

    const dialog = await screen.findByRole('dialog', { name: '记录新错题' });
    expect(within(dialog).getByText('导数与微分')).toBeInTheDocument();
    expect(
      within(dialog).getByText(/可导与连续：逆命题不成立/),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('反例函数表达式（可选）')).toHaveValue(
      'abs(x)',
    );
    expect(within(dialog).getByLabelText('反例区间左端点')).toHaveValue('-3');
    expect(within(dialog).getByLabelText('反例区间右端点')).toHaveValue('3');

    // URL 查询参数已被自动清理，防止刷新重复弹窗
    expect(screen.getByTestId('current-search')).toHaveTextContent(/^$/);
  });

  it('本地存储数据损坏时展示告警且绝不静默覆盖原数据，手动确认重置后恢复可用', async () => {
    const user = userEvent.setup();
    const corruptRaw = '{"schemaVersion":99,"data":{"important":"keep-me"}}';
    localStorage.setItem(STORAGE_KEY, corruptRaw);

    renderMistakes();

    expect(
      screen.getByText(/本地错题存储读取异常（原数据未被覆盖）/),
    ).toBeInTheDocument();
    // 绝不静默覆盖原损坏数据
    expect(localStorage.getItem(STORAGE_KEY)).toBe(corruptRaw);

    await user.click(screen.getByRole('button', { name: '重置错题本地存储' }));
    // 未点确认前仍保留原数据
    expect(localStorage.getItem(STORAGE_KEY)).toBe(corruptRaw);

    await user.click(screen.getByRole('button', { name: '确认重置' }));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(
      screen.getByRole('region', { name: '错题本空状态' }),
    ).toBeInTheDocument();
  });

  it('存储写入失败（如配额耗尽）时展示明确错误反馈且保留内存状态', async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    renderMistakes();
    await user.click(screen.getByRole('button', { name: /载入典型错题示例/ }));

    expect(
      screen.getByText(/本地存储写入失败（当前页面修改仍保留在内存中）/),
    ).toBeInTheDocument();
    // 内存中依然展示已载入的 4 道错题，不丢失用户操作
    expect(screen.getAllByRole('article')).toHaveLength(4);
  });

  it('支持合法 JSON 导入合并与导出，并拒绝损坏或格式不符的导入文件', async () => {
    const user = userEvent.setup();
    const createObjectURLMock = vi.fn(() => 'blob:mock-mistakes');
    const revokeObjectURLMock = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createObjectURLMock,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revokeObjectURLMock,
    });
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    renderMistakes();

    const fileInput = screen.getByLabelText('导入错题 JSON 文件');

    // 1. 合法导入文件成功导入
    const validImport = {
      schemaVersion: 1,
      exportedAt: '2026-03-10T08:00:00.000Z',
      items: [starterMistakes[0]],
    };
    const validFile = new File([JSON.stringify(validImport)], 'mistakes.json', {
      type: 'application/json',
    });
    await user.upload(fileInput, validFile);

    expect(
      await screen.findByText(/成功导入 1 道错题（新增 1 道，更新 0 道）/),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(1);

    // 2. 损坏或格式不符的 JSON 文件被拒绝且不破坏现有数据
    const invalidFile = new File(
      ['{"schemaVersion":1,"items":[{"id":"bad"}]}'],
      'broken.json',
      { type: 'application/json' },
    );
    await user.upload(fileInput, invalidFile);

    expect(await screen.findByText('JSON 导入失败')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(1);

    // 3. 按 id 更新已有错题并追加新错题（兼容直接 { items } 结构）
    const mergePayload = {
      items: [
        { ...starterMistakes[0], title: '洛必达振荡反例（二次复盘更新）' },
        starterMistakes[1],
      ],
    };
    const mergeFile = new File([JSON.stringify(mergePayload)], 'merge.json', {
      type: 'application/json',
    });
    await user.upload(fileInput, mergeFile);

    expect(
      await screen.findByText(/成功导入 2 道错题（新增 1 道，更新 1 道）/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('article', { name: '洛必达振荡反例（二次复盘更新）' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(2);

    // 4. 导出 JSON
    await user.click(screen.getByRole('button', { name: /导出 JSON/ }));
    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(anchorClickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-mistakes');
  });
});
