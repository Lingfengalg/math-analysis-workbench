import { expect, test, type Locator, type Page } from '@playwright/test';

const KNOWLEDGE_KEY = 'math-workbench:annotation:/knowledge';

function annotationCanvas(page: Page): Locator {
  return page.locator('canvas[data-annotation-canvas="true"]');
}

/** 统计批注画布上不透明像素数量；画布不存在或无上下文时返回 -1。 */
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

/**
 * 打开知识页并等待内容渲染完成。
 * 页面是懒加载的：内容未渲染时批注画布只有几百像素高，
 * 此时按固定偏移点击会落在画布之外，必须先等内容撑开容器。
 */
async function openKnowledgePage(page: Page): Promise<void> {
  await page.goto('/#/knowledge');
  await expect(page.getByText('把条件看清，把概念串起来。')).toBeVisible();
  await expect
    .poll(async () => (await annotationCanvas(page).boundingBox())?.height ?? 0)
    .toBeGreaterThan(400);
}

async function startAnnotation(page: Page): Promise<void> {
  await page.getByRole('button', { name: /批注$/ }).click();
  await expect(annotationCanvas(page)).toHaveCSS('pointer-events', 'auto');
}

/** 从画布左上角偏移处画一条线，避开右下角的工具面板。 */
async function drawStroke(page: Page): Promise<void> {
  const box = await annotationCanvas(page).boundingBox();
  if (!box) throw new Error('批注画布没有可见尺寸');
  const startX = box.x + 120;
  const startY = box.y + 120;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let step = 1; step <= 14; step += 1) {
    await page.mouse.move(startX + step * 16, startY + step * 5);
  }
  await page.mouse.up();
}

test('批注：画线后保留、刷新不丢、不同页面互不干扰', async ({ page }) => {
  await openKnowledgePage(page);

  // 默认关闭时画布不拦截页面交互
  await expect(annotationCanvas(page)).toHaveCSS('pointer-events', 'none');

  await startAnnotation(page);
  await drawStroke(page);
  await expect.poll(() => paintedPixels(page)).toBeGreaterThan(0);

  // 关闭批注后重新让出指针事件
  await page.getByRole('button', { name: /退出批注$/ }).click();
  await expect(annotationCanvas(page)).toHaveCSS('pointer-events', 'none');

  // 刷新后笔迹仍在（覆盖防抖窗口内直接刷新的情况）
  await page.reload();
  await expect
    .poll(async () => (await annotationCanvas(page).boundingBox())?.height ?? 0)
    .toBeGreaterThan(400);
  await expect.poll(() => paintedPixels(page)).toBeGreaterThan(0);

  // 切到绘图页：该页没有批注
  await page.getByRole('link', { name: '绘图计算' }).click();
  await expect.poll(() => paintedPixels(page)).toBe(0);

  // 切回知识页：原来的笔迹还在
  await page.getByRole('link', { name: '知识导航' }).click();
  await expect.poll(() => paintedPixels(page)).toBeGreaterThan(0);

  const stored = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    KNOWLEDGE_KEY,
  );
  expect(stored).not.toBeNull();
  expect(JSON.parse(stored as string).schemaVersion).toBe(1);
});

test('批注：文字工具添加标注并写入本页存储', async ({ page }) => {
  await openKnowledgePage(page);
  await startAnnotation(page);

  // T 快捷键切换到文字工具，再在画布空白处点击
  await page.keyboard.press('t');
  await expect(page.getByText(/当前：文字/)).toBeVisible();

  const box = await annotationCanvas(page).boundingBox();
  if (!box) throw new Error('批注画布没有可见尺寸');
  await page.mouse.click(box.x + 260, box.y + 260);

  const editor = page.locator('textarea[data-annotation-editor="true"]');
  await expect(editor).toBeVisible();
  await editor.fill('这里最容易错');
  await editor.press('Enter');

  await expect(editor).toHaveCount(0);
  await expect.poll(() => paintedPixels(page)).toBeGreaterThan(0);

  // 保存有 250ms 防抖，先等写入完成再断言存储内容
  await expect
    .poll(async () => {
      const raw = await page.evaluate(
        (key) => window.localStorage.getItem(key),
        KNOWLEDGE_KEY,
      );
      return raw ? JSON.parse(raw).data.items.length : 0;
    })
    .toBe(1);

  const stored = JSON.parse(
    (await page.evaluate(
      (key) => window.localStorage.getItem(key),
      KNOWLEDGE_KEY,
    )) as string,
  );
  expect(stored.data.items[0]).toMatchObject({
    kind: 'text',
    text: '这里最容易错',
  });
});

test('批注：清空本页后画布与存储一并清空', async ({ page }) => {
  await openKnowledgePage(page);
  await startAnnotation(page);
  await drawStroke(page);
  await expect.poll(() => paintedPixels(page)).toBeGreaterThan(0);

  await page.getByRole('button', { name: '清空本页批注' }).click();

  await expect.poll(() => paintedPixels(page)).toBe(0);
  await expect
    .poll(() =>
      page.evaluate((key) => window.localStorage.getItem(key), KNOWLEDGE_KEY),
    )
    .toBeNull();
});
