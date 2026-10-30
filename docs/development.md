# 团队开发约定

## 1. 固定技术基线

- Node.js **22.23.4**（见 `.nvmrc`），npm **10.x**，同一仓库不混用包管理器。
- React + TypeScript（strict）+ Vite；Ant Design 作为唯一通用 UI 组件库。
- React Router 的 HashRouter；CSS Modules 编写模块样式，公共变量放 `shared/styles/tokens.css`。
- 数学：mathjs 受限解析与 Worker 采样，ECharts 绘图，KaTeX 公式，Zod 数据校验。
- 质量：ESLint、Prettier、Vitest、Testing Library、Playwright、GitHub Actions。
- 精确依赖版本以 `package.json` 和 `package-lock.json` 为准；新增和升级依赖单独说明理由。
- 初版无后端、无登录、无云数据库、无全局状态库。不得自行引入另一套技术栈。

## 2. 开始开发

```bash
nvm install
nvm use
npm ci
npm run dev
```

若不使用 nvm，安装 `.nvmrc` 指定的 Node，并用 `node -v`、`npm -v` 核对。
开发服务默认绑定 `127.0.0.1`；需要局域网演示时自行明确指定 `--host 0.0.0.0`。

```bash
npm run check             # 格式、lint、类型、单元/组件测试、生产构建
npx playwright install chromium
npm run test:e2e          # 构建并自动启动生产预览服务器
npm run preview          # 先 build，再本地预览生产包
```

性能基线（体积预算是 CI 的常规检查，采样预算随单测执行）：

```bash
npm run build
npm run perf:budget                              # 对照 perf/budgets.json 检查 chunk 体积
npm run test:run -- src/shared/math/sample.perf   # 采样耗时与语义断言
```

方法与实测值见 [性能基线](performance.md)；调整预算前先更新该页记录。

跨浏览器基线（可选，不改变 Chromium 验收基线）：

```bash
npx playwright install firefox webkit   # 首次，约 180 MB
npm run test:e2e:cross-browser          # 只跑 e2e/cross-browser.spec.ts，Chromium + Firefox + WebKit
```

CI 中对应独立的 `Cross-browser baseline` 工作流：在 Actions 里手动触发（workflow_dispatch），或给 PR 加上 `cross-browser` 标签时运行。

如修改内容，先运行 `npm run format`。`typecheck` 负责类型检查，Vite 不能替代它。
构建产物是静态站点，需通过 HTTP 服务或在线托管访问，不支持双击 `index.html` 的 `file://` 模式。

## 3. 目录与依赖方向

```text
app → features → shared
          ↓
        content → shared/contracts
```

- `app`：入口、路由、布局，集成负责人维护。
- `features/<module>`：一个模块自己的页面、组件、hooks、测试和 CSS Modules。
- `content`：人工审查的数学内容，不放界面逻辑。
- `shared/contracts`：跨模块 TypeScript 类型及 Zod schema。
- `shared/navigation`：模块导航元数据和跨模块链接。
- `shared/math`：受限计算及 Worker；不要在页面中自己执行表达式。
- `shared/storage`：版本化 localStorage；模块不要直接读写 localStorage。
- `shared/ui`：已实际复用的公共组件，不为假设需求过度抽象。

功能模块不得引用其他功能模块或 app。通过 `@/` 别名导入共享能力；ESLint 对现有模块配置了跨模块导入限制。新增模块时同步更新 `eslint.config.js` 的模块列表。
不允许用不同相对路径绕过规则。公共 API 变更需要受影响模块共同审查。

## 4. 新增功能模块

1. 建立 `src/features/<name>/<Name>Page.tsx` 和 `index.ts`。
2. 页面使用 `PageHeader`，样式放 `<Name>Page.module.css`，不随意改全局样式。
3. 在 `shared/navigation/modules.ts` 添加唯一 id、路由、名称与真实状态。
4. 在 `app/App.tsx` 添加懒加载入口；在 `app/AppLayout.tsx` 添加图标。
5. 更新 ESLint 模块列表，新增契约、单元测试与至少一个使用流程测试。
6. 更新 README 的实际功能状态，再提交 PR。

