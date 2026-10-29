import { expect, test } from '@playwright/test';

test('错题本可以新增、刷新后保留、编辑并删除', async ({ page }) => {
  await page.goto('/#/mistakes');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    '把一次错误',
  );
  await expect(page.getByText(/还没有错题记录/)).toBeVisible();

  await page.getByRole('button', { name: /记录错题/ }).click();
  await page.getByLabel('题目', { exact: true }).fill('1/x 在 0 处连续吗');
  await page.getByLabel('题目内容').fill('讨论 1/x 在 x = 0 处的连续性。');
  await page.getByLabel('错误原因').fill('把 0 当成定义域内的点。');
  await page
    .getByLabel('订正与正确思路')
    .fill('先看定义域：0 不在 1/x 的定义域内，因此谈不上连续。');
  await page.getByRole('button', { name: /保\s*存/ }).click();

  await expect(page.getByText('已记录一条错题。')).toBeVisible();
  await expect(page.getByText('1/x 在 0 处连续吗')).toBeVisible();

  await page.reload();
  await expect(page.getByText('1/x 在 0 处连续吗')).toBeVisible();
  await expect(page.getByText('把 0 当成定义域内的点。')).toBeVisible();

  await page.getByRole('button', { name: /编辑/ }).click();
  await page
    .getByLabel('题目', { exact: true })
    .fill('1/x 在 0 处连续吗（订正）');
  await page.getByRole('button', { name: /保\s*存/ }).click();
  await expect(page.getByText('已更新这条错题。')).toBeVisible();
  await expect(page.getByText('1/x 在 0 处连续吗（订正）')).toBeVisible();

  await page.getByRole('button', { name: /删除/ }).click();
  await expect(page.getByText('删除这条错题？')).toBeVisible();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(page.getByText('已删除这条错题。')).toBeVisible();
  await expect(page.getByText(/还没有错题记录/)).toBeVisible();
});

test('错题本可以按主题筛选并搜索', async ({ page }) => {
  await page.goto('/#/mistakes');
  await page.getByRole('button', { name: /记录错题/ }).click();
  await page.getByLabel('题目', { exact: true }).fill('极限存在的条件');
  await page.getByRole('button', { name: /保\s*存/ }).click();
  await expect(page.getByText('极限存在的条件')).toBeVisible();

  await page.getByLabel('搜索错题').fill('不存在的内容');
  await expect(page.getByText(/没有匹配的错题/)).toBeVisible();
  await page.getByLabel('搜索错题').fill('极限');
  await expect(page.getByText('极限存在的条件')).toBeVisible();

  await page.getByText('导数', { exact: true }).click();
  await expect(page.getByText(/没有匹配的错题/)).toBeVisible();
});

test('两个标签页交替新增与删除不会互相覆盖', async ({ page, context }) => {
  await page.goto('/#/mistakes');
  const second = await context.newPage();
  await second.goto('/#/mistakes');
  await expect(page.getByText(/还没有错题记录/)).toBeVisible();
  await expect(second.getByText(/还没有错题记录/)).toBeVisible();

  await page.getByRole('button', { name: /记录错题/ }).click();
  await page.getByLabel('题目', { exact: true }).fill('A 页新增');
  await page.getByRole('button', { name: /保\s*存/ }).click();
  await expect(page.getByText('A 页新增')).toBeVisible();

  // 另一个标签页无需刷新即可看到 A 页的写入
  await expect(second.getByText('A 页新增')).toBeVisible();

  // B 页此时状态是新的，但旧实现仍会用整表覆盖；这里验证两条都在
  await second.getByRole('button', { name: /记录错题/ }).click();
  await second.getByLabel('题目', { exact: true }).fill('B 页新增');
  await second.getByRole('button', { name: /保\s*存/ }).click();
  await expect(second.getByText('B 页新增')).toBeVisible();

  await page.reload();
  await expect(page.getByText('A 页新增')).toBeVisible();
  await expect(page.getByText('B 页新增')).toBeVisible();
  await expect(page.getByText(/共 2 条错题/)).toBeVisible();

  await page
    .locator('.ant-card', { hasText: 'A 页新增' })
    .getByRole('button', { name: /删除/ })
    .click();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(page.getByText('A 页新增')).toBeHidden();

  await expect(second.getByText('A 页新增')).toBeHidden();
  await expect(second.getByText('B 页新增')).toBeVisible();
  await second.close();
});

test('另一页删除后，本页编辑会提示冲突而不是复活记录', async ({
  page,
  context,
}) => {
  await page.goto('/#/mistakes');
  const second = await context.newPage();
  await second.goto('/#/mistakes');

  await page.getByRole('button', { name: /记录错题/ }).click();
  await page.getByLabel('题目', { exact: true }).fill('共享记录');
  await page.getByRole('button', { name: /保\s*存/ }).click();
  await expect(second.getByText('共享记录')).toBeVisible();

  await second
    .locator('.ant-card', { hasText: '共享记录' })
    .getByRole('button', { name: /编辑/ })
    .click();

  await page
    .locator('.ant-card', { hasText: '共享记录' })
    .getByRole('button', { name: /删除/ })
    .click();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(page.getByText(/还没有错题记录/)).toBeVisible();

  await second.getByLabel('题目', { exact: true }).fill('试图编辑');
  await second.getByRole('button', { name: /保\s*存/ }).click();
  await expect(second.getByText(/已不存在/)).toBeVisible();

  await second.close();
  await page.reload();
  await expect(page.getByText(/还没有错题记录/)).toBeVisible();
});

test('同一错题在两页同时编辑时保留草稿并拒绝覆盖', async ({
  page,
  context,
}) => {
  await page.goto('/#/mistakes');
  await page.getByRole('button', { name: /记录错题/ }).click();
  await page.getByLabel('题目', { exact: true }).fill('共享错题');
  await page.getByRole('button', { name: /保\s*存/ }).click();
  await expect(page.getByText('共享错题')).toBeVisible();
  const second = await context.newPage();
  await second.goto('/#/mistakes');
  await page.getByRole('button', { name: /编辑/ }).click();
  await second.getByRole('button', { name: /编辑/ }).click();
  await page.getByLabel('题目', { exact: true }).fill('A 的修改');
  await second.getByLabel('题目', { exact: true }).fill('B 的草稿');
  await page.getByRole('button', { name: /保\s*存/ }).click();
  await expect(page.getByText('A 的修改')).toBeVisible();
  await second.getByRole('button', { name: /保\s*存/ }).click();
  await expect(second.getByText(/已在其他标签页修改/)).toBeVisible();
  await expect(second.getByLabel('题目', { exact: true })).toHaveValue(
    'B 的草稿',
  );
  await page.reload();
  await expect(page.getByText('A 的修改')).toBeVisible();
  await second.close();
});

test('两个标签页同时新增不会互相覆盖', async ({ page, context }) => {
  await page.goto('/#/mistakes');
  const second = await context.newPage();
  await second.goto('/#/mistakes');
  for (const [p, title] of [
    [page, '并发 A'],
    [second, '并发 B'],
  ] as const) {
    await p.getByRole('button', { name: /记录错题/ }).click();
    await p.getByLabel('题目', { exact: true }).fill(title);
  }
  await Promise.all(
    [page, second].map((p) =>
      p.getByRole('button', { name: /保\s*存/ }).click(),
    ),
  );
  await expect(page.getByText('并发 A')).toBeVisible();
  await expect(page.getByText('并发 B')).toBeVisible();
  await page.reload();
  await expect(page.getByText('并发 A')).toBeVisible();
  await expect(page.getByText('并发 B')).toBeVisible();
  await second.close();
});
