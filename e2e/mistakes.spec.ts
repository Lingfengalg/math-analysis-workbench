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
