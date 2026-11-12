import { expect, test } from '@playwright/test';

test('导数互动实验联动图像、自测和错题入口', async ({ page }) => {
  await page.goto('/#/knowledge');
  await page.getByRole('link', { name: '打开导数互动实验' }).click();
  const lab = page.getByRole('region', { name: '从割线走向切线' });
  await expect(lab.getByRole('img')).toHaveAccessibleName(/割线斜率约为 2/);
  await expect(lab.locator('svg')).toBeVisible();
  await lab.getByRole('button', { name: 'f(x) = |x|' }).click();
  await lab.getByRole('slider', { name: '观察点 x' }).fill('0');
  await lab.getByRole('slider', { name: '增量 h' }).fill('-0.1');
  await expect(lab.getByRole('img')).toHaveAccessibleName(
    /割线斜率约为 -1.*该点不可导/,
  );
  await lab.getByRole('slider', { name: '增量 h' }).fill('0');
  await expect(lab.getByText(/差商分母为零/)).toBeVisible();
  await lab.getByRole('button', { name: '不一定可导' }).click();
  await expect(lab.getByRole('status')).toContainText('左导数为 −1');
  await lab.getByRole('link', { name: '前往导数错题本' }).click();
  await expect(page).toHaveURL(/#\/mistakes\?topic=derivative/);
});

test('导数实验在窄屏中可见且不横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/knowledge?topic=derivative');
  const lab = page.getByRole('region', { name: '从割线走向切线' });
  await expect(lab.locator('svg')).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await lab.getByRole('button', { name: 'f(x) = |x|' }).click();
  await expect(lab.getByRole('button', { name: 'f(x) = |x|' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('拖动图上观察点会同步滑块和差商', async ({ page }) => {
  await page.goto('/#/knowledge?topic=derivative');
  const lab = page.getByRole('region', { name: '从割线走向切线' });
  const point = lab.getByTestId('derivative-point-a');
  await expect(point).toBeVisible();
  await point.scrollIntoViewIfNeeded();
  const box = await point.boundingBox();
  if (!box) throw new Error('观察点没有可交互区域');
  const slider = lab.getByRole('slider', { name: '观察点 x' });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 55,
    box.y + box.height / 2 - 45,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => Number(await slider.inputValue()))
    .not.toBe(0.5);
  await expect(lab.getByRole('img')).not.toHaveAccessibleName(
    /观察点 x 等于 0.5，/,
  );
  const second = lab.getByTestId('derivative-point-b');
  const secondBox = await second.boundingBox();
  if (!secondBox) throw new Error('第二个点没有可交互区域');
  await page.mouse.move(
    secondBox.x + secondBox.width / 2,
    secondBox.y + secondBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    secondBox.x + secondBox.width / 2 - 50,
    secondBox.y + secondBox.height / 2 + 50,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect
    .poll(async () =>
      Number(await lab.getByRole('slider', { name: '增量 h' }).inputValue()),
    )
    .not.toBe(1);
});

test('固定导数实验可在禁止动态代码的 CSP 下运行', async ({ page }) => {
  await page.route('**/', async (route) => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        'content-security-policy':
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; worker-src 'self' blob:",
      },
    });
  });
  const response = await page.goto('/#/knowledge?topic=derivative');
  expect(response?.headers()['content-security-policy']).toContain(
    "script-src 'self'",
  );
  const lab = page.getByRole('region', { name: '从割线走向切线' });
  await lab.getByRole('slider', { name: '观察点 x' }).fill('1');
  await expect(lab.getByTestId('derivative-point-a')).toBeVisible();
  await lab.getByRole('button', { name: 'f(x) = |x|' }).click();
  await lab.getByRole('slider', { name: '观察点 x' }).fill('0');
  await expect(lab.getByRole('img')).toHaveAccessibleName(/该点不可导/);
});
