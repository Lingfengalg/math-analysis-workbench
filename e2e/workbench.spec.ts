import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('知识导航可以将示例传给绘图模块', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    '让每一次探索',
  );
  await page.getByRole('link', { name: /探索这个问题/ }).click();
  await expect(page.getByText('可导与连续：逆命题不成立')).toBeVisible();
  await page.getByRole('link', { name: /去绘图中观察/ }).click();
  await expect(page.getByLabel('函数表达式 f(x)')).toHaveValue('abs(x)');
  await expect(page.getByRole('status')).toContainText('f(x) = abs(x)', {
    timeout: 20000,
  });
  await expect(
    page.getByRole('img', { name: '函数 abs(x) 的采样图像' }),
  ).toBeVisible();
});

test('知识来源提示在编辑或切换示例后清除', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /探索这个问题/ }).click();
  await page.getByRole('link', { name: /去绘图中观察/ }).click();
  await expect(page.getByText('已接收知识导航中的示例')).toBeVisible();
  await expect(page.getByText(/来源卡片：/)).toBeVisible();
  await expect(page.getByLabel('函数表达式 f(x)')).toHaveValue('abs(x)');
  // 等待链接示例的首次自动绘制完成，避免绘制按钮仍在 loading 时点击被忽略
  await expect(page.getByRole('status')).toContainText('f(x) = abs(x)', {
    timeout: 20000,
  });
  // 修改表达式后重新绘制：来源提示清除
  await page.getByLabel('函数表达式 f(x)').fill('abs(x)+1');
  await page.getByRole('button', { name: /绘制函数/ }).click();
  await expect(page.getByRole('status')).toContainText('f(x) = abs(x)+1');
  await expect(page.getByText('已接收知识导航中的示例')).toHaveCount(0);
  // 选择预设：来源提示保持清除
  await page.getByRole('button', { name: '1/x', exact: true }).click();
  await expect(page.getByText('已接收知识导航中的示例')).toHaveCount(0);
  // 刷新后重新从链接进入：提示恢复
  await page.reload();
  await expect(page.getByText('已接收知识导航中的示例')).toBeVisible();
});

