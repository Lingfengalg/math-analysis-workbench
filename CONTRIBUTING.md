# 贡献指南

欢迎提交代码、数学内容、测试、设计建议和文档改进。

开始前阅读 [团队开发约定](docs/development.md) 和 [模块接口契约](docs/contracts.md)。Node 版本统一见 `.nvmrc`，仅使用 npm 和仓库锁文件。

## 提交流程

1. 在 Issue 中讨论或认领任务，避免重复工作。
2. Fork 本仓库，克隆自己的 Fork。
3. 新建分支，例如 `feat/knowledge-navigation` 或 `docs/math-review`。
4. 完成改动并自行检查；代码模块请提供运行方法和测试。
5. 推送到自己的 Fork，向本仓库 `main` 分支提交 PR。
6. 根据审查意见修订，由维护者合并。

示例命令（将 `YOUR_USERNAME` 替换为自己的 GitHub 用户名）：

```bash
git clone https://github.com/YOUR_USERNAME/math-analysis-workbench.git
cd math-analysis-workbench
git switch -c feat/your-feature
# 修改并检查文件后
git add <changed-files>
git commit -m "feat: describe your change"
git push -u origin feat/your-feature
```

## PR 验收

- 一个 PR 聚焦一个目标，说明关联 Issue、改动范围和验证方式。
- 新增数学内容要有条件、出处或推导，以及边界情况检查。
- 变更 UI 时附截图；新增模块时补使用说明和测试。
- 如使用 AI，说明使用范围、核验过程，按需更新 AI 日志。
- 不提交密钥、真实学生信息、运行缓存或未经授权的材料。
- 提交内容应由你原创或具有兼容授权；贡献按本仓库 MIT 许可提供。
- 本地运行 `npm run check`；修改交互时运行 `npm run test:e2e`。新增依赖或公共契约变更需说明原因和影响。
- 每个功能在独立目录开发，不引用其他模块内部文件，不擅自混用技术栈。
- 约定至少一位非作者审核后 Squash merge；平台强制规则由维护者配置。

公开仓库支持外部贡献者通过 Fork 提交 PR，但不会自动授予直接推送权限。
