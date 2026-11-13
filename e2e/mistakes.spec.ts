import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('错题本可以新增、刷新后保留、编辑并删除', async ({ page }) => {
  await page.goto('/#/mistakes');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    '把一次错误',
  );
  await expect(page.getByText(/还没有错题记录/)).toBeVisible();

  await page.getByRole('button', { name: /记录错题/ }).click();
  await page.getByLabel('题目', { exact: true }).fill('1/x 在 0 处连续吗');
  await page.getByLabel('题目内容').fill('讨论 1/x 在 x = 0 处的连续性。');
  await page.getByLabel('错误原因').fill('把 0 当成定义域内的点。');
  await page
    .getByLabel('订正与正确思路')
    .fill('先看定义域：0 不在 1/x 的定义域内，因此谈不上连续。');
  await page.getByRole('button', { name: /保\s*存/ }).click();

  await expect(page.getByText('已记录一条错题。')).toBeVisible();
  await expect(page.getByText('1/x 在 0 处连续吗')).toBeVisible();

  await page.reload();
  await expect(page.getByText('1/x 在 0 处连续吗')).toBeVisible();
  await expect(page.getByText('把 0 当成定义域内的点。')).toBeVisible();

  await page.getByRole('button', { name: /编辑/ }).click();
  await page
    .getByLabel('题目', { exact: true })
    .fill('1/x 在 0 处连续吗（订正）');
  await page.getByRole('button', { name: /保\s*存/ }).click();
  await expect(page.getByText('已更新这条错题。')).toBeVisible();
  await expect(page.getByText('1/x 在 0 处连续吗（订正）')).toBeVisible();

  await page.getByRole('button', { name: /删除/ }).click();
  await expect(page.getByText('删除这条错题？')).toBeVisible();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(page.getByText('已删除这条错题。')).toBeVisible();
  await expect(page.getByText(/还没有错题记录/)).toBeVisible();
});

