import { expect, test, type Page } from '@playwright/test';

const canvas = (page: Page) =>
  page.locator('canvas[data-annotation-canvas="true"]');

const storageKey = (pageId: string) => `math-workbench:annotation:${pageId}`;

async function items(page: Page, pageId: string) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw).data.items : null;
  }, storageKey(pageId));
}

async function enable(page: Page) {
  if (await page.getByText('退出批注', { exact: true }).count()) return;
  await page.getByText('批注', { exact: true }).click();
  await page.waitForTimeout(250);
}

async function draw(page: Page) {
  const box = (await canvas(page).boundingBox())!;
  const x = box.x + box.width * 0.3;
  const y = Math.min(box.y + 320, 820);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 120, y + 40, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(400);
}

async function addText(page: Page, text: string) {
  await page.locator('.ant-segmented-item', { hasText: '文字' }).click();
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.5, box.y + 300);
  const editor = page.locator('textarea[data-annotation-editor="true"]');
  await expect(editor).toBeVisible();
  await editor.fill(text);
  await editor.press('Enter');
}

test('可以画线，并添加、编辑、删除文字批注', async ({ page }) => {
  await page.goto('/#/knowledge');
  await enable(page);
  await draw(page);
  await addText(page, '这里最容易错');

  await expect
    .poll(async () => (await items(page, '/knowledge'))?.length)
    .toBe(2);

  const stored = await items(page, '/knowledge');
  const text = stored.find((item: { kind: string }) => item.kind === 'text');
  expect(text.text).toBe('这里最容易错');

  const box = (await canvas(page).boundingBox())!;
  const clickText = () =>
    page.mouse.click(
      box.x + text.x * box.width + 6,
      box.y + text.y * box.height + 10,
    );
  const editor = page.locator('textarea[data-annotation-editor="true"]');

  // 点击已有文字：重新打开编辑器修改内容
  await clickText();
  await expect(editor).toBeVisible();
  await expect(editor).toHaveValue('这里最容易错');
  await editor.fill('改成更容易错的点');
  await editor.press('Enter');

  await expect
    .poll(async () =>
      (await items(page, '/knowledge'))
        .find((item: { kind: string }) => item.kind === 'text')
        ?.text?.trim(),
    )
    .toBe('改成更容易错的点');

  // 清空内容后提交即删除这段文字
  await clickText();
  await expect(editor).toBeVisible();
  await editor.fill('');
  await editor.press('Enter');

  await expect
    .poll(
      async () =>
        (await items(page, '/knowledge')).filter(
          (item: { kind: string }) => item.kind === 'text',
        ).length,
    )
    .toBe(0);
});

test('清空全部批注只删除批注键，保留其他模块数据', async ({ page }) => {
  await page.goto('/#/knowledge');
  await page.evaluate(() =>
    localStorage.setItem(
      'math-workbench:preferences',
      '{"schemaVersion":1,"data":{}}',
    ),
  );
  await enable(page);
  await draw(page);

  await page.goto('/#/plotting');
  await page.waitForTimeout(1200);
  await enable(page);
  await draw(page);

  await expect
    .poll(async () => (await items(page, '/plotting'))?.length)
    .toBe(1);

  await page.getByRole('button', { name: /清空全部/ }).click();
  await page.getByRole('button', { name: '全部清空' }).click();
  await expect(page.getByText('已清空全部页面的批注。')).toBeVisible();

  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys.some((key) => key.startsWith('math-workbench:annotation:'))).toBe(
    false,
  );
  expect(keys).toContain('math-workbench:preferences');
});
