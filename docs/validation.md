# 工程验证记录

最新验证日期：2026-11-19（v1.0 四模块完整闭环 + Three.js 三维二/三重积分实验室 + AI 助教后端代理）。所有结果均来自本地实际执行，远端结果以 GitHub Actions 为准。

## 环境

- Linux x64，本地运行环境 Node.js v26.11.1 / npm 12.2.0（仓库 `.nvmrc` 基线为 Node.js 22.23.4 / npm 10.9.9）。
- 浏览器：Playwright 管理的无头 Chromium，针对 `npm run build && npm run preview` 生产包执行真实 HTTP 端到端测试。

## 检查项目（2026-11-19）

| 检查                   | 结果                                                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check` | 通过（全仓 Prettier 零差异）                                                                                                        |
| `npm run lint`         | 通过（ESLint `--max-warnings 0`，零错误零警告，含跨模块导入限制与 React Hooks 规则）                                                |
| `npm run typecheck`    | 通过（`tsc -b` strict 模式零错误）                                                                                                  |
| `npm run test:run`     | **14 个测试文件，205 项单元与组件测试全部通过**                                                                                     |
| `npm run build`        | 通过，**零体积告警**（`plot.worker` 506.51 kB，`vendor-three` 601.26 kB 独立按需拆包，全模块 CSS Modules + 毛玻璃 Liquid Glass UI） |
| `npm run test:e2e`     | **7 项 Chromium 端到端流程全部通过**                                                                                                |

## 自动化覆盖摘要

- **数学计算与常驻 Worker（150+ 项）**：
  - 一元函数：19 个单参数实函数（含 `ln`、`lg`、`cbrt`、`sign`、`floor`、`ceil`）、括号指数 `x^(-2)`、实奇次有理分数幂 `x^(1/3)` / `x^(2/3)`、常数底指数 `2^x`、安全拦截、非对称区间关键整数奇点补采、双曲线对比与对称左右差商计算。
  - 二元曲面与二重积分（`src/shared/math/surface.ts`）：二元白名单 AST 编译器 `compileSurfaceExpression` 与定限边界函数 `compileBoundOfX` / `compileBoundOfY`，支持**矩形域、圆域极坐标、X 型曲边域（$\varphi_1(x) \le y \le \varphi_2(x)$）、Y 型曲边域（$\psi_1(y) \le x \le \psi_2(y)$）**的黎曼柱体剖分、中心差分偏导切平面及二维迭代高斯-勒让德（12×12）高精度参考值。
  - 三元体积与三重积分（`src/shared/math/volume.ts`）：三元白名单 AST 编译器 `compileVolumeExpression`，支持**长方体、球体、圆柱体、四面体、抛物面顶盖**五类三维积分域的体素（Voxel）采样、`z = c` 水平截面（先二后一截面法）高亮与三维高斯-勒让德（10×10×10）高精度参考积分。
  - Worker `requestId` 复用以及取消/超时/异常后的销毁重建与并发恢复。
- **跨模块路由与存储契约（20+ 项）**：`plot-link`（支持 `surface3d`、`triple3d`、`function2d` 三种模式深链）、`knowledge-link`、`mistake-link`、`assistant-link` 参数往返与非法回退；版本化本地存储读写、损坏保护与配额异常。
- **知识图谱与知识导航（18 张卡片）**：五大板块 18 张卡片 Schema 唯一性、全部 `relatedIds` 有效非自指、全部 1D/2D/3D 示例表达式白名单可编译、全部 LaTeX 公式通过 KaTeX `strict: 'error'` 校验。
- **三维与二维仿真实验室组件与端到端交互**：Three.js WebGL 三维曲面/黎曼柱体/曲边边界线/三重积分体素与截面交互、纯 SVG 二维画布、模式切换与偏好保存。
- **错题本与苏格拉底 AI 助教模块**：6 道数分典型错题（含二元极限、极坐标雅可比与三重积分穿线法）载入与持久化、JSON 导入导出；零密钥泄露 Node 后端代理 `server/ai-proxy.mjs` 与苏格拉底启发式对话、上下文卡片挂载、KaTeX 数学混排及未配置密钥时的诚实诊断引导。

## 本次主要修正与优化

- 修复受限表达式对 `x^(-2)`、`x^(1/3)`、`ln(x)` 等常见数分写法的误拒问题，并改用自定义白名单 AST 实数求值器与 `mathjs/number` 解析器。
- 修复从知识卡片跳入绘图页后切换函数仍残留旧来源提示及 URL 参数覆盖默认偏好的状态同步缺陷。
- 新增纵轴显示范围控制，解决 `1/x`、`tan(x)` 在奇点附近纵轴无限拉伸压扁正常曲线的问题。
- 将 `knowledge`、`plotting`、`mistakes` 样式全面迁移至各自的 CSS Modules，清理 `global.css` 遗留模块选择器，并通过 Rolldown `codeSplitting` 消除构建 >500 kB 体积提示。

## 边界与后续待办

- 12 张知识卡片与 4 道典型错题示例仍须课程小组成员结合所选教材核对具体版次与页码。
- 数值采样、整数点补采及差商计算仅用于直观启发与反例检验，无法完整识别任意无理点可去间断或高频振荡极限，不能替代数学证明。
- AI 助教仍为待开发扩展入口，未接入后端代理或模型密钥。
- GitHub Pages 线上发布与主分支保护规则仍待仓库维护者在 GitHub Settings 中启用验证。
