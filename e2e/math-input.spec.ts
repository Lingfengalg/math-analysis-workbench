import { expect, test, type Locator } from '@playwright/test';

async function setFormula(field: Locator, latex: string) {
  await field.evaluate((element, value) => {
    const mathfield = element as HTMLElement & {
      setValue: (value: string) => void;
    };
    mathfield.setValue(value);
    mathfield.dispatchEvent(
      new Event('input', { bubbles: true, composed: true }),
    );
  }, latex);
}

test('绘图中通过 MathLive 输入分数，校验后填入并绘图', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (/^https?:/.test(url) && !url.startsWith('http://127.0.0.1:'))
      external.push(url);
  });
  await page.goto('/#/plotting');
  await page.getByRole('button', { name: '打开数学编辑器' }).click();
  const editor = page.getByRole('region', { name: '数学公式编辑器' });
  const field = editor.locator('math-field');
  await expect(field).toBeVisible();
  await setFormula(field, '\\frac{x}{2}');
  await expect(editor).toContainText('转换结果：');
  await editor.getByRole('button', { name: '替换原输入' }).click();
  await expect(editor).toBeHidden();
  await expect(page.getByLabel('函数表达式 f(x)')).toHaveValue('(x)/(2)');
  await page.getByRole('button', { name: /绘制函数/ }).click();
  await expect(page.getByText(/有限值范围/).first()).toBeVisible();
  expect(external).toEqual([]);
});

test('不支持的结构不会覆盖原表达式', async ({ page }) => {
  await page.goto('/#/plotting');
  const original = page.getByLabel('函数表达式 f(x)');
  await original.fill('x^2');
  await page.getByRole('button', { name: '打开数学编辑器' }).click();
  const editor = page.getByRole('region', { name: '数学公式编辑器' });
  await setFormula(editor.locator('math-field'), '\\int_0^1 x dx');
  await editor.getByRole('button', { name: '替换原输入' }).click();
  await expect(editor.getByRole('alert')).toBeVisible();
  await expect(original).toHaveValue('x^2');
  await setFormula(editor.locator('math-field'), 'n');
  await editor.getByRole('button', { name: '替换原输入' }).click();
  await expect(editor.getByRole('alert')).toContainText('不支持的变量');
  await expect(original).toHaveValue('x^2');
});

test('练习分数输入进入现有 Perseus 评分链路', async ({ page }) => {
  await page.goto('/#/mistakes?topic=limit&practice=1');
  await page.getByRole('button', { name: '打开数学编辑器' }).click();
  const editor = page.getByRole('region', { name: '数学公式编辑器' });
  await setFormula(editor.locator('math-field'), '\\frac{1}{2}');
  await editor.getByRole('button', { name: '替换原输入' }).click();
  await expect(page.getByLabel('你的答案')).toHaveValue('1/2');
  await page.getByRole('button', { name: '提交答案' }).click();
  await expect(page.getByText('回答正确')).toBeVisible();
});

test('分数工具与键盘可以完成结构化输入', async ({ page }) => {
  await page.goto('/#/mistakes?topic=limit&practice=1');
  await page.getByRole('button', { name: '打开数学编辑器' }).click();
  const editor = page.getByRole('region', { name: '数学公式编辑器' });
  await editor.getByRole('button', { name: /分\s*数/ }).click();
  await page.keyboard.type('1');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.type('2');
  await expect(editor).toContainText('1/2');
  await editor.getByRole('button', { name: '替换原输入' }).click();
  await expect(page.getByLabel('你的答案')).toHaveValue('1/2');
});

test('键盘触发分数工具后能够继续输入', async ({ page }) => {
  await page.goto('/#/mistakes?topic=limit&practice=1');
  await page.getByRole('button', { name: '打开数学编辑器' }).click();
  const editor = page.getByRole('region', { name: '数学公式编辑器' });
  await editor.getByRole('button', { name: /分\s*数/ }).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.type('1');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.type('2');
  await expect(editor).toContainText('1/2');
});

