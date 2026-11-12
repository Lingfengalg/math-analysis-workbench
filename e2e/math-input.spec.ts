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