test('错题本可以按主题筛选并搜索', async ({ page }) => {
  await page.goto('/#/mistakes');
  await page.getByRole('button', { name: /记录错题/ }).click();
  await page.getByLabel('题目', { exact: true }).fill('极限存在的条件');
  await page.getByRole('button', { name: /保\s*存/ }).click();
  await expect(page.getByText('极限存在的条件')).toBeVisible();

  await page.getByLabel('搜索错题').fill('不存在的内容');
  await expect(page.getByText(/没有匹配的错题/)).toBeVisible();
  await page.getByLabel('搜索错题').fill('极限');
  await expect(page.getByText('极限存在的条件')).toBeVisible();

  await page.getByText('导数', { exact: true }).click();
  await expect(page.getByText(/没有匹配的错题/)).toBeVisible();
  await expect(page).toHaveURL(/#\/mistakes\?topic=derivative$/);
  await page.goBack();
  await expect(page.getByText('极限存在的条件')).toBeVisible();
  await page.goForward();
  await expect(page.getByText(/没有匹配的错题/)).toBeVisible();
});

test('从知识点打开相应错题并按主题记录', async ({ page }) => {
  await page.goto('/#/knowledge?topic=derivative');
  await page.getByRole('link', { name: '查看「导数」错题' }).click();
  await expect(page).toHaveURL(/#\/mistakes\?topic=derivative$/);
  await expect(page.getByText(/还没有错题记录/)).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: /记录错题/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('导数', { exact: true })).toBeVisible();
  await dialog.getByLabel('题目', { exact: true }).fill('绝对值为何不可导');
  await dialog.getByRole('button', { name: /保\s*存/ }).click();
  await expect(page.getByText('绝对值为何不可导')).toBeVisible();
  await page.reload();
  await expect(page.getByText('绝对值为何不可导')).toBeVisible();
  await page.getByRole('link', { name: '查看「导数」相关知识' }).click();
  await expect(page.getByText('可导与连续：逆命题不成立')).toBeVisible();
});

test('预选主题可修改，修改后记录不被错误覆盖', async ({ page }) => {
  await page.goto('/#/mistakes?topic=derivative');
  await page.getByRole('button', { name: /记录错题/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('导数', { exact: true })).toBeVisible();
  await dialog.getByLabel('知识主题').click();
  await page
    .locator('.ant-select-dropdown')
    .getByText('连续', { exact: true })
    .click();
  await dialog.getByLabel('题目', { exact: true }).fill('改为连续的记录');
  await dialog.getByRole('button', { name: /保\s*存/ }).click();
  await expect(page.getByText('已记录一条错题。')).toBeVisible();
  await expect(
    page.getByText('没有匹配的错题，换个关键词或调整筛选条件。'),
  ).toBeVisible();
  await page
    .getByRole('radiogroup', { name: '按知识主题筛选' })
    .getByText('全部')
    .click();
  await expect(page.getByText('改为连续的记录')).toBeVisible();
  await expect(
    page.getByRole('link', { name: '查看「连续」相关知识' }),
  ).toBeVisible();
});

test('错题可以按主题回到知识导航，其他主题不显示无效入口', async ({ page }) => {
  await page.goto('/#/mistakes');
  await page.evaluate(() => {
    localStorage.setItem(
      'math-workbench:mistakes',
      JSON.stringify({
        schemaVersion: 1,
        data: {
          items: [
            {
              id: 'derivative-1',
              title: '导数错题',
              topic: 'derivative',
              problem: '私有题目',
              mistakeReason: '',
              correction: '',
              createdAt: 1,
              updatedAt: 1,
              reviewedAt: null,
            },
            {
              id: 'other-1',
              title: '其他错题',
              topic: 'other',
              problem: '',
              mistakeReason: '',
              correction: '',
              createdAt: 2,
              updatedAt: 2,
              reviewedAt: null,
            },
          ],
        },
      }),
    );
  });
  await page.reload();
  await expect(page.getByText('导数错题')).toBeVisible();
  await expect(
    page.getByRole('link', { name: /查看「其他」相关知识/ }),
  ).toHaveCount(0);
  await page.getByRole('link', { name: '查看「导数」相关知识' }).click();
  await expect(page).toHaveURL(/#\/knowledge\?topic=derivative$/);
  await expect(page.getByText('可导与连续：逆命题不成立')).toBeVisible();
  await expect(page.getByText('函数极限：靠近，而非到达')).toHaveCount(0);
  expect(page.url()).not.toContain('私有题目');
  await page.goBack();
  await expect(page.getByText('导数错题')).toBeVisible();
  await expect(page.getByText('私有题目')).toBeVisible();
});

test('两个标签页交替新增与删除不会互相覆盖', async ({ page, context }) => {
  await page.goto('/#/mistakes');
  const second = await context.newPage();
  await second.goto('/#/mistakes');
  await expect(page.getByText(/还没有错题记录/)).toBeVisible();
  await expect(second.getByText(/还没有错题记录/)).toBeVisible();

  await page.getByRole('button', { name: /记录错题/ }).click();
  await page.getByLabel('题目', { exact: true }).fill('A 页新增');
  await page.getByRole('button', { name: /保\s*存/ }).click();
  await expect(page.getByText('A 页新增')).toBeVisible();

  // 另一个标签页无需刷新即可看到 A 页的写入
  await expect(second.getByText('A 页新增')).toBeVisible();

  // B 页此时状态是新的，但旧实现仍会用整表覆盖；这里验证两条都在
  await second.getByRole('button', { name: /记录错题/ }).click();
  await second.getByLabel('题目', { exact: true }).fill('B 页新增');
  await second.getByRole('button', { name: /保\s*存/ }).click();
  await expect(second.getByText('B 页新增')).toBeVisible();

  await page.reload();
  await expect(page.getByText('A 页新增')).toBeVisible();
  await expect(page.getByText('B 页新增')).toBeVisible();
  await expect(page.getByText(/共 2 条错题/)).toBeVisible();

  await page
    .locator('.ant-card', { hasText: 'A 页新增' })
    .getByRole('button', { name: /删除/ })
    .click();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(page.getByText('A 页新增')).toBeHidden();

  await expect(second.getByText('A 页新增')).toBeHidden();
  await expect(second.getByText('B 页新增')).toBeVisible();
  await second.close();
});

test('另一页删除后，本页编辑会提示冲突而不是复活记录', async ({
  page,
  context,
}) => {
  await page.goto('/#/mistakes');
  const second = await context.newPage();
  await second.goto('/#/mistakes');

  await page.getByRole('button', { name: /记录错题/ }).click();
  await page.getByLabel('题目', { exact: true }).fill('共享记录');
  await page.getByRole('button', { name: /保\s*存/ }).click();
  await expect(second.getByText('共享记录')).toBeVisible();

  await second
    .locator('.ant-card', { hasText: '共享记录' })
    .getByRole('button', { name: /编辑/ })
    .click();

  await page
    .locator('.ant-card', { hasText: '共享记录' })
    .getByRole('button', { name: /删除/ })
    .click();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(page.getByText(/还没有错题记录/)).toBeVisible();

  await second.getByLabel('题目', { exact: true }).fill('试图编辑');
  await second.getByRole('button', { name: /保\s*存/ }).click();
  await expect(second.getByText(/已不存在/)).toBeVisible();

  await second.close();
  await page.reload();
  await expect(page.getByText(/还没有错题记录/)).toBeVisible();
});

test('同一错题在两页同时编辑时保留草稿并拒绝覆盖', async ({
  page,
  context,
}) => {
  await page.goto('/#/mistakes');
  await page.getByRole('button', { name: /记录错题/ }).click();
  await page.getByLabel('题目', { exact: true }).fill('共享错题');
  await page.getByRole('button', { name: /保\s*存/ }).click();
  await expect(page.getByText('共享错题')).toBeVisible();
  const second = await context.newPage();
  await second.goto('/#/mistakes');
  await page.getByRole('button', { name: /编辑/ }).click();
  await second.getByRole('button', { name: /编辑/ }).click();
  await page.getByLabel('题目', { exact: true }).fill('A 的修改');
  await second.getByLabel('题目', { exact: true }).fill('B 的草稿');
  await page.getByRole('button', { name: /保\s*存/ }).click();
  await expect(page.getByText('A 的修改')).toBeVisible();
  await second.getByRole('button', { name: /保\s*存/ }).click();
  await expect(second.getByText(/已在其他标签页修改/)).toBeVisible();
  await expect(second.getByLabel('题目', { exact: true })).toHaveValue(
    'B 的草稿',
  );
  await page.reload();
  await expect(page.getByText('A 的修改')).toBeVisible();
  await second.close();
});

test('两个标签页同时新增不会互相覆盖', async ({ page, context }) => {
  await page.goto('/#/mistakes');
  const second = await context.newPage();
  await second.goto('/#/mistakes');
  for (const [p, title] of [
    [page, '并发 A'],
    [second, '并发 B'],
  ] as const) {
    await p.getByRole('button', { name: /记录错题/ }).click();
    await p.getByLabel('题目', { exact: true }).fill(title);
  }
  await Promise.all(
    [page, second].map((p) =>
      p.getByRole('button', { name: /保\s*存/ }).click(),
    ),
  );
  await expect(page.getByText('并发 A')).toBeVisible();
  await expect(page.getByText('并发 B')).toBeVisible();
  await page.reload();
  await expect(page.getByText('并发 A')).toBeVisible();
  await expect(page.getByText('并发 B')).toBeVisible();
  await second.close();
});

test('删除确认期间被另一页修改时拒绝删除并保留新内容', async ({
  page,
  context,
}) => {
  await page.goto('/#/mistakes');
  const second = await context.newPage();
  await second.goto('/#/mistakes');

  await page.getByRole('button', { name: /记录错题/ }).click();
  await page.getByLabel('题目', { exact: true }).fill('待删除的错题');
  await page.getByRole('button', { name: /保\s*存/ }).click();
  await expect(second.getByText('待删除的错题')).toBeVisible();

  // A 打开删除确认
  await page
    .locator('.ant-card', { hasText: '待删除的错题' })
    .getByRole('button', { name: /删除/ })
    .click();

  // B 在此期间修改同一条记录
  await second
    .locator('.ant-card', { hasText: '待删除的错题' })
    .getByRole('button', { name: /编辑/ })
    .click();
  await second.getByLabel('题目', { exact: true }).fill('B 页改过的版本');
  await second.getByRole('button', { name: /保\s*存/ }).click();
  await expect(second.getByText('B 页改过的版本')).toBeVisible();

  // A 再确认删除：应被拒绝
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(page.getByText(/未删除/)).toBeVisible();

  await page.reload();
  await expect(page.getByText('B 页改过的版本')).toBeVisible();
  await second.close();
});

test('另一页写入损坏数据时当前页同步显示读取错误，恢复后消失', async ({
  page,
  context,
}) => {
  await page.goto('/#/mistakes');
  const second = await context.newPage();
  await second.goto('/#/mistakes');
  await expect(page.getByText(/还没有错题记录/)).toBeVisible();

  await second.evaluate(() => {
    localStorage.setItem(
      'math-workbench:mistakes',
      '{"schemaVersion":1,"data":{"items":"broken"}}',
    );
  });
  await expect(page.getByText('本地错题数据无法读取')).toBeVisible();

  await second.evaluate(() => {
    localStorage.removeItem('math-workbench:mistakes');
  });
  await expect(page.getByText('本地错题数据无法读取')).toBeHidden();

  await second.close();
});

test('可以导出备份、导入文件并标记复习', async ({ page }) => {
  await page.goto('/#/mistakes');
  await page.getByRole('button', { name: /记录错题/ }).click();
  await page.getByLabel('题目', { exact: true }).fill('导出测试的错题');
  await page.getByRole('button', { name: /保\s*存/ }).click();
  await expect(page.getByText('导出测试的错题')).toBeVisible();

  await page.getByRole('button', { name: /标记已复习/ }).click();
  await expect(page.locator('.ant-tag', { hasText: '已复习' })).toBeVisible();
  await page.reload();
  await expect(page.locator('.ant-tag', { hasText: '已复习' })).toBeVisible();
  await expect(page.getByText(/最近复习/)).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /导出 JSON/ }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(
    /^mistakes-\d{4}-\d{2}-\d{2}\.json$/,
  );
  const filePath = await download.path();
  const payload = JSON.parse(readFileSync(filePath!, 'utf8'));
  expect(payload.format).toBe('math-analysis-workbench/mistakes');
  expect(payload.items).toHaveLength(1);

  payload.items.push({
    ...payload.items[0],
    id: 'imported-e2e',
    title: '导入进来的错题',
    reviewedAt: null,
  });

  await page.getByRole('button', { name: /导入/ }).click();
  await page.setInputFiles('input[type="file"]', {
    name: 'mistakes.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  });
  await expect(page.getByText(/已选择：mistakes.json/)).toBeVisible();
  const importOk = page
    .getByRole('dialog')
    .filter({ hasText: '选择 JSON 文件' })
    .getByRole('button', { name: /导\s*入/ });
  await expect(importOk).toBeEnabled();
  await importOk.click();

  await expect(page.getByText('已合并导入 2 条错题。')).toBeVisible();
  await expect(page.getByText('导入进来的错题')).toBeVisible();
  await expect(page.getByText('导出测试的错题')).toBeVisible();
});

test('快速切换导入文件不会显示或导入先前文件', async ({ page }) => {
  await page.addInitScript(() => {
    const original = FileReader.prototype.readAsText;
    FileReader.prototype.readAsText = function (file, encoding) {
      const delay =
        file instanceof File && file.name === 'slow.json' ? 900 : 30;
      window.setTimeout(() => original.call(this, file, encoding), delay);
    };
  });
  await page.goto('/#/mistakes');
  await page.getByRole('button', { name: /导入/ }).click();
  const dialog = page.getByRole('dialog');
  const backup = (id: string, title: string) =>
    Buffer.from(
      JSON.stringify({
        format: 'math-analysis-workbench/mistakes',
        version: 2,
        exportedAt: '2026-11-12',
        items: [
          {
            id,
            title,
            topic: 'limit',
            problem: '',
            mistakeReason: '',
            correction: '',
            createdAt: 1,
            updatedAt: 1,
            reviewedAt: null,
          },
        ],
      }),
    );
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'slow.json',
    mimeType: 'application/json',
    buffer: backup('slow', '旧文件题目'),
  });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'fast.json',
    mimeType: 'application/json',
    buffer: backup('fast', '新文件题目'),
  });
  await expect(dialog.getByText(/已选择：fast.json/)).toBeVisible();
  await expect(dialog.getByText(/1 条错题/)).toBeVisible();
  await page.waitForTimeout(1100);
  await dialog.getByRole('button', { name: /导\s*入/ }).click();
  await expect(page.getByText('新文件题目')).toBeVisible();
  await expect(page.getByText('旧文件题目')).toHaveCount(0);
});