test('窄屏下编辑器不溢出，严格 CSP 下可输入', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
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
  await page.goto('/#/mistakes?topic=limit&practice=1');
  await page.getByRole('button', { name: '打开数学编辑器' }).click();
  const editor = page.getByRole('region', { name: '数学公式编辑器' });
  await setFormula(editor.locator('math-field'), '\\frac{1}{2}');
  await editor.getByRole('button', { name: '替换原输入' }).click();
  await expect(page.getByLabel('你的答案')).toHaveValue('1/2');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('回填兼容表达式，反三角函数与自然对数经 Worker 校验', async ({ page }) => {
  await page.goto('/#/plotting');
  const input = page.getByLabel('函数表达式 f(x)');
  await input.fill('asin(x)+log(x+1)');
  await page.getByRole('button', { name: '打开数学编辑器' }).click();
  const editor = page.getByRole('region', { name: '数学公式编辑器' });
  await editor.getByRole('button', { name: '载入原输入' }).click();
  await expect(
    editor.getByText('已载入原输入；原文本不会改变，确认后才会替换。'),
  ).toBeVisible();
  await expect(input).toHaveValue('asin(x)+log(x+1)');
  await expect(editor).toContainText('asin(x)+log(x+1)');
  await editor.getByRole('button', { name: '替换原输入' }).click();
  await expect(editor).toBeHidden();
  await expect(input).toHaveValue('asin(x)+log(x+1)');
});

test('不兼容原输入和已有编辑草稿均不会被静默覆盖', async ({ page }) => {
  await page.goto('/#/plotting');
  const input = page.getByLabel('函数表达式 f(x)');
  await input.fill('2x');
  await page.getByRole('button', { name: '打开数学编辑器' }).click();
  const editor = page.getByRole('region', { name: '数学公式编辑器' });
  await editor.getByRole('button', { name: '载入原输入' }).click();
  await expect(editor.getByRole('alert')).toContainText('原输入未更改');
  await expect(input).toHaveValue('2x');
  await setFormula(editor.locator('math-field'), 'x^2');
  await expect(
    editor.getByRole('button', { name: '载入原输入' }),
  ).toBeDisabled();
  await editor.getByRole('button', { name: /取\s*消/ }).click();
  await expect(input).toHaveValue('2x');
});

test('数列模式可安全回填并替换', async ({ page }) => {
  await page.goto('/#/plotting');
  await page.getByText('数列散点', { exact: true }).click();
  const input = page.getByLabel('通项表达式 a_n');
  await input.fill('(n+1)/n');
  await page.getByRole('button', { name: '打开数学编辑器' }).click();
  const editor = page.getByRole('region', { name: '数学公式编辑器' });
  await editor.getByRole('button', { name: '载入原输入' }).click();
  await expect(
    editor.getByText('已载入原输入；原文本不会改变，确认后才会替换。'),
  ).toBeVisible();
  await editor.getByRole('button', { name: '替换原输入' }).click();
  await expect(input).toHaveValue('(n+1)/(n)');
});

test('手动输入隐式乘法不会覆盖原表达式', async ({ page }) => {
  await page.goto('/#/plotting');
  const input = page.getByLabel('函数表达式 f(x)');
  await input.fill('x^2');
  await page.getByRole('button', { name: '打开数学编辑器' }).click();
  const editor = page.getByRole('region', { name: '数学公式编辑器' });
  await setFormula(editor.locator('math-field'), '2x');
  await editor.getByRole('button', { name: '替换原输入' }).click();
  await expect(editor.getByRole('alert')).toContainText('隐式乘法');
  await expect(input).toHaveValue('x^2');
  await setFormula(editor.locator('math-field'), '2\\cdot x');
  await editor.getByRole('button', { name: '替换原输入' }).click();
  await expect(input).toHaveValue('2*x');
});

test('数字答案可回填而不自动覆盖，确认后仍可评分', async ({ page }) => {
  await page.goto('/#/mistakes?topic=limit&practice=1');
  const input = page.getByLabel('你的答案');
  await input.fill('1/2');
  await page.getByRole('button', { name: '打开数学编辑器' }).click();
  const editor = page.getByRole('region', { name: '数学公式编辑器' });
  await editor.getByRole('button', { name: '载入原输入' }).click();
  await expect(
    editor.getByText('已载入原输入；原文本不会改变，确认后才会替换。'),
  ).toBeVisible();
  await expect(input).toHaveValue('1/2');
  await editor.getByRole('button', { name: '替换原输入' }).click();
  await page.getByRole('button', { name: '提交答案' }).click();
  await expect(page.getByText('回答正确')).toBeVisible();
});

test('严格 CSP 下函数表达式可以回填并通过计算 Worker', async ({ page }) => {
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
  await page.goto('/#/plotting');
  const input = page.getByLabel('函数表达式 f(x)');
  await input.fill('log(x+1)');
  await page.getByRole('button', { name: '打开数学编辑器' }).click();
  const editor = page.getByRole('region', { name: '数学公式编辑器' });
  await editor.getByRole('button', { name: '载入原输入' }).click();
  await expect(
    editor.getByText('已载入原输入；原文本不会改变，确认后才会替换。'),
  ).toBeVisible();
  await editor.getByRole('button', { name: '替换原输入' }).click();
  await expect(input).toHaveValue('log(x+1)');
});

test('回填校验中原输入被修改则放弃载入', async ({ page }) => {
  await page.goto('/#/plotting');
  const input = page.getByLabel('函数表达式 f(x)');
  await input.fill('x+1');
  await page.getByRole('button', { name: '打开数学编辑器' }).click();
  const editor = page.getByRole('region', { name: '数学公式编辑器' });
  await page.evaluate(() => {
    class DelayedWorker {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      onerror = null;
      onmessageerror = null;
      postMessage() {
        setTimeout(
          () =>
            this.onmessage?.({ data: { ok: true, type: 'editor-roundtrip' } }),
          600,
        );
      }
      terminate() {}
    }
    window.Worker = DelayedWorker as unknown as typeof Worker;
  });
  await editor.getByRole('button', { name: '载入原输入' }).click();
  await input.fill('x+2');
  await expect(editor.getByRole('alert')).toContainText(
    '校验期间原输入或编辑器已更改',
  );
  await expect(input).toHaveValue('x+2');
});

test('校验期间切换函数与数列不会把旧公式写入新模式', async ({ page }) => {
  await page.goto('/#/plotting');
  const input = page.getByLabel('函数表达式 f(x)');
  await input.fill('x+1');
  await page.getByRole('button', { name: '打开数学编辑器' }).click();
  const editor = page.getByRole('region', { name: '数学公式编辑器' });
  await page.evaluate(() => {
    class DelayedWorker {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      onerror = null;
      onmessageerror = null;
      postMessage() {
        setTimeout(
          () =>
            this.onmessage?.({ data: { ok: true, type: 'editor-roundtrip' } }),
          600,
        );
      }
      terminate() {}
    }
    window.Worker = DelayedWorker as unknown as typeof Worker;
  });
  await editor.getByRole('button', { name: '载入原输入' }).click();
  await page.getByText('数列散点', { exact: true }).click();
  await expect(editor).toHaveCount(0);
  const sequence = page.getByLabel('通项表达式 a_n');
  const before = await sequence.inputValue();
  await page.waitForTimeout(800);
  await expect(sequence).toHaveValue(before);
});

test.describe('触摸屏模拟', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('窄屏触摸可以载入并替换原输入', async ({ page }) => {
    await page.goto('/#/plotting');
    const input = page.getByLabel('函数表达式 f(x)');
    await input.fill('x^2');
    await page.getByRole('button', { name: '打开数学编辑器' }).tap();
    const editor = page.getByRole('region', { name: '数学公式编辑器' });
    await editor.getByRole('button', { name: '载入原输入' }).tap();
    await expect(
      editor.getByText('已载入原输入；原文本不会改变，确认后才会替换。'),
    ).toBeVisible();
    await editor.getByRole('button', { name: '替换原输入' }).tap();
    await expect(input).toHaveValue('x^2');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
  });
});

