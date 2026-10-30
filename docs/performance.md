# 绘图性能基线

本页记录生产构建体积与表达式采样耗时的测量方法、当前实测值和预算，用于发现「明显变慢」的回归，
不代表数学结论，也不替代 [接口契约](contracts.md) 里的采样语义与限制。

与 #25（Worker 启动、消息异常与资源清理）分开：本页只关心体积与耗时，不修改错误处理逻辑。

## 测量环境

| 项            | 值                                        |
| ------------- | ----------------------------------------- |
| 日期          | 2026-10-30                                |
| 系统          | Windows 11 x64                            |
| Node.js / npm | 22.23.4 / 10.9.9                          |
| 构建          | `npm run build`（Vite 8 + rolldown）      |
| 采样测量      | Vitest（jsdom 环境，Node 执行相同纯函数） |

不同机器、不同 CI runner 的绝对值不可直接比较；预算按「数量级回归」设计，不用于精确对比。

## 1. 生产构建体积

```bash
npm run build
npm run perf:budget   # 读取 dist/assets，按 perf/budgets.json 校验
```

脚本对每个 JS chunk 统计 raw 与 **gzip level 9** 体积（构建产物里的 kB 提示是 raw 值）。

2026-10-30 实测：

| chunk            | raw       | gzip     | 预算（raw / gzip） |
| ---------------- | --------- | -------- | ------------------ |
| `plotting-*`     | 568.2 KB  | 190.9 KB | 640 / 215 KB       |
| `plot.worker-*`  | 737.2 KB  | 201.3 KB | 820 / 225 KB       |
| `knowledge-*`    | 259.0 KB  | 77.8 KB  | 290 / 88 KB        |
| `index-*`        | 160.3 KB  | 55.8 KB  | 180 / 63 KB        |
| 全部 JS（17 个） | 2549.0 KB | 794.7 KB | 2800 / 880 KB      |

`plot.worker` 与 `plotting` 偏大主要来自 mathjs 与 ECharts；两者都已按路由/Worker 拆分：

- 绘图路由本身懒加载（`src/app/App.tsx` 的 `lazy`）；
- mathjs 只在 `plot.worker.ts` 内使用，不进入主包；
- ECharts 按需 `registerCharts` 注册（见 `src/shared/ui/FunctionChart.tsx`）。

**评估结论**：在不改变表达式白名单与结果语义的前提下，暂不做进一步裁剪。理由：

- 主线程首屏不加载 mathjs/ECharts，首次绘图的额外下载只发生在进入绘图页之后；
- 继续拆 `mathjs` 子模块或替换绘图库会改动计算结果与依赖许可，超出「性能基线」范围；
- 若后续要降低体积，应先在本页记录新的实测值，再单独讨论方案。

## 2. 表达式采样耗时

`src/shared/math/sample.perf.test.ts` 在 Vitest 中直接调用 `sampleFunction(request, 801)`，
每条用例取**单次冷启动**耗时（含表达式解析/编译），并与 `perf/budgets.json` 的 `samplingMs` 比较。

```bash
npm run test:run -- src/shared/math/sample.perf
```

2026-10-30 实测（801 采样点）：

| 用例                | 类型 | 耗时   | 预算   |
| ------------------- | ---- | ------ | ------ |
| `x^2`               | 典型 | 6.2 ms | 150 ms |
| `abs(x)`            | 典型 | 2.6 ms | 150 ms |
| `sin(20*x)`（高频） | 边界 | 2.1 ms | 300 ms |
| `1/x`（定义域空洞） | 边界 | 1.5 ms | 300 ms |
| `tan(x)`（多极点）  | 边界 | 2.7 ms | 300 ms |
| `x^20`（边界数值）  | 边界 | 1.4 ms | 300 ms |

预算留了约 20–100 倍余量，只用于拦截「数量级」退化；同时有一条断言检查 `1/x` 仍产生缺口、
`x^2` 仍无缺口，防止为了提速而关掉间断检测。

## 3. 已知局限

- Node/Vitest 环境测的是采样纯函数，不等同于浏览器 Worker 内的真实耗时：首次绘图还包含 Worker 创建与模块加载，
  客户端目前以 8 秒超时兜底（见 `src/shared/math/client.ts`），这不是性能保证。
- 未测量绘制阶段（ECharts 渲染、canvas 合成）与低端设备表现。
- 未建立 CI 性能趋势图；`perf:budget` 只在 CI 的 Quality job 里做体积预算校验，采样预算随 `npm run test:run` 执行。
- 采样数量上限仍为 1201；预算不覆盖自定义采样数。