test('损坏的重复 ID 数据可原样备份，且不会被新写入覆盖', async ({ page }) => {
  const item = {
    id: 'same',
    title: '第一条',
    topic: 'limit',
    problem: '',
    mistakeReason: '',
    correction: '',
    createdAt: 1,
    updatedAt: 1,
    reviewedAt: null,
  };
  const raw = JSON.stringify({
    schemaVersion: 2,
    data: { items: [item, { ...item, title: '第二条' }] },
  });
  await page.addInitScript(
    (data) => localStorage.setItem('math-workbench:mistakes', data),
    raw,
  );
  await page.goto('/#/mistakes');
  await expect(page.getByText('本地错题数据无法读取')).toBeVisible();
  await expect(page.getByRole('button', { name: '记录错题' })).toBeDisabled();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '下载原始数据' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('mistakes-raw-backup.txt');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString('utf8')).toBe(raw);
  expect(
    await page.evaluate(() => localStorage.getItem('math-workbench:mistakes')),
  ).toBe(raw);
});

test('导入时旧 FSRS 备份不会回滚已有复习计划', async ({ page }) => {
  const schedule = {
    version: 1,
    algorithm: 'FSRS-6',
    due: 9000,
    lastReview: 5000,
    stability: 1,
    difficulty: 5,
    elapsedDays: 0,
    scheduledDays: 1,
    learningSteps: 0,
    reps: 2,
    lapses: 0,
    state: 2,
    lastRating: 3,
  };
  const item = {
    id: 'one',
    title: '有计划的错题',
    topic: 'limit',
    problem: '',
    mistakeReason: '',
    correction: '',
    createdAt: 1000,
    updatedAt: 5000,
    reviewedAt: 5000,
    schedule,
  };
  const raw = JSON.stringify({ schemaVersion: 2, data: { items: [item] } });
  await page.addInitScript(
    (data) => localStorage.setItem('math-workbench:mistakes', data),
    raw,
  );
  await page.goto('/#/mistakes');
  await page.getByRole('button', { name: /导入/ }).click();
  const dialog = page.getByRole('dialog');
  const backup = {
    format: 'math-analysis-workbench/mistakes',
    version: 2,
    exportedAt: '2026-11-12',
    items: [
      {
        ...item,
        updatedAt: 6000,
        schedule: { ...schedule, lastReview: 2000, reps: 1 },
      },
    ],
  };
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'old.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(dialog.getByText(/1 条错题/)).toBeVisible();
  await dialog.getByRole('button', { name: /导\s*入/ }).click();
  await expect(dialog.getByText(/覆盖已有复习计划/)).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem('math-workbench:mistakes')),
  ).toBe(raw);
});

