import { expect, test, type Page } from '@playwright/test';

const KNOWLEDGE_KEY = 'math-workbench:annotation:/knowledge';

async function paintedPixels(page: Page): Promise<number> {
  return page.evaluate(() => {
    const element = document.querySelector<HTMLCanvasElement>(
      'canvas[data-annotation-canvas="true"]',
    );
    if (!element) return -1;
    const context = element.getContext('2d');
    if (!context) return -1;
    const { data } = context.getImageData(0, 0, element.width, element.height);
    let painted = 0;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] > 0) painted += 1;
    }
    return painted;
  });
}

test('批注锚定到知识卡片：卡片被筛掉时隐藏并提示，恢复后重新显示', async ({
  page,
}) => {
  await page.goto('/#/knowledge');
  await expect(page.getByText('把条件看清，把概念串起来。')).toBeVisible();

  const firstCard = page
    .locator('[data-annotation-anchor^="knowledge:"]')
    .first();
  await expect(firstCard).toBeVisible();
  const anchorKey = await firstCard.getAttribute('data-annotation-anchor');
  expect(anchorKey).toBeTruthy();
  const drawnCard = page.locator(`[data-annotation-anchor="${anchorKey}"]`);

  await page.getByRole('button', { name: /批注$/ }).click();

  // 在这张卡片的标题附近画一笔
  const box = await firstCard.boundingBox();
  if (!box) throw new Error('知识卡片没有可见尺寸');
  await page.mouse.move(box.x + 40, box.y + 24);
  await page.mouse.down();
  for (let step = 1; step <= 10; step += 1) {
    await page.mouse.move(box.x + 40 + step * 12, box.y + 24 + step * 3);
  }
  await page.mouse.up();

  await expect.poll(() => paintedPixels(page)).toBeGreaterThan(0);

  // 存储里应记录锚点，而不是仅记录整页坐标
  await expect
    .poll(async () => {
      const raw = await page.evaluate(
        (key) => window.localStorage.getItem(key),
        KNOWLEDGE_KEY,
      );
      if (!raw) return null;
      return JSON.parse(raw).data.items[0]?.anchor?.key ?? null;
    })
    .toBe(anchorKey);

  // 搜索「导数」，把刚画过的那张卡片筛掉
  await page.getByLabel('搜索知识卡片').fill('导数');
  await expect(drawnCard).toHaveCount(0);
  await expect.poll(() => paintedPixels(page)).toBe(0);
  await expect(page.getByText(/条批注锚定的内容不在当前页面/)).toBeVisible();

  // 清空搜索后批注重新锚定并显示
  await page.getByLabel('搜索知识卡片').fill('');
  await expect(drawnCard).toBeVisible();
  await expect.poll(() => paintedPixels(page)).toBeGreaterThan(0);
  await expect(page.getByText(/条批注锚定的内容不在当前页面/)).toHaveCount(0);
});
