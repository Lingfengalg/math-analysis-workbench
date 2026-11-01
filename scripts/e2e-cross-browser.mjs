import { spawnSync } from 'node:child_process';

// 跨浏览器基线：只跑 e2e/cross-browser.spec.ts，Chromium 之外再加 Firefox / WebKit。
// 通过环境变量而不是命令行参数切换，Windows 与类 Unix 表现一致。
const result = spawnSync('npx', ['playwright', 'test'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, CROSS_BROWSER: '1' },
});

process.exit(result.status ?? 1);
