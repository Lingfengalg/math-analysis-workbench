# 模块接口契约

唯一实现源：`src/shared/contracts/index.ts`。文档用于解释语义，不复制维护另一套类型。

## PlotRequest 与跨模块导航协议

### 1. `PlotRequest`（`src/shared/navigation/plot-link.ts`）

| 字段              | 语义                                                                            |
| ----------------- | ------------------------------------------------------------------------------- |
| expression        | 主函数表达式 $f(x)$，长度 1–160，须通过 math 层白名单 AST 检查                  |
| compareExpression | 可选对比函数表达式 $g(x)$（如泰勒展开多项式、夹逼上下界），长度 1–160           |
| xMin / xMax       | 有限实数，均在 `[-10000, 10000]` 内，且 `xMin < xMax`                           |
| yMin / yMax       | 可选纵轴视窗范围，均在 `[-1000000, 1000000]` 内；同时提供时须满足 `yMin < yMax` |
| secant            | 可选差商与割线观察参数 `{ x0, h }`，`x0` 在 `[-10000, 10000]`，`                | h   | `在`[10⁻⁸, 1000]` |
| sourceKnowledgeId | 可选，发起绘图的知识卡片稳定 ID                                                 |
| sourceMistakeId   | 可选，发起绘图的错题记录 ID                                                     |

通过 `createPlotLink(request)` 构造 `/plotting?...` 路由，绘图模块通过 `parsePlotSearch` 校验。

### 2. 知识导航与错题草稿链接

- `src/shared/navigation/knowledge-link.ts`：`createKnowledgeLink({ topic?, cardId? })` 与 `parseKnowledgeSearch(search)`，支持按主题筛选或精确聚焦单张知识卡片。
- `src/shared/navigation/mistake-link.ts`：`createMistakeDraftLink({ topic?, relatedKnowledgeId?, title?, expression?, xMin?, xMax? })` 与 `parseMistakeDraftSearch(search)`，支持从知识卡片或函数实验室携带上下文新建错题草稿。
- 所有跨模块 URL 参数均严禁携带密钥、个人信息或大段自由聊天内容。

## KnowledgeCard

- `id`：唯一、稳定的英文小写连字符标识。
- `topic`：`sequence | limit | continuity | derivative | integral`（对应标签 `KNOWLEDGE_TOPIC_LABELS`）。
- `definition`、`conditions`、`pitfalls`、`references`：普通文本，不接受 HTML。
- `formula`：纯 ASCII LaTeX 数学表达式，经 KaTeX `strict: 'error'` 渲染展示。
- `examples[]`：`{ kind?: 'example' | 'counterexample', explanation, plot?: PlotRequest }`。
- `relatedIds`：关联知识卡片稳定 ID 数组，须指向有效非自指卡片。

## MistakeItem 与 MistakesStore

- `errorTag`（`MISTAKE_ERROR_LABELS`）：`domain-ignored | condition-misused | converse-fallacy | limit-value-confused | calculation-error | visual-intuition-trap`。
- `status`（`MISTAKE_STATUS_LABELS`）：`unresolved | reviewing | mastered`。
- `formula`：可选 LaTeX 公式（展示用，不自动求值）。
- `relatedKnowledgeId`：可选关联知识卡片稳定 ID。
- `counterexamplePlot`：可选 `PlotRequest`，用于一键跳转绘图验证反例。
- `mistakesStoreSchema`：`{ items: MistakeItem[] }`（上限 500 条），支持 JSON 导入/导出并用 Zod 校验结构与表达式安全性。

## 计算协议

- 请求：`PlotWorkerRequest`（`{ requestId?, request: PlotRequest }`）或直接 `PlotRequest`。
- 响应：`{ requestId?, ok: true, data: { points, gaps, comparePoints?, secantLine? } }` 或 `{ requestId?, ok: false, error }`。
- 受限实数求值器基于 `mathjs/number` 解析 AST（上限 100 节点，零 `eval`/`Function`）：
  - 支持变量与常数 `x, pi, e` 及 19 个单参数实函数：`sin, cos, tan, asin, acos, atan, sinh, cosh, tanh, abs, sqrt, cbrt, log, ln, lg, exp, sign, floor, ceil`（`ln` 与 `log` 均为自然对数，`lg` 为常用对数）。
  - 幂运算支持括号与单目负号常量指数（`|n| <= 20`）、约分后奇分母按实奇次根求值的有理分数指数 `x^(p/q)`（`|p|, q <= 20`），以及正底数常量指数函数（如 `2^x`、`e^(-x^2)`）。
- `points` 为 `[x, y | null][]`，`null` 表示定义域外、可视化超限（`|y| > 10⁶`）或启发式间断缺口，图表不得跨 `null` 连线。
- 基础均匀采样默认 801 点，自动补采区间内关键整数点（含 `0`）并结合中点/四分点检查识别常见极点与跳跃间断；此机制仍为数值启发式，不承诺识别全部数学间断点或替代严格证明。
- `client.ts` 复用模块级常驻 Worker 并按 `requestId` 分发结果；仅在请求取消（`AbortSignal`）、8 秒超时或 Worker 运行异常时销毁并按需重建 Worker。

## 存储协议

统一使用 `createStorage(key, zodSchema)`，键前缀为 `math-workbench:`（当前包含 `preferences` 与 `mistakes`）。

```json
{
  "schemaVersion": 1,
  "data": {}
}
```

- `read(fallback)`：无记录时返回默认值；损坏、未知版本或无法读取时返回错误，绝不静默覆盖原损坏数据。
- `write(value)`：先校验，再写入；存储配额不足时返回错误。
- `clear()`：只清除该模块的键，不调用 `localStorage.clear()` 清除其他模块数据。

## 后续 AI 接口

暂未实现，也未锁定后端技术栈。不创建伪接口或假成功响应。
接入前另行确定服务端代理消息结构、受控上下文注入（知识卡片 ID 与错题摘要）、错误码、取消方式、认证、限流、费用和隐私约定。
