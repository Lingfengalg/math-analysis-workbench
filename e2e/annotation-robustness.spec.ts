import { expect, test, type Page } from '@playwright/test';

const canvas = (page: Page) =>
  page.locator('canvas[data-annotation-canvas="true"]');

const KEY = 'math-workbench:annotation:/knowledge';

async function enable(page: Page) {
  if (await page.getByText('退出批注', { exact: true }).count()) return;
  await page.getByText('批注', { exact: true }).click();
  await page.waitForTimeout(250);
}

async function draw(page: Page) {
  const box = (await canvas(page).boundingBox())!;
  const x = box.x + box.width * 0.3;
  const y = Math.min(box.y + 300, 800);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 100, y + 40, { steps: 4 });
  await page.mouse.up();
}

async function storedCount(page: Page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw).data.items.length : 0;
  }, KEY);
}

test('防抖窗口内立即刷新也能保存最后一次修改 (#33)', async ({ page }) => {
  await page.goto('/#/knowledge');
  await enable(page);
  await draw(page);
  // 不等待 250ms 防抖，立刻刷新
  await page.reload();
  await page.waitForTimeout(600);

  expect(await storedCount(page)).toBe(1);
  // 刷新后画布应恢复笔迹
  await enable(page);
  await expect(canvas(page)).toBeVisible();
});

test('保存失败时保留草稿并可重试 (#34)', async ({ page }) => {
  await page.goto('/#/knowledge');
  await enable(page);

  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as unknown as { __restoreSetItem: () => void }).__restoreSetItem =
      () => {
        Storage.prototype.setItem = original;
      };
    Storage.prototype.setItem = () => {
      throw new Error('quota');
    };
  });

  await draw(page);
  await expect(page.getByText(/未保存的批注已保留/)).toBeVisible({
    timeout: 5000,
  });
  await expect(page.getByRole('button', { name: /重试保存/ })).toBeVisible();

  // 恢复正常存储后重试
  await page.evaluate(() =>
    (window as unknown as { __restoreSetItem: () => void }).__restoreSetItem(),
  );
  await page.getByRole('button', { name: /重试保存/ }).click();
  await expect.poll(async () => storedCount(page)).toBe(1);
});

test('文字输入阶段就限制长度，不会先显示后保存失败 (#36)', async ({ page }) => {
  await page.goto('/#/knowledge');
  await enable(page);
  await page.locator('.ant-segmented-item', { hasText: '文字' }).click();

  const box = (await canvas(page).boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.4, box.y + 300);

  const editor = page.locator('textarea[data-annotation-editor="true"]');
  await expect(editor).toBeVisible();
  await editor.pressSequentially('x'.repeat(520));
  const length = await editor.evaluate(
    (element) => (element as HTMLTextAreaElement).value.length,
  );
  expect(length).toBe(500);

  await editor.press('Enter');
  await expect
    .poll(async () =>
      page.evaluate((key) => {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const text = JSON.parse(raw).data.items.find(
          (item: { kind: string }) => item.kind === 'text',
        );
        return text ? text.text.length : null;
      }, KEY),
    )
    .toBe(500);
});

test('达到单页条目上限时拒绝新增并提示 (#36)', async ({ page }) => {
  await page.goto('/#/knowledge');
  await page.evaluate((key) => {
    const items = Array.from({ length: 2000 }, (_, index) => ({
      kind: 'text',
      id: `t${index}`,
      color: '#1f2937',
      x: 0.01,
      y: 0.01,
      text: 'x',
    }));
    localStorage.setItem(
      key,
      JSON.stringify({
        schemaVersion: 1,
        data: { pageId: '/knowledge', items },
      }),
    );
  }, KEY);
  await page.reload();
  await enable(page);
  await draw(page);

  await expect(page.getByText(/本页最多 2000 条批注/)).toBeVisible();
  expect(await storedCount(page)).toBe(2000);
});

test('保存失败后切页，草稿不会写到别的页面 (#33 #34)', async ({ page }) => {
  await page.goto('/#/knowledge');
  await enable(page);

  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as unknown as { __restoreSetItem: () => void }).__restoreSetItem =
      () => {
        Storage.prototype.setItem = original;
      };
    Storage.prototype.setItem = () => {
      throw new Error('quota');
    };
  });
  await draw(page);
  await expect(page.getByText(/未保存的批注已保留/)).toBeVisible({
    timeout: 5000,
  });

  // 切到绘图页：pending 仍属于 /knowledge
  await page.getByRole('link', { name: /绘图计算/ }).click();
  await page.waitForTimeout(500);
  await page.evaluate(() =>
    (window as unknown as { __restoreSetItem: () => void }).__restoreSetItem(),
  );

  // 回到知识页：切页时会先 flush，待保存的草稿应写回 /knowledge
  await page.getByRole('link', { name: /知识导航/ }).click();
  await page.waitForTimeout(600);

  await expect.poll(async () => storedCount(page)).toBe(1);
  const plotting = await page.evaluate(() =>
    localStorage.getItem('math-workbench:annotation:/plotting'),
  );
  const plottingCount = plotting ? JSON.parse(plotting).data.items.length : 0;
  expect(plottingCount).toBe(0);
});

test('两个标签页在同一页画批注不会互相覆盖 (#32)', async ({
  page,
  context,
}) => {
  await page.goto('/#/knowledge');
  const second = await context.newPage();
  await second.goto('/#/knowledge');

  await enable(page);
  await enable(second);

  await draw(page);
  await page.waitForTimeout(500);
  await draw(second);
  await page.waitForTimeout(600);

  expect(await storedCount(page)).toBe(2);
  await second.close();
});

