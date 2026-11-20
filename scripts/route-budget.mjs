import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync, brotliCompressSync } from 'node:zlib';

/**
 * 路由依赖闭包预算（#86）。
 *
 * 与 perf:budget 的区别：perf:budget 按构建文件名估算单 chunk，构建器重分块后可能漏掉
 * 路由实际依赖；这里读取 Vite 构建清单，从入口模块出发沿 imports 求闭包，再对闭包内
 * 每个 JS 文件计算 gzip / Brotli 体积，避免「文件名变了就静默跳过」。
 *
 * 用法：npm run build && npm run perf:routes
 */

const ROOT = process.cwd();
const MANIFEST = join(ROOT, 'dist', '.vite', 'manifest.json');
const DIST = join(ROOT, 'dist');

const budgets = JSON.parse(
  readFileSync(join(ROOT, 'perf', 'route-budgets.json'), 'utf8'),
);

let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
} catch {
  console.error('找不到 dist/.vite/manifest.json，请先运行 npm run build。');
  process.exit(2);
}

const visited = new Set();
const files = new Set();

function walk(key, { includeDynamic = false } = {}) {
  if (!key || visited.has(key)) return;
  visited.add(key);
  const entry = manifest[key];
  if (!entry) return;
  if (entry.file) files.add(entry.file);
  for (const next of entry.imports ?? []) walk(next, { includeDynamic });
  if (includeDynamic) {
    for (const next of entry.dynamicImports ?? [])
      walk(next, { includeDynamic });
  }
}

const fmt = (value) => value.toFixed(1).padStart(7);
const failures = [];

console.log(
  'route                    文件数   raw(KB)   gzip(KB)  brotli(KB)  预算(gzip)  结果',
);

for (const route of budgets.routes) {
  const entry = manifest[route.entry];
  if (!entry) {
    // 入口缺失必须显式失败：构建重命名或路由被删都会让预算失去意义
    failures.push(`${route.name}: 找不到入口 ${route.entry}`);
    console.log(`${route.name.padEnd(24)} 入口缺失：${route.entry}`);
    continue;
  }
  const before = new Set(files);
  for (const file of before) files.delete(file);
  visited.clear();
  walk(route.entry, { includeDynamic: route.includeDynamic === true });
  const closure = [...files];
  let raw = 0;
  let gzip = 0;
  let brotli = 0;
  for (const file of closure) {
    const buffer = readFileSync(join(DIST, file));
    raw += buffer.length;
    gzip += gzipSync(buffer, { level: 9 }).length;
    brotli += brotliCompressSync(buffer).length;
  }
  const gzipKb = gzip / 1024;
  const over = gzipKb > route.gzipKb;
  console.log(
    `${route.name.padEnd(24)} ${String(closure.length).padStart(6)} ${fmt(raw / 1024)} ${fmt(gzipKb)} ${fmt(brotli / 1024)}      ${String(route.gzipKb).padStart(4)} KB   ${over ? '超出' : '通过'}`,
  );
  if (over) {
    failures.push(
      `${route.name}: gzip ${gzipKb.toFixed(1)}/${route.gzipKb} KB（${closure.length} 个文件）`,
    );
  }
}

if (failures.length > 0) {
  console.error('\n以下路由闭包预算不通过：');
  for (const failure of failures) console.error(`- ${failure}`);
  console.error(
    '如属预期增长，请更新 perf/route-budgets.json 并在 PR 里说明原因，不要只提高阈值。',
  );
  process.exit(1);
}

console.log('\n路由依赖闭包预算全部通过。');
