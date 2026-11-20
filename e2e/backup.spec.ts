import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

test('完整备份可导出、清理后按模块恢复 (#85)', async ({ page }) => {
  await page.goto('/#/mistakes');
  await page.getByRole('button', { name: /记录错题/ }).click();
  await page.getByLabel('题目', { exact: true }).fill('完整备份测试题');
  await page.getByRole('button', { name: /保\s*存/ }).click();
  await expect(page.getByText('完整备份测试题')).toBeVisible();

  await page.goto('/#/backup');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /导出完整备份/ }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();

  // 清空本机数据，模拟换浏览器
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.goto('/#/mistakes');
  await expect(page.getByText(/还没有错题记录/)).toBeVisible();
  await page.goto('/#/backup');

  await page.getByLabel('选择完整备份文件').setInputFiles(path!);
  await expect(page.getByText('预览')).toBeVisible();
  await page.getByRole('button', { name: /恢复选中模块/ }).click();
  await expect(page.getByText(/已恢复 \d+ 个模块/)).toBeVisible();

  await page.goto('/#/mistakes');
  await expect(page.getByText('完整备份测试题')).toBeVisible();
});

test('未知版本的完整备份会被拒绝且不改动数据 (#85)', async ({ page }) => {
  const file = join(tmpdir(), `backup-unknown-${Date.now()}.json`);
  writeFileSync(
    file,
    JSON.stringify({
      format: 'math-analysis-workbench/full-backup',
      version: 99,
      exportedAt: '2026-11-21T00:00:00.000Z',
      modules: { mistakes: { items: [] } },
    }),
  );

  await page.goto('/#/backup');
  await page.getByLabel('选择完整备份文件').setInputFiles(file);
  await expect(page.getByText(/备份版本不支持/)).toBeVisible();
  await expect(page.getByText('预览')).toHaveCount(0);
});
