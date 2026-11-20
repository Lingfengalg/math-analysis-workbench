# GitHub Pages 启用与验收操作单（#8）

本页给**仓库管理员**使用。当前状态：工作流存在，但 Pages 未启用（2026-11-21 手动触发失败，
`actions/configure-pages` 返回 `Get Pages site failed ... Not Found`）。
在按本单完成第 1 步之前，任何部署尝试都会失败，这属于配置缺失，不是构建问题。

## 1. 管理员操作（约 2 分钟）

1. 打开仓库 **Settings → Pages**。
2. **Build and deployment → Source** 选择 **GitHub Actions**（不要选 “Deploy from a branch”）。
3. 打开 **Settings → Environments**，确认存在 `github-pages` 环境：
   - 若配置了 deployment branches 限制，确保允许 `main`；
   - 若配置了 required reviewers，部署会等待审批，这属于预期行为。
4. 确认 **Settings → Actions → General → Workflow permissions** 允许工作流运行（只读即可，工作流已声明
   `pages: write` 与 `id-token: write`，不需要额外的仓库写权限）。

完成后在 **Actions → Deploy Pages → Run workflow**（分支 `main`）手动触发。

## 2. 预期结果

- `build` job：`npm ci` → `npm run check` → `configure-pages` → `upload-pages-artifact` 全部成功；
- `deploy` job 成功，输出站点 URL（形如 `https://<owner>.github.io/math-analysis-workbench/`）；
- 该 URL 出现在仓库右侧 **Environments → github-pages** 里。

> 只有 deploy job 成功后才存在「真实站点 URL」；仓库地址 `github.com/...` 不是站点地址。

## 3. 部署后验收清单

逐项在真实站点上验证，并把结果写回 #8 与 `docs/validation.md`（**不要**在验证前写成已完成）：

- [ ] 首页能从站点根路径正常打开，CSS/字体/图片 200（`base: './'` 相对路径生效）。
- [ ] 直接访问 `#/knowledge`、`#/plotting`、`#/mistakes`、`#/backup` 并**刷新**，页面仍能渲染（HashRouter 不依赖服务端回退）。
- [ ] 知识导航：搜索、相关概念互链跳转、迷你示意图 canvas 有内容。
- [ ] 绘图：`1/x` 能出图（Worker 在子路径下加载成功），导出 PNG 可下载。
- [ ] 错题本：新增一条并刷新后仍在（localStorage 按 origin 隔离，子路径共享同源）。
- [ ] 数据备份：导出完整备份能下载；导入预览正常。
- [ ] 浏览器控制台无 `pageerror`、无 404 资源。

验收完成后更新：

1. `docs/validation.md` 追加「Pages 发布验证记录」，写清日期、运行 ID、站点 URL、逐项结果；
2. `README.md` 把「线上发布尚未启用」改为真实站点链接与首次部署日期。

## 4. 常见失败与排查

| 现象                                                       | 原因                                                | 处理                                                                      |
| ---------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------- |
| `configure-pages` 报 `Get Pages site failed ... Not Found` | Pages 未启用，或 Source 仍选 “Deploy from a branch” | 回到第 1 步，选 **GitHub Actions**                                        |
| deploy job 一直 `Waiting for approval`                     | `github-pages` 环境配置了 required reviewers        | 由配置的审批人批准，或调整环境规则                                        |
| 站点 404 / 资源 404                                        | 构建未使用相对 `base`，或部署的是错误分支           | 确认 `vite.config.ts` 仍是 `base: './'`，工作流 `ref` 为 `main`           |
| Worker 报「计算模块加载失败」                              | 子路径下 Worker URL 未按 `import.meta.url` 解析     | 检查 `src/shared/math/client.ts` 是否仍用 `new URL(..., import.meta.url)` |
| 刷新 `#/xxx` 白屏                                          | 误改成 BrowserRouter 且无 404 回退                  | 本项目使用 `HashRouter`，不要换成 BrowserRouter                           |
| 页面能开但数据丢失                                         | 访问了不同 origin（`127.0.0.1` 与站点域名不同）     | 数据按 origin 存储，属预期；用「数据备份」迁移                            |

## 5. 回滚

- 部署失败不会影响仓库文件；修复配置后重新运行工作流即可。
- 如需撤下站点：Settings → Pages → 选择 **Unpublish site**（会删除线上站点，不动仓库代码）。
- 曾部署过的历史 artifact 保留在 Actions 中，可按需下载。

## 6. 权限边界

启用 Pages 需要**仓库管理员**（或具备 Pages 管理权限的角色）。协作者可以触发工作流、看日志、写验证记录，
但**不能**代替管理员完成第 1 步；这也是 #8 目前保持打开的原因。