test('MathLive 实际输出交给真实 Worker 后多点数值保持一致', async ({
  page,
}) => {
  let workerUrl = '';
  page.on('request', (request) => {
    if (request.url().includes('/plot.worker-')) workerUrl = request.url();
  });
  await page.goto('/#/plotting');
  const input = page.getByLabel('函数表达式 f(x)');
  await input.fill('asin(x)+log(x+1)');
  await page.getByRole('button', { name: '打开数学编辑器' }).click();
  const editor = page.getByRole('region', { name: '数学公式编辑器' });
  await editor.getByRole('button', { name: '载入原输入' }).click();
  await expect(
    editor.getByText('已载入原输入；原文本不会改变，确认后才会替换。'),
  ).toBeVisible();
  await expect.poll(() => workerUrl).not.toBe('');
  const expression = await editor.locator('code').innerText();
  const samples = await page.evaluate(
    ({ url, expression }) =>
      new Promise<[number, number | null][]>((resolve, reject) => {
        const worker = new Worker(url, { type: 'module' });
        const timeout = setTimeout(() => {
          worker.terminate();
          reject(new Error('Worker 超时'));
        }, 8000);
        worker.onerror = () => {
          clearTimeout(timeout);
          worker.terminate();
          reject(new Error('Worker 加载失败'));
        };
        worker.onmessage = (event) => {
          clearTimeout(timeout);
          worker.terminate();
          if (!event.data.ok) reject(new Error(event.data.error));
          else resolve(event.data.data.points);
        };
        worker.postMessage({
          type: 'plot',
          request: { expression, xMin: -0.8, xMax: 0.8 },
        });
      }),
    { url: workerUrl, expression },
  );
  for (const x of [-0.8, -0.4, 0, 0.4, 0.8]) {
    const point = samples.find(([px]) => Math.abs(px - x) < 1e-8);
    expect(point, `x=${x}`).toBeDefined();
    expect(point?.[1]).not.toBeNull();
    expect(point?.[1]).toBeCloseTo(Math.asin(x) + Math.log(x + 1), 8);
  }
});
