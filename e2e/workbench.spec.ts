import { expect, test } from '@playwright/test';

test('知识导航可以将示例传给绘图模块', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    '让每一次探索',
  );
  await page.getByRole('link', { name: /探索这个问题/ }).click();
  await expect(page.getByText('可导与连续：逆命题不成立')).toBeVisible();
  await page.getByRole('link', { name: /去绘图中观察/ }).click();
  await expect(page.getByLabel('函数表达式 f(x)')).toHaveValue('abs(x)');
  await expect(page.getByRole('status')).toContainText('f(x) = abs(x)', {
    timeout: 20000,
  });
  await expect(
    page.getByRole('img', { name: '函数 abs(x) 的采样图像' }),
  ).toBeVisible();
});

test('表达式与区间错误有明确反馈', async ({ page }) => {
  await page.goto('/#/plotting');
  await expect(page.getByRole('status')).toContainText('f(x)', {
    timeout: 20000,
  });
  await page.getByLabel('函数表达式 f(x)').fill('unknown(x)');
  await page.getByRole('button', { name: /绘制函数/ }).click();
  await expect(page.getByText('无法绘制', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '1/x', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('f(x) = 1/x');
  await page.getByLabel('左端点').fill('10');
  await page.getByRole('button', { name: /绘制函数/ }).click();
  await expect(
    page.getByText('左端点必须小于右端点', { exact: true }),
  ).toBeVisible();
});

test('默认绘图设置可在刷新后保留', async ({ page }) => {
  await page.goto('/#/plotting');
  await expect(page.getByRole('status')).toContainText('f(x)', {
    timeout: 20000,
  });
  await page.getByRole('button', { name: 'sin(x)', exact: true }).click();
  await page.getByRole('button', { name: /保存默认设置/ }).click();
  await expect(page.getByText(/已保存到当前浏览器/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('函数表达式 f(x)')).toHaveValue('sin(x)');
});

test('扩展模块与未知路由有真实状态', async ({ page }) => {
  await page.goto('/#/assistant');
  await expect(page.getByText('这是扩展入口，不是已完成功能')).toBeVisible();
  await page.goto('/#/does-not-exist');
  await expect(page.getByText('没有找到这个页面')).toBeVisible();
});

test('移动端导航与内容不横向溢出', async ({ page }) => {
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
    .getByRole('link', { name: /知识导航/ })
    .click();
  await expect(page.getByPlaceholder('搜索概念或关键词')).toBeVisible();
});
