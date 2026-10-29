# 全页面批注层

状态：已实现（Issue #16）。适用于所有路由页面，是跨模块能力，不属于任何单个 feature。

## 目标

把「读」和「记」放在同一个界面里：在知识卡片的定义旁圈重点、在函数图像上标切线与间断点，不必在笔记软件和网页之间来回抄写。

## 使用方式

页面右下角固定一个「批注」按钮：

| 操作        | 说明                                                                   |
| ----------- | ---------------------------------------------------------------------- |
| 开启批注    | 点击「批注」，工具面板展开，画布开始接收指针事件                       |
| 画笔        | 4 色（黑 / 红 / 蓝 / 绿）× 3 档笔宽（细 / 中 / 粗），按住拖动书写      |
| 橡皮        | 点击笔迹即整笔删除（不是像素级擦除，便于撤销）                         |
| 文字        | 点击空白处输入，回车提交，Esc 取消；已提交文字可拖动位置               |
| 撤销 / 重做 | 面板按钮，或 `Ctrl/Cmd + Z`、`Ctrl/Cmd + Shift + Z`（`Ctrl + Y` 亦可） |
| 清空本页    | 清除当前页面批注                                                       |
| 关闭批注    | 再点一次按钮，画布不再拦截指针事件                                     |

快捷键（批注开启且焦点不在输入框内）：`P` 画笔、`E` 橡皮、`T` 文字。

## 接入方式

批注层由 `AppLayout` 按当前路由挂载，页面模块无需任何改动：

```tsx
<AnnotationOverlay pageId={location.pathname}>{children}</AnnotationOverlay>
```

新增模块只要注册进导航（`src/shared/navigation/modules.ts`），就自动获得批注能力。批注层放在 `src/shared/annotation/`，因为它被 app 层使用，且不应被任何 feature 反向依赖；放进 `src/features/*` 会违反「模块之间不得互相引用内部实现」的约定。

## 数据结构

坐标一律是**相对批注容器的归一化值（0–1）**，不是像素：

```ts
type Point = { x: number; y: number };

type StrokeItem = {
  kind: 'stroke';
  id: string;
  color: string; // #rrggbb
  width: number; // CSS 像素
  points: Point[];
};

type TextItem = {
  kind: 'text';
  id: string;
  color: string;
  x: number;
  y: number;
  text: string; // 支持换行（Shift + Enter）
};

type AnnotationDoc = { pageId: string; items: (StrokeItem | TextItem)[] };
```

存储的 JSON 由 `shared/storage` 的版本信封包裹：

```json
{
  "schemaVersion": 1,
  "data": {
    "pageId": "/knowledge",
    "items": [
      {
        "kind": "stroke",
        "id": "a1",
        "color": "#dc2626",
        "width": 4,
        "points": [
          { "x": 0.21, "y": 0.33 },
          { "x": 0.28, "y": 0.35 }
        ]
      }
    ]
  }
}
```

## 坐标策略

归一化坐标保证窗口缩放、侧栏折叠、内容高度变化时，笔迹仍贴在原来的文字位置上。代价是批注**不会随函数图象的横轴范围变化而缩放**——这是刻意的取舍，避免重新采样时笔迹漂移。

## 存储契约

| 项       | 值                                                             |
| -------- | -------------------------------------------------------------- |
| 键       | `math-workbench:annotation:<pageId>`，`pageId` 取路由 pathname |
| 校验     | `src/shared/annotation/model.ts` 的 Zod schema                 |
| 上限     | 单笔 ≤ 4000 点，单页 ≤ 2000 条，颜色必须是 6 位十六进制        |
| 写入     | 每次操作后 250 ms 防抖；切页与页面卸载时立即落盘               |
| 失败处理 | 存储不可用或超配额时提示，不静默丢弃                           |

### 不覆盖不可读数据

读到损坏、版本不兼容或无法解析的数据时，批注层**暂停该页的自动保存**并给出提示，不会用空文档覆盖用户原有数据；只有用户显式点击「清空本页」才重置该页存储。该行为有对应测试（`AnnotationOverlay.test.tsx`），也与主分支 `math-workbench:preferences` 曾出现的「不可读设置被直接覆盖」问题保持同一处理原则。

## 已知限制

1. **只存本地**：数据在 `localStorage`，不跨设备、不跨浏览器同步。
2. **容量有限**：单域名约 5 MB，长时间书写大量笔迹会逼近上限。
3. **不随图象缩放**：批注绑定页面坐标，不跟随函数横轴范围变化。
4. **文字不自动换行**：需要换行请用 Shift + Enter；不支持二次编辑已提交文字（可删除后重写）。
5. **无导出**：PNG 导出、与错题本联动属于后续扩展，未在本 Issue 范围内实现。
6. **触控未实测**：使用 Pointer Events，理论上支持触屏与手写笔，尚未在真机验收。

## 测试

`src/shared/annotation/*.test.*` 覆盖：

- 模型：非法颜色、空笔迹、空白文字、深拷贝隔离；
- 几何：点到线段距离、命中测试（含笔宽）、坐标换算；
- 历史：撤销/重做顺序、上限截断、新操作清空重做栈；
- 存储：按页往返、损坏数据回退为空文档、`clear` 只影响指定页；
- 组件：默认不拦截指针事件、开启后接管、快捷键切换工具、切页重新加载、不可读数据暂停保存。
