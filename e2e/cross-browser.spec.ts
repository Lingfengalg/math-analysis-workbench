import { expect, test, type Page } from '@playwright/test';

/**
 * 跨浏览器基线：只覆盖关键路径（导航、绘图错误反馈、错题本写入与刷新、数据保护），
 * 不重复 Chromium 基线里的全部交互细节。
 */

async function addMistake(page: Page, title: string) {
  await page.getByRole('button', { name: /记录错题/ }).click();
  await page.getByLabel('题目', { exact: true }).fill(title);
  await page.getByRole('button', { name: /保\s*存/ }).click();
  await expect(page.getByText(title)).toBeVisible();
}

test('导航与路由在三个引擎下都可用', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    '让每一次探索',
  );

  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: /知识导航/ })
    .click();
  await expect(page.getByPlaceholder('搜索概念或关键词')).toBeVisible();

  await page.goto('/#/does-not-exist');
  await expect(page.getByText('没有找到这个页面')).toBeVisible();
});

test('绘图错误反馈可用', async ({ page }) => {
  await page.goto('/#/plotting');
  await expect(page.getByRole('status')).toContainText('f(x)', {
    timeout: 20000,
  });

  await page.getByLabel('函数表达式 f(x)').fill('unknown(x)');
  await page.getByRole('button', { name: /绘制函数/ }).click();
  await expect(page.getByText('无法绘制', { exact: true })).toBeVisible();

  await page.getByLabel('左端点').fill('10');
  await page.getByRole('button', { name: /绘制函数/ }).click();
  await expect(page.getByText('左端点必须小于右端点')).toBeVisible();
});

test('错题本可写入并在刷新后保留', async ({ page }) => {
  await page.goto('/#/mistakes');
  await expect(page.getByText(/还没有错题记录/)).toBeVisible();

  // 不支持 Web Locks 的引擎应看到只读提示，而不是静默失败
  const readonly = await page.getByText(/只读模式/).count();
  if (readonly > 0) {
    await expect(page.getByRole('button', { name: /记录错题/ })).toBeDisabled();
    test.info().annotations.push({
      type: 'capability',
      description: '当前引擎不支持 Web Locks，错题本按只读模式验收',
    });
    return;
  }

  await addMistake(page, '跨浏览器基线错题');
  await page.reload();
  await expect(page.getByText('跨浏览器基线错题')).toBeVisible();

  const stored = await page.evaluate(() =>
    localStorage.getItem('math-workbench:mistakes'),
  );
  expect(stored).toBeTruthy();
});

test('损坏数据不会被静默覆盖', async ({ page }) => {
  await page.goto('/#/mistakes');
  await page.evaluate(() => {
    localStorage.setItem(
      'math-workbench:mistakes',
      '{"schemaVersion":1,"data":{"items":"broken"}}',
    );
  });
  await page.reload();

  await expect(page.getByText('本地错题数据无法读取')).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem('math-workbench:mistakes')),
  ).toBe('{"schemaVersion":1,"data":{"items":"broken"}}');
});