test('读取新文件期间禁止提交之前已选中的备份', async ({ page }) => {
  await page.addInitScript(() => {
    const original = FileReader.prototype.readAsText;
    FileReader.prototype.readAsText = function (file, encoding) {
      window.setTimeout(
        () => original.call(this, file, encoding),
        file instanceof File && file.name === 'slow.json' ? 1000 : 10,
      );
    };
  });
  await page.goto('/#/mistakes');
  await page.getByRole('button', { name: /导入/ }).click();
  const dialog = page.getByRole('dialog');
  const buffer = Buffer.from(
    JSON.stringify({
      format: 'math-analysis-workbench/mistakes',
      version: 2,
      exportedAt: '2026-11-12',
      items: [],
    }),
  );
  const select = dialog.locator('input[type="file"]');
  const confirm = dialog.getByRole('button', { name: /导\s*入/ });
  await select.setInputFiles({
    name: 'fast.json',
    mimeType: 'application/json',
    buffer,
  });
  await expect(confirm).toBeEnabled();
  await select.setInputFiles({
    name: 'slow.json',
    mimeType: 'application/json',
    buffer,
  });
  await expect(confirm).toBeDisabled();
  await expect(confirm).toBeEnabled({ timeout: 5000 });
});

test('超大备份在读取前被拒绝且不改变本地错题', async ({ page }) => {
  await page.goto('/#/mistakes');
  await page.getByRole('button', { name: /导入/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[type="file"]').evaluate((input) => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([new Uint8Array(12 * 1024 * 1024 + 1)], 'huge.json', {
        type: 'application/json',
      }),
    );
    const element = input as HTMLInputElement;
    element.files = transfer.files;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(dialog.getByText(/超过 12 MiB/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: /导\s*入/ })).toBeDisabled();
  expect(
    await page.evaluate(() => localStorage.getItem('math-workbench:mistakes')),
  ).toBeNull();
});

