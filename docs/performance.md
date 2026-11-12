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

2026-11-10 的导数互动实验试用 JSXGraph 1.14.3 的函数图、可拖动点与几何线条，替代该实验的 ECharts 渲染；绘图模块仍使用 ECharts。与实验使用 ECharts 时的实测 2640.0 KB / gzip 825.8 KB 相比，本次构建总 JS 为 3653.1 KB / gzip 1076.3 KB；新增的 `DerivativeChart-*` 为 1015.9 KB / gzip 252.0 KB。JSXGraph 仅在打开导数实验时按需加载，但首次进入该实验需要额外下载，且不同构建的 chunk 布局不可直接等同于实际网络流量。

原 2800 / 880 KB 全量预算不能容纳这一新增依赖。为明确接受这项试验性开销，本次将全量预算调整为 3850 / 1150 KB，并为 `DerivativeChart-*` 新设 1070 / 265 KB 的独立上限；不是性能优化，也没有提高其他已有 chunk 的预算。后续应评估该交互能力是否值得这项成本，不能以个别 chunk 变小作为整体加载量下降的依据。脚本仅按文件名统计单个 chunk 和全部 JS，不计算页面依赖闭包。

JSXGraph 上游包含 JessieCode 解析器及 `eval` 代码，因此构建会给出 EVAL 警告。本实验只向 JSXGraph 传入预定义的函数回调和数值，不把用户表达式传给 JSXGraph 或其解析器；绘图页的用户表达式仍由原有受限计算链处理。严格 CSP 下的实验流程以自动化测试结果为准，不能据此推断 JSXGraph 的其他功能均不使用动态代码。

2026-11-11 增加练习闭环并引入 Khan Academy Perseus 的评分模块，练习视图采用懒加载。本次构建：`PracticeView-*` 约 193.4 KB / gzip 58.7 KB，全部 JS 约 3852.6 KB / gzip 1136.4 KB；相比上次总量增加约 199.5 KB / gzip 60.1 KB。构建器同时重新分配共享 Ant Design 代码，`index-*` 从 155.7 / 54.5 KB 变为 249.2 / 82.8 KB。仅比较单个 chunk 无法判断首屏总下载量：这并非已验证的首屏优化，也尚未建立首页依赖闭包预算。

为反映新增功能及 chunk 重新分配，本次将 `index` 文件预算调为 270 / 90 KB、全量预算调为 4100 / 1200 KB，并增加练习 chunk 205 / 65 KB 上限。调整是对实测增长的明确记录，不代表性能改善；建议后续用依赖闭包与真实网络测量替代单文件近似。

同日增加 `ts-fsrs` 复习调度后，全部 JS 实测约 3876.8 KB / gzip 1143.7 KB，比上述构建增加约 24.2 KB / gzip 7.3 KB；现有预算通过。错题页面按路由懒加载，单文件统计不等于页面实际传输量。

同日增加 MathLive 可选数学编辑器后，`MathEditor-*` 实测为 789.9 KB / gzip 215.9 KB，全部 JS 为 4669.8 KB / gzip 1362.4 KB；相较 FSRS 构建总量增加约 793.0 KB / gzip 218.7 KB，另有字体和 CSS 资源。编辑器仅在用户主动打开时懒加载，不代表首页总传输量；本次设置该 chunk 的 840 / 230 KB 上限，并把全量预算调整为 5000 / 1450 KB。这是为新增依赖明确接受的体积开销，不是性能优化，仍需以后续真实网络测量评估。

同日新增极限动画并使用 Tween.js 后，全部 JS 实测约 4691.2 KB / gzip 1369.4 KB，相对上一构建增加约 21.4 KB / gzip 7.0 KB。JSXGraph 由于被导数与极限两个图像共享，从原来的 `DerivativeChart-*` 移到了共同的 `src-*` chunk（约 1013.2 / gzip 251.1 KB）；不能把导数 chunk 缩小误认为依赖消失或首屏减小。预算改为合计监控共享 `src-*` 与两个图像 chunk，阈值为 1080 / 270 KB；脚本按文件名统计，不代表实际页面依赖闭包。

**评估结论**：在不改变表达式白名单与结果语义的前提下，暂不做进一步裁剪。理由：

- 工作台首页不加载 mathjs、ECharts 或 JSXGraph；绘图和导数实验分别按需加载其绘图库；
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