可从 `mistakes` 和 `assistant` 的独立目录开始实现，完成前保留 `planned` 状态；不能仅因为路由存在就标记功能完成。

## 5. 编码与 UI

- TypeScript 不使用无说明的 `any`、`@ts-ignore`；外部输入用 Zod 校验后再使用。
- 组件 PascalCase，hooks 以 `use` 开头，普通函数 camelCase；文件命名遵循所在目录。
- 中文界面，英文技术标识；有标签的表单、键盘可操作、加载/空/错误状态必须完整。
- 不同时引入 Tailwind、另一套 UI 组件库或另一种公式引擎。
- 状态优先在模块内部维护；跨页面状态优先 URL，持久化统一走 storage。
- 添加通用依赖、修改配置文件、锁文件、布局与公共契约，应在 Issue 先协调。

## 6. 分工建议（4–6 人）

| 角色           | 主要目录                       | 责任                         |
| -------------- | ------------------------------ | ---------------------------- |
| 集成负责人     | app、shared、根配置            | 接口、路由、CI、部署、合并   |
| 知识负责人     | features/knowledge、content    | 内容结构、导航、搜索         |
| 绘图负责人     | features/plotting、shared/math | 解析、采样、间断与图表测试   |
| 错题负责人     | features/mistakes              | 数据结构、增删改查、导入导出 |
| 质量负责人     | test、e2e、docs                | 自动化、数学审查、交付记录   |
| 可选 AI 负责人 | features/assistant、后续服务端 | 后端代理与真实对话测试       |

实际姓名与工作量由组内确定。四人时优先两个必需模块，扩展后做；每个模块配一位交叉审查者。

## 7. Git 和 PR

- `main` 是集成基线，开发使用 `feat/编号-主题`、`fix/编号-主题`、`docs/编号-主题`。
- 外部贡献者 Fork 后提 PR；组员有写权限时也用功能分支，不直接推主分支。
- 一个 PR 聚焦一个任务，不混入无关格式化或依赖升级。
- 合并前 CI 通过，至少一位非作者审核，涉及数学时额外人工核验。
- Squash merge，合并后删除分支；提交前同步上游 main。
- 推荐主分支保护：要求 PR、1 人审批、`Quality checks` 与 `Browser tests` 状态通过、解决讨论、禁止强推。

**仓库中提供 CI 工作流，但分支保护和审核人权限仍须维护者在 GitHub Settings 配置；文档约定不等于已开启平台强制。**

## 8. 数学与 AI

- 数值图像不是证明；采样无法保证识别所有间断点，不得据此自动判定极限或可导。
- 表达式有白名单、长度、AST 节点数和采样数限制；Worker 超时终止，不直接执行用户 JavaScript。
- 公式展示和可计算表达式是不同字段；KaTeX 保持 `trust: false`。
- AI 服务只能从未来的服务端代理调用，密钥不得出现在 `VITE_*` 或浏览器存储里。
- 记录实际 AI 使用与人工纠错；不虚构测试通过、参考文献或成员贡献。

## 9. 发布

仓库提供手动触发的 `Deploy Pages` 工作流，不会在每个 PR 上发布。
维护者先在 Settings → Pages 将来源设为 GitHub Actions，再从 Actions 触发部署。
目前不声明在线站点已上线。使用相对资源路径与 hash 路由，适配仓库子路径。

技术依据：[Vite](https://vite.dev/guide/)、[React Router](https://reactrouter.com/start/declarative/installation)、[mathjs 安全设计](https://mathjs.org/docs/expressions/security.html)、[Vitest 配置](https://vitest.dev/config/)。
