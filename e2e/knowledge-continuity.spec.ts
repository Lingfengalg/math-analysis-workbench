import { expect, test } from '@playwright/test';

test('连续性知识卡片展示定义域边界与孤立点示例', async ({ page }) => {
  await page.goto('/#/knowledge?topic=continuity');
  const card = page.getByRole('article');
  await expect(card.getByText(/0 是定义域的孤立点/)).toBeVisible();
  await expect(card.getByText(/当 a 是定义域的聚点时/)).toBeVisible();
  await expect(card.locator('.katex')).toBeVisible();
  await card.getByRole('link', { name: /去绘图中观察/ }).click();
  await expect(page).toHaveURL(/#\/plotting\?/);
});
