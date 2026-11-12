import { expect, test } from '@playwright/test';

test('极限动画可播放、暂停、拖动，并导出真实 SVG 快照', async ({ page }) => {
  await page.goto('/#/knowledge');
  await page.getByRole('link', { name: '打开极限互动动画' }).click();
  const lab = page.getByRole('region', { name: '向同一个点靠近' });
  await expect(lab.locator('svg')).toBeVisible();
  const slider = lab.getByRole('slider', { name: '逼近进度' });
  await lab.getByRole('button', { name: '播放动画' }).click();
  await expect
    .poll(async () => Number(await slider.inputValue()))
    .toBeGreaterThan(1);
  await lab.getByRole('button', { name: '暂停动画' }).click();
  const paused = Number(await slider.inputValue());
  await page.waitForTimeout(250);
  expect(Number(await slider.inputValue())).toBe(paused);
  await slider.fill('100');
  await expect(lab.getByRole('img')).toHaveAccessibleName(
    /左侧 x 为 0.99、函数值为 0.98/,
  );
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    lab.getByRole('button', { name: '导出当前画面 SVG' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('limit-square-snapshot.svg');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const svg = Buffer.concat(chunks).toString('utf8');
  expect(svg).toContain('<svg');
  expect(svg).toContain('<path');
  expect(svg).toContain('<text');
  expect(svg).toContain('f(x) = x²; a = 1');
  expect(svg).toContain('距目标点 0.01');
  expect(svg).not.toContain('foreignObject');
  expect(svg).not.toContain('<script');
  const imageIsReadable = await page.evaluate(async (source) => {
    const url = URL.createObjectURL(
      new Blob([source], { type: 'image/svg+xml' }),
    );
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context || !canvas.width || !canvas.height) return false;
      context.drawImage(image, 0, 0);
      return context
        .getImageData(0, 0, canvas.width, canvas.height)
        .data.some((value, index) => index % 4 === 3 && value > 0);
    } finally {
      URL.revokeObjectURL(url);
    }
  }, svg);
  expect(imageIsReadable).toBe(true);
  await lab.getByRole('button', { name: 'x / |x|：左右不同' }).click();
  await slider.fill('100');
  await expect(lab.getByRole('img')).toHaveAccessibleName(
    /函数值为 -1.*函数值为 1/,
  );
  await expect(lab.getByText(/双侧极限不存在/)).toBeVisible();
  await lab.getByRole('button', { name: '重置' }).click();
  await expect(slider).toHaveValue('0');
});

test('播放结束停在最小非零距离，并可重新播放', async ({ page }) => {
  await page.goto('/#/knowledge?topic=limit');
  const lab = page.getByRole('region', { name: '向同一个点靠近' });
  await lab.getByRole('button', { name: '播放动画' }).click();
  await expect(lab.getByRole('slider', { name: '逼近进度' })).toHaveValue(
    '100',
    { timeout: 10000 },
  );
  await expect(lab.getByRole('button', { name: '重新播放' })).toBeVisible();
  await expect(lab.getByRole('img')).toHaveAccessibleName(/左侧 x 为 0.99/);
});

test('减少动态效果时支持手动观察，窄屏不溢出', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/knowledge?topic=limit');
  const lab = page.getByRole('region', { name: '向同一个点靠近' });
  await expect(lab.getByRole('button', { name: '播放动画' })).toBeDisabled();
  await lab.getByRole('slider', { name: '逼近进度' }).fill('70');
  await expect(lab.getByRole('slider', { name: '逼近进度' })).toHaveValue('70');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