test('表达式与区间错误有明确反馈', async ({ page }) => {
  await page.goto('/#/plotting');
  await expect(page.getByRole('status')).toContainText('f(x)', {
    timeout: 20000,
  });
  await page.getByLabel('函数表达式 f(x)').fill('unknown(x)');
  await page.getByRole('button', { name: /绘制函数/ }).click();
  await expect(page.getByText('无法绘制', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '1/x', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('f(x) = 1/x');
  await page.getByLabel('左端点').fill('10');
  await page.getByRole('button', { name: /绘制函数/ }).click();
  await expect(
    page.getByText('左端点必须小于右端点', { exact: true }),
  ).toBeVisible();
});

test('函数名不能当作数值表达式', async ({ page }) => {
  await page.goto('/#/plotting');
  await expect(page.getByRole('status')).toContainText('f(x)', {
    timeout: 20000,
  });
  for (const expression of ['sin', 'x+sin']) {
    await page.getByLabel('函数表达式 f(x)').fill(expression);
    await page.getByRole('button', { name: /绘制函数/ }).click();
    await expect(page.getByText('无法绘制', { exact: true })).toBeVisible();
    await expect(page.getByText(/函数名 sin 不能作为数值使用/)).toBeVisible();
  }
  // 合法调用形式不受影响
  await page.getByLabel('函数表达式 f(x)').fill('sin(x)');
  await page.getByRole('button', { name: /绘制函数/ }).click();
  await expect(page.getByRole('status')).toContainText('f(x) = sin(x)');
});

test('绘图结果提供数据摘要与疑似间断标记，键盘可操作', async ({ page }) => {
  await page.goto('/#/plotting');
  await expect(page.getByRole('status')).toContainText('f(x)', {
    timeout: 20000,
  });
  // 键盘激活预设按钮：Tab 聚焦后 Enter 触发，不依赖鼠标
  await page.getByRole('button', { name: '1/x', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('f(x) = 1/x');
  await expect(
    page.getByRole('img', { name: '函数 1/x 的采样图像' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: '采样数据摘要' }),
  ).toBeVisible();
  await expect(page.getByText(/有效数据点：/)).toBeVisible();
  await expect(page.getByText(/有限值范围：/)).toBeVisible();
  await expect(page.getByText(/检测到.*处采样缺口位置：.*x = 0/)).toBeVisible();
  // 文案不把采样缺口表述成数学间断
  await expect(page.getByText(/虚线标记的是疑似间断位置/)).toBeVisible();
  await expect(
    page.getByText(/这些采样缺口不代表一定是数学间断/),
  ).toBeVisible();
  // Verify the actual canvas marker, not just the surrounding text.
  await expect
    .poll(async () =>
      page.locator('.function-chart canvas').evaluateAll(
        (canvases) =>
          canvases.some((element) => {
            const canvas = element as HTMLCanvasElement;
            const ctx = canvas.getContext('2d');
            if (!ctx) return false;
            const pixels = ctx.getImageData(
              0,
              0,
              canvas.width,
              canvas.height,
            ).data;
            let count = 0;
            for (let i = 0; i < pixels.length; i += 4) {
              if (
                pixels[i] >= 180 &&
                pixels[i] <= 220 &&
                pixels[i + 1] >= 100 &&
                pixels[i + 1] <= 155 &&
                pixels[i + 2] <= 70 &&
                pixels[i + 3] > 100
              )
                count++;
            }
            return count > 10;
          }),
        { timeout: 10000 },
      ),
    )
    .toBe(true);
  // 连续函数的摘要不含缺口表述
  await page.getByRole('button', { name: 'x^2', exact: true }).click();
  await expect(page.getByText('未检测到采样缺口。')).toBeVisible();
});

test('默认绘图设置可在刷新后保留', async ({ page }) => {
  await page.goto('/#/plotting');
  await expect(page.getByRole('status')).toContainText('f(x)', {
    timeout: 20000,
  });
  await page.getByRole('button', { name: 'sin(x)', exact: true }).click();
  await page.getByRole('button', { name: /保存默认设置/ }).click();
  await expect(page.getByText(/已保存到当前浏览器/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('函数表达式 f(x)')).toHaveValue('sin(x)');
});

test('无效表达式或区间不会覆盖已保存的默认设置', async ({ page }) => {
  await page.goto('/#/plotting');
  await expect(page.getByRole('status')).toContainText('f(x)', {
    timeout: 20000,
  });
  await page.getByRole('button', { name: 'sin(x)', exact: true }).click();
  await page.getByRole('button', { name: /保存默认设置/ }).click();
  await expect(page.getByText(/已保存到当前浏览器/)).toBeVisible();

  await page.getByLabel('函数表达式 f(x)').fill('unknown(x)');
  await page.getByRole('button', { name: /保存默认设置/ }).click();
  await expect(page.getByText(/未保存：/)).toBeVisible();
  await page.getByLabel('函数表达式 f(x)').fill('x');
  await page.getByLabel('左端点').fill('10');
  await page.getByRole('button', { name: /保存默认设置/ }).click();
  await expect(page.getByText('左端点必须小于右端点')).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('函数表达式 f(x)')).toHaveValue('sin(x)');
});

test('不兼容的默认设置可导出原始备份，清除需明确确认', async ({ page }) => {
  await page.goto('/#/plotting');
  const raw = JSON.stringify({ schemaVersion: 2, data: { sentinel: 'keep' } });
  await page.evaluate(
    (value) => localStorage.setItem('math-workbench:preferences', value),
    raw,
  );
  await page.reload();
  await expect(page.getByText('本地默认设置无法读取')).toBeVisible();
  await page.getByRole('button', { name: /保存默认设置/ }).click();
  await expect(
    page.getByText('旧设置无法读取，未覆盖原始数据。'),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem('math-workbench:preferences'),
    ),
  ).toBe(raw);
  // 备份导出：下载文件内容与本地原始字符串完全一致，且不修改存储
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '备份原始数据' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(
    'math-workbench-preferences-backup.json',
  );
  expect(readFileSync((await download.path())!, 'utf8')).toBe(raw);
  await expect(page.getByText(/已导出原始数据备份/)).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem('math-workbench:preferences'),
    ),
  ).toBe(raw);
  // 备份后取消清除：数据仍在
  await page.getByRole('button', { name: '清除旧设置' }).click();
  await page.getByRole('button', { name: /取\s*消/ }).click();
  expect(
    await page.evaluate(() =>
      localStorage.getItem('math-workbench:preferences'),
    ),
  ).toBe(raw);
  await page.getByRole('button', { name: '清除旧设置' }).click();
  await page.getByRole('button', { name: '确认清除' }).click();
  expect(
    await page.evaluate(() =>
      localStorage.getItem('math-workbench:preferences'),
    ),
  ).toBeNull();
});

test('矮窗口可以滚动侧栏访问全部导航项', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 300 });
  await page.goto('/');
  const last = page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: /AI 助教/ });
  await last.scrollIntoViewIfNeeded();
  const visible = await last.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= window.innerHeight;
  });
  expect(visible).toBe(true);
});

test('扩展模块与未知路由有真实状态', async ({ page }) => {
  await page.goto('/#/assistant');
  await expect(page.getByText('这是扩展入口，不是已完成功能')).toBeVisible();
  await page.goto('/#/does-not-exist');
  await expect(page.getByText('没有找到这个页面')).toBeVisible();
});

test('移动端导航与内容不横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: /知识导航/ })
    .click();
  await expect(
    page.getByPlaceholder('搜索概念、条件、例题或误区'),
  ).toBeVisible();
});

test('知识搜索覆盖条件、例题与误区', async ({ page }) => {
  await page.goto('/#/knowledge');
  const search = page.getByPlaceholder('搜索概念、条件、例题或误区');
  await expect(page.getByText('函数极限：靠近，而非到达')).toBeVisible();

  // 只在误区里出现
  await search.fill('倒过来');
  await expect(page.getByText('可导与连续：逆命题不成立')).toBeVisible();
  await expect(page.getByText('函数极限：靠近，而非到达')).toBeHidden();

  // 只在例题里出现
  await search.fill('左导数');
  await expect(page.getByText('可导与连续：逆命题不成立')).toBeVisible();

  // 只在适用条件里出现
  await search.fill('区间端点');
  await expect(page.getByText('连续性：先检查定义域')).toBeVisible();

  await search.fill('不存在的关键词');
  await expect(page.getByText(/没有找到匹配的知识点/)).toBeVisible();
});