test('已清空的页面不会被旧标签页写回，并提示草稿已丢弃 (#32 #45)', async ({
  page,
  context,
}) => {
  await page.goto('/#/knowledge');
  const second = await context.newPage();
  await second.goto('/#/knowledge');
  await enable(page);
  await enable(second);

  await draw(page);
  await page.waitForTimeout(400);
  await draw(page);
  await page.waitForTimeout(500);
  expect(await storedCount(page)).toBe(2);

  await page.locator('button[aria-label="清空本页批注"]').click();
  await page.waitForTimeout(500);
  expect(await storedCount(page)).toBe(0);

  // #45 起：旧标签页在清空后的写入会被识别为过期草稿并丢弃，同时给出提示
  await draw(second);
  await expect
    .poll(() => second.getByText(/检测到其他标签页清空了批注/).count(), {
      timeout: 5000,
    })
    .toBe(1);
  expect(await storedCount(page)).toBe(0);
  await second.close();
});

async function holdAnnotationLock(page: Page, pageId: string) {
  await page.evaluate((id) => {
    const state = window as unknown as {
      __annotationLockHeld: boolean;
      __releaseAnnotationLock: () => void;
    };
    state.__annotationLockHeld = false;
    void navigator.locks.request(
      `math-workbench:annotation-write:${id}`,
      async () => {
        state.__annotationLockHeld = true;
        await new Promise<void>((resolve) => {
          state.__releaseAnnotationLock = resolve;
        });
      },
    );
  }, pageId);
  await page.waitForFunction(
    () =>
      (window as unknown as { __annotationLockHeld: boolean })
        .__annotationLockHeld,
  );
}

async function releaseAnnotationLock(page: Page) {
  await page.evaluate(() =>
    (
      window as unknown as { __releaseAnnotationLock: () => void }
    ).__releaseAnnotationLock(),
  );
}

test('等待写入锁时继续书写，两次修改都保存', async ({ page }) => {
  await page.goto('/#/knowledge');
  await enable(page);
  await holdAnnotationLock(page, '/knowledge');
  await draw(page);
  await page.waitForTimeout(400);
  await draw(page);
  await releaseAnnotationLock(page);
  await expect.poll(() => storedCount(page)).toBe(2);
  await page.reload();
  await expect.poll(() => storedCount(page)).toBe(2);
});

test('等待旧页写入时切页，旧页结果不会覆盖新页草稿', async ({ page }) => {
  await page.goto('/#/knowledge');
  await enable(page);
  await holdAnnotationLock(page, '/knowledge');
  await draw(page);
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    location.hash = '#/plotting';
  });
  await expect(page).toHaveURL(/plotting/);
  await expect(
    page.getByRole('heading', { name: /让抽象的变化/ }),
  ).toBeVisible();
  await draw(page);
  await releaseAnnotationLock(page);
  await expect.poll(() => storedCount(page)).toBe(1);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem('math-workbench:annotation:/plotting');
        return raw ? JSON.parse(raw).data.items.length : 0;
      }),
    )
    .toBe(1);
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem('math-workbench:annotation:/plotting');
        return raw ? JSON.parse(raw).data.items.length : 0;
      }),
    )
    .toBe(1);
});

test('清空时取消排队写入，不会重新出现已删除的批注', async ({ page }) => {
  await page.goto('/#/knowledge');
  await enable(page);
  await holdAnnotationLock(page, '/knowledge');
  await draw(page);
  await page.waitForTimeout(400);
  await page.locator('button[aria-label="清空本页批注"]').click();
  await releaseAnnotationLock(page);
  await page.waitForTimeout(500);
  expect(await storedCount(page)).toBe(0);
});

test('清空本页与排队中的保存不会复活内容（#45）', async ({ page }) => {
  await page.goto('/#/knowledge');
  await enable(page);
  await holdAnnotationLock(page, '/knowledge');
  await draw(page);
  await page.waitForTimeout(400);
  // 清空与写入共用全局锁，这里排队在写入之后
  await page.locator('button[aria-label="清空本页批注"]').click();
  await page.waitForTimeout(300);
  await releaseAnnotationLock(page);
  await page.waitForTimeout(800);
  expect(await storedCount(page)).toBe(0);

  await page.reload();
  await page.waitForTimeout(500);
  expect(await storedCount(page)).toBe(0);
});

test('其他标签页清空后，旧草稿不会写回并给出提示（#45）', async ({ page }) => {
  await page.goto('/#/knowledge');
  await enable(page);
  await draw(page);
  // 模拟另一个标签页在本页草稿产生后完成清空
  await page.evaluate(() => {
    localStorage.setItem(
      'math-workbench:annotation-cleared:/knowledge',
      String(Date.now() + 1000),
    );
  });
  await page.waitForTimeout(800);
  await expect(page.getByText(/检测到其他标签页清空了批注/)).toBeVisible();
  expect(await storedCount(page)).toBe(0);
});

test('清空全部后，其它页面新画的批注保留（#45）', async ({ page }) => {
  await page.goto('/#/knowledge');
  await enable(page);
  await draw(page);
  await page.waitForTimeout(500);
  expect(await storedCount(page)).toBe(1);

  await page.getByRole('button', { name: /清空全部/ }).click();
  await page.getByRole('button', { name: '全部清空' }).click();
  await page.waitForTimeout(600);
  expect(await storedCount(page)).toBe(0);

  await page.goto('/#/plotting');
  await page.waitForTimeout(1200);
  await enable(page);
  await draw(page);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const raw = localStorage.getItem(
            'math-workbench:annotation:/plotting',
          );
          return raw ? JSON.parse(raw).data.items.length : 0;
        }),
      { timeout: 5000 },
    )
    .toBe(1);
});
