import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

/**
 * 生产构建体积预算检查。
 *
 * 用法：先 `npm run build`，再 `npm run perf:budget`（或 `node scripts/perf-baseline.mjs`）。
 * 输出每个 chunk 的 raw / gzip 体积并对照 perf/budgets.json；超预算时以非零码退出。
 */

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist', 'assets');
const budgets = JSON.parse(
  readFileSync(join(ROOT, 'perf', 'budgets.json'), 'utf8'),
);

let files;
try {
  files = readdirSync(DIST).filter((name) => name.endsWith('.js'));
} catch {
  console.error('找不到 dist/assets，请先运行 npm run build。');
  process.exit(2);
}

const assets = files.map((name) => {
  const buffer = readFileSync(join(DIST, name));
  return {
    name,
    rawKb: buffer.length / 1024,
    gzipKb: gzipSync(buffer, { level: 9 }).length / 1024,
  };
});

const fmt = (value) => value.toFixed(1).padStart(7);
const failures = [];

console.log(
  'chunk                     raw(KB)  gzip(KB)   预算(raw/gzip)  结果',
);
for (const rule of budgets.chunks) {
  const pattern = new RegExp(rule.pattern);
  const matched = assets.filter((asset) => pattern.test(asset.name));
  if (matched.length === 0) {
    console.log(`${rule.label.padEnd(24)} 未匹配到文件（跳过）`);
    continue;
  }
  const rawKb = matched.reduce((sum, asset) => sum + asset.rawKb, 0);
  const gzipKb = matched.reduce((sum, asset) => sum + asset.gzipKb, 0);
  const over = rawKb > rule.rawKb || gzipKb > rule.gzipKb;
  console.log(
    `${rule.label.padEnd(24)} ${fmt(rawKb)} ${fmt(gzipKb)}   ${String(rule.rawKb).padStart(4)} / ${String(rule.gzipKb).padEnd(4)}     ${over ? '超出' : '通过'}`,
  );
  if (over) {
    failures.push(
      `${rule.label}: raw ${rawKb.toFixed(1)}/${rule.rawKb} KB, gzip ${gzipKb.toFixed(1)}/${rule.gzipKb} KB`,
    );
  }
}

const totalRaw = assets.reduce((sum, asset) => sum + asset.rawKb, 0);
const totalGzip = assets.reduce((sum, asset) => sum + asset.gzipKb, 0);
const totalOver =
  totalRaw > budgets.totalJs.rawKb || totalGzip > budgets.totalJs.gzipKb;
console.log(
  `\n全部 JS（${assets.length} 个）：raw ${totalRaw.toFixed(1)} KB，gzip ${totalGzip.toFixed(1)} KB，预算 ${budgets.totalJs.rawKb}/${budgets.totalJs.gzipKb} KB → ${totalOver ? '超出' : '通过'}`,
);
if (totalOver) {
  failures.push(
    `total JS: raw ${totalRaw.toFixed(1)}/${budgets.totalJs.rawKb} KB, gzip ${totalGzip.toFixed(1)}/${budgets.totalJs.gzipKb} KB`,
  );
}

if (failures.length > 0) {
  console.error('\n以下预算被超出：');
  for (const failure of failures) console.error(`- ${failure}`);
  console.error('如属预期增长，请更新 perf/budgets.json 并在 PR 里说明原因。');
  process.exit(1);
}

console.log('\n体积预算全部通过。');
