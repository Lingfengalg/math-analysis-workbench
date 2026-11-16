import { expect, test } from '@playwright/test';

test('知识导航可以将一元与三维多元示例分别传给仿真实验室', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    '让每一次探索',
  );
  await page.getByRole('link', { name: /探索这个问题/ }).click();
  await expect(
    page.getByText('可导与连续：逆命题不成立').first(),
  ).toBeVisible();
  await page.getByRole('link', { name: /去绘图中观察/ }).click();
  await expect(page.getByLabel('函数表达式 f(x)')).toHaveValue('abs(x)');
  await expect(page.getByRole('status')).toContainText('f(x) = abs(x)', {
    timeout: 20000,
  });
  await expect(
    page.getByRole('img', { name: '函数 abs(x) 的采样图像' }),
  ).toBeVisible();

  await page.goto('/#/knowledge?topic=integral');
  await page
    .getByRole('link', { name: /去三维绘图中仿真/ })
    .first()
    .click();
  await expect(page.getByLabel('多元函数表达式 f(x, y)')).toHaveValue(
    '2 - 0.25 * (x^2 + y^2)',
  );
  await expect(page.getByRole('status')).toContainText(
    '2 - 0.25 * (x^2 + y^2)',
    { timeout: 20000 },
  );
});

test('三维多元模式支持二重积分黎曼柱体预设、错误拦截与默认设置保留', async ({
  page,
}) => {
  await page.goto('/#/plotting');
  await expect(page.getByRole('status')).toContainText(
    '2 - 0.25 * (x^2 + y^2)',
    { timeout: 20000 },
  );

  await page.getByRole('button', { name: '高斯钟形 · 圆域极坐标' }).click();
  await expect(page.getByLabel('多元函数表达式 f(x, y)')).toHaveValue(
    'exp(-(x^2 + y^2))',
  );
  await expect(page.getByRole('status')).toContainText('exp(-(x^2 + y^2))', {
    timeout: 20000,
  });

  await page.getByRole('button', { name: /保存三维默认设置/ }).click();
  await expect(page.getByText(/已保存三维默认设置/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('多元函数表达式 f(x, y)')).toHaveValue(
    'exp(-(x^2 + y^2))',
  );

  await page.getByLabel('多元函数表达式 f(x, y)').fill('unknown(x, y)');
  await page.getByRole('button', { name: /生成三维曲面/ }).click();
  await expect(page.getByText('无法绘制', { exact: true })).toBeVisible();
});

test('二维一元模式支持表达式区间校验、进阶预设与卡片来源清理', async ({
  page,
}) => {
  await page.goto(
    '/#/plotting?expression=abs(x)&xMin=-3&xMax=3&sourceKnowledgeId=derivative-absolute',
  );
  await expect(page.getByText('已接收知识导航中的示例')).toBeVisible();
  await expect(page.getByRole('link', { name: /返回知识卡片/ })).toBeVisible();

  await page.getByRole('button', { name: '泰勒逼近 sin(x)' }).click();
  await expect(page.getByText('已接收知识导航中的示例')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('f(x) = sin(x)', {
    timeout: 20000,
  });
  await expect(page.getByLabel('对比函数 g(x)（可选）')).toHaveValue(
    'x - x^3/6',
  );

  await page.getByLabel('左端点').fill('10');
  await page.getByRole('button', { name: /绘制函数/ }).click();
  await expect(
    page.getByText('左端点必须小于右端点', { exact: true }),
  ).toBeVisible();
});

test('知识图谱支持全字段检索与记入错题本联动', async ({ page }) => {
  await page.goto('/#/knowledge');
  await page.getByPlaceholder('搜索概念或关键词').fill('雅可比');
  await expect(
    page.getByText('二重积分与累次定限：曲顶柱体体积及极坐标雅可比因子'),
  ).toBeVisible();
  await page
    .getByRole('link', { name: /记入错题本/ })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('记录新错题').first()).toBeVisible();
});

test('错题本支持载入典型示例、持久化及跳转反例绘图验证', async ({ page }) => {
  await page.goto('/#/mistakes');
  await page.getByRole('button', { name: '载入典型错题示例' }).first().click();
  await expect(
    page.getByText('误用洛必达法则判定振荡型极限不存在'),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByText('跨越无界奇点直接套用牛顿-莱布尼茨公式'),
  ).toBeVisible();

  await page
    .getByRole('link', { name: /去绘图中验证反例/ })
    .first()
    .click();
  await expect(page.getByRole('link', { name: /返回错题本/ })).toBeVisible();
  await expect(page.getByRole('status')).toContainText(
    'f(x) = (x + sin(x)) / x',
    { timeout: 20000 },
  );
});

test('扩展模块与未知路由有真实状态', async ({ page }) => {
  await page.goto('/#/assistant');
  await expect(page.getByText('这是扩展入口，不是已完成功能')).toBeVisible();
  await page.goto('/#/does-not-exist');
  await expect(page.getByText('没有找到这个页面')).toBeVisible();
});

test('移动端导航与各核心模块内容不横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: /绘图计算/ })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    '让抽象的变化',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: /错题本/ })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    '把每一次失误',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
