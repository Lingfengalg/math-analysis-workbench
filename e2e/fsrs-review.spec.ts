import { expect, test } from '@playwright/test';

test('错题自评生成 FSRS 计划并刷新保留，再次到期后重做', async ({ page }) => {
  await page.goto('/#/mistakes');
  await page.getByRole('button', { name: '记录错题' }).click();
  await page.getByLabel('题目', { exact: true }).fill('复习极限');
  await page.getByLabel('题目内容').fill('求极限');
  await page.getByLabel('订正与正确思路').fill('先看左右极限');
  await page.getByRole('button', { name: /保\s*存/ }).click();
  const plan = page.getByRole('region', { name: '错题复习计划' });
  await expect(plan).toContainText('1');
  await plan.getByRole('button', { name: '开始复习' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/你的思路/).fill('分别计算');
  await dialog.getByRole('button', { name: '查看订正' }).click();
  await dialog.getByRole('button', { name: '已掌握，标记已复习' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/下次复习：/).last()).toBeVisible();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('math-workbench:mistakes')!),
  );
  expect(stored.schemaVersion).toBe(2);
  expect(stored.data.items[0].schedule.algorithm).toBe('FSRS-6');
  expect(stored.data.items[0].schedule.reps).toBe(1);
  await page.reload();
  await expect(plan).toContainText('0');
  await expect(page.getByText(/下次复习：/).last()).toBeVisible();
  const exported = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '导出 JSON' }).click(),
  ]);
  const contents = await exported[0].createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of contents) chunks.push(Buffer.from(chunk));
  const backup = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  expect(backup.version).toBe(2);
  expect(backup.items[0].schedule).toEqual(stored.data.items[0].schedule);
  await page.clock.install({
    time: new Date(stored.data.items[0].schedule.due + 1000),
  });
  await page.reload();
  await expect(plan).toContainText('1');
  await plan.getByRole('button', { name: '开始复习' }).click();
  await dialog.getByLabel(/你的思路/).fill('再次思考');
  await dialog.getByRole('button', { name: '查看订正' }).click();
  await dialog.getByRole('button', { name: '仍需复习' }).click();
  await expect(dialog).toBeHidden();
  const second = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('math-workbench:mistakes')!),
  );
  expect(second.data.items[0].schedule.reps).toBe(2);
  expect(second.data.items[0].schedule.lastRating).toBe(1);
});
