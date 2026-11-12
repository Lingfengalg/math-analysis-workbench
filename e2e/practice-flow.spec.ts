import { expect, test } from '@playwright/test';

test('导数练习错答进入错题本，重做答对后保留记录并更新复习状态', async ({
  page,
}) => {
  await page.goto('/#/knowledge?topic=derivative');
  await page.getByRole('link', { name: '开始导数练习' }).click();
  await page.getByRole('textbox', { name: '你的答案' }).fill('1/0');
  await page.getByRole('button', { name: '提交答案' }).click();
  await expect(page.getByText(/分母不能为零/)).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem('math-workbench:practice-attempts'),
    ),
  ).toBeNull();
  await page.getByRole('textbox', { name: '你的答案' }).fill('3');
  await page.getByRole('button', { name: '提交答案' }).click();
  await expect(page.getByText('还不正确，再试一次')).toBeVisible();
  await expect(page.getByText('作答已保存，错题已加入错题本。')).toBeVisible();
  await page.getByRole('button', { name: '再做一次' }).click();
  await page.getByRole('textbox', { name: '你的答案' }).fill('2');
  await page.getByRole('button', { name: '提交答案' }).click();
  await expect(page.getByText('回答正确')).toBeVisible();
  await expect(
    page.getByText(/如有对应练习错题，已标记为已复习/),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText('已作答 2 次，最近一次正确。')).toBeVisible();
  await page.getByRole('button', { name: '返回错题本' }).click();
  await expect(page).toHaveURL(/#\/mistakes\?topic=derivative$/);
  await expect(page.getByRole('heading', { name: /把一次错误/ })).toBeVisible();
  await expect(page.getByText('求二次函数在一点的导数')).toBeVisible();
  await expect(page.getByText('已复习', { exact: true }).first()).toBeVisible();
});

test('练习记录可导出、清除和重新导入，不删除错题', async ({ page }) => {
  await page.goto('/#/mistakes?topic=derivative&practice=1');
  await page.getByRole('textbox', { name: '你的答案' }).fill('3');
  await page.getByRole('button', { name: '提交答案' }).click();
  await expect(page.getByText('作答已保存，错题已加入错题本。')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出练习记录' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error('备份下载失败');
  await page.getByRole('button', { name: '清除记录' }).click();
  await page.getByRole('button', { name: '确认清除' }).click();
  await expect(page.getByText('还没有作答记录。')).toBeVisible();
  await page.getByLabel('导入练习记录').setInputFiles(path);
  await expect(
    page.getByText('练习记录已合并；未自动更改错题本。'),
  ).toBeVisible();
  await expect(page.getByText('已作答 1 次，最近一次未答对。')).toBeVisible();
  await page.getByRole('button', { name: '返回错题本' }).click();
  await expect(page).toHaveURL(/#\/mistakes\?topic=derivative$/);
  await expect(page.getByRole('heading', { name: /把一次错误/ })).toBeVisible();
  await expect(page.getByText('求二次函数在一点的导数')).toBeVisible();
});

test('两个标签页同时作答不会丢记录且最终复习状态与最后结果一致', async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await Promise.all([
    page.goto('/#/mistakes?topic=derivative&practice=1'),
    other.goto('/#/mistakes?topic=derivative&practice=1'),
  ]);
  await page.getByRole('textbox', { name: '你的答案' }).fill('3');
  await other.getByRole('textbox', { name: '你的答案' }).fill('2');
  await Promise.all([
    page.getByRole('button', { name: '提交答案' }).click(),
    other.getByRole('button', { name: '提交答案' }).click(),
  ]);
  await expect(page.getByText('作答已保存，错题已加入错题本。')).toBeVisible();
  await expect(
    other.getByText(/如有对应练习错题，已标记为已复习/),
  ).toBeVisible();
  const stored = await page.evaluate(() => ({
    progress: JSON.parse(
      localStorage.getItem('math-workbench:practice-attempts')!,
    ),
    mistakes: JSON.parse(localStorage.getItem('math-workbench:mistakes')!),
  }));
  const attempts = stored.progress.data.attempts;
  expect(attempts).toHaveLength(2);
  expect(stored.mistakes.data.items).toHaveLength(1);
  expect(stored.mistakes.data.items[0].reviewedAt !== null).toBe(
    attempts.at(-1).correct,
  );
  await other.close();
});

test('自由文本错题先输入思路，再查看订正并自行标记', async ({ page }) => {
  await page.goto('/#/mistakes');
  await page.getByRole('button', { name: '记录错题' }).click();
  await page.getByLabel('题目', { exact: true }).fill('自定义练习');
  await page.getByLabel('题目内容').fill('求函数极限');
  await page.getByLabel('订正与正确思路').fill('测试订正内容');
  await page.getByRole('button', { name: /保\s*存/ }).click();
  await page.getByRole('button', { name: '重做' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('测试订正内容')).toHaveCount(0);
  await expect(page.getByText('测试订正内容')).toBeHidden();
  await dialog.getByLabel(/你的思路/).fill('我的推导');
  await dialog.getByRole('button', { name: '查看订正' }).click();
  await expect(dialog.getByText('测试订正内容')).toBeVisible();
  await dialog.getByRole('button', { name: '已掌握，标记已复习' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('已复习', { exact: true }).first()).toBeVisible();
});

test('严格 CSP 下使用 Perseus 评分分数答案', async ({ page }) => {
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
  const response = await page.goto('/#/mistakes?topic=limit&practice=1');
  expect(response?.headers()['content-security-policy']).toContain(
    "script-src 'self'",
  );
  await page.getByRole('textbox', { name: '你的答案' }).fill('1/2');
  await page.getByRole('button', { name: '提交答案' }).click();
  await expect(page.getByText('回答正确')).toBeVisible();
  await expect(
    page.getByText(/如有对应练习错题，已标记为已复习/),
  ).toBeVisible();
});
