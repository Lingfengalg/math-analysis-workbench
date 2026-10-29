# 模块接口契约

唯一实现源：`src/shared/contracts/index.ts`。文档用于解释语义，不复制维护另一套类型。

## PlotRequest

| 字段              | 语义                                                                        |
| ----------------- | --------------------------------------------------------------------------- |
| expression        | mathjs 表达式，不是 LaTeX，长度 1–160；实际可执行语法还需通过 math 层白名单 |
| xMin / xMax       | 有限数，均在 [-10000, 10000] 内，xMin < xMax                                |
| sourceKnowledgeId | 可选，发起绘图的知识卡片稳定 id                                             |

通过 `createPlotLink(request)` 构造 `/plotting?...` 路由，绘图模块通过 `parsePlotSearch` 校验。
不使用 URL 携带密钥、个人信息或大段聊天内容。

## KnowledgeCard

- `id`：唯一、稳定的英文小写连字符标识。
- `topic`：`limit | continuity | derivative`，扩展枚举需同步筛选和测试。
- `definition`、`conditions`、`pitfalls`、`references`：普通文本，不接受 HTML。
- `formula`：LaTeX，只用于展示。
- `examples[].plot`：可选的 PlotRequest；示例文字并不自动解析为函数。
- 内置三张卡片为工程示例，仍需课程团队人工审查并补充精确引用。

## 计算协议

- 请求：`PlotRequest`。
- 响应：`{ ok: true, data: { points, gaps } }` 或 `{ ok: false, error }`。
- `points` 为 `[x, y | null][]`，null 表示不可显示的值或启发式断点，图表不得跨 null 连线。
- 数值量级 > 10⁶、复数、非有限值留空。此规则是可视化限制，不等于数学上无定义。
- `gaps` 为留空图像点的计数，不是数学间断点数量。
- 当前 801 个基础采样点，启发式断点可能额外增加图像点；不承诺精确识别间断、极值或极限。
- Worker 每次请求独立创建、完成/取消后终止；8 秒超时包含首次模块加载，不是性能保证。

## 存储协议

统一使用 `createStorage(key, zodSchema)`，键前缀为 `math-workbench:`。

```json
{
  "schemaVersion": 1,
  "data": {}
}
```

- `read(fallback)`：无记录时返回默认值；损坏、未知版本或无法读取时返回错误，不覆盖原数据。
- `write(value)`：先校验，再写入；存储配额不足时返回错误。
- `clear()`：只清除该模块的键，不调用 `localStorage.clear()` 清除其他模块数据。
- 当前仅保存绘图默认设置，没有账号、跨设备同步或数据库。
- 后续升级 schema 时提供明确迁移或导出恢复流程，不能直接丢弃用户数据。

## 错题本存储

错题结构属于模块内部实现（`src/features/mistakes/model.ts`），未进入 `shared/contracts`，其他模块不得依赖它。
若后续需要跨模块引用错题，先在本仓库 Issue 讨论后再迁移为共享契约。

单条错题字段：

| 字段            | 语义                                         |
| --------------- | -------------------------------------------- |
| `id`            | 浏览器本地生成的非空字符串，仅用于列表操作   |
| `title`         | 题目，1–120 字符                             |
| `topic`         | `limit \| continuity \| derivative \| other` |
| `problem`       | 题目内容，最多 2000 字符                     |
| `mistakeReason` | 错误原因，最多 1000 字符                     |
| `correction`    | 订正与正确思路，最多 4000 字符               |
| `createdAt`     | 创建时间，epoch 毫秒                         |
| `updatedAt`     | 最近更新时间，epoch 毫秒；列表据此倒序       |

存储键为 `math-workbench:mistakes`，使用 `createStorage` 的版本 1 信封，最多 200 条。
写入前统一经 Zod 校验；损坏、未知版本或不可读时只提示并保留原始数据，由用户显式清除，不静默覆盖。
记录只保存在当前浏览器，不含账号、云同步或真实个人信息。

## 后续 AI 接口

暂未实现，也未锁定后端技术栈。不创建伪接口或假成功响应。
接入前另行确定消息结构、错误码、取消方式、认证、限流、费用和隐私约定。