test('错题可以标注错因、按错因筛选并查看分布（#68）', async ({ page }) => {
  await page.goto('/#/mistakes');

  const pickOption = async (text: string) => {
    await page
      .locator('.ant-select-dropdown:visible .ant-select-item-option')
      .filter({ hasText: text })
      .first()
      .click();
  };

  const addWithCause = async (title: string, cause: string) => {
    await page.getByRole('button', { name: /记录错题/ }).click();
    await page.getByLabel('题目', { exact: true }).fill(title);
    await page.getByLabel('错因归类（可选）').click();
    await pickOption(cause);
    await page.getByRole('button', { name: /保\s*存/ }).click();
    await expect(page.getByText(title)).toBeVisible();
  };

  await addWithCause('错因-概念题', '概念不清');
  await addWithCause('错因-计算题', '计算错误');

  // 分布统计按全部记录计算
  const stats = page.getByRole('group', { name: '错因分布' });
  await expect(stats).toBeVisible();
  await expect(stats).toContainText('概念不清 1');
  await expect(stats).toContainText('计算错误 1');
  await expect(stats.getByText(/未分类/)).toHaveCount(0);

  // 按错因筛选
  await page.getByLabel('按错因筛选').click();
  await pickOption('概念不清');
  await expect(page.getByText('错因-概念题')).toBeVisible();
  await expect(page.getByText('错因-计算题')).toBeHidden();

  // 刷新后错因仍在
  await page.reload();
  await expect(stats).toContainText('概念不清 1');
  await expect(page.getByText('错因-概念题')).toBeVisible();
});
