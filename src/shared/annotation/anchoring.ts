/**
 * 批注锚定。
 *
 * 问题：按整页宽高归一化的坐标，一旦内容重排（搜索筛选、窗口变窄、卡片换行），
 * 笔迹就会离开原来的文字或图表。
 *
 * 方案：绘制时记录指针所在的内容块（带 `data-annotation-anchor` 的元素），
 * 笔迹坐标改为相对该块的归一化值；渲染时按块当前的位置还原。
 * 块不存在（被筛选掉、页面切换）时隐藏该批注并汇报数量，不猜测位置。
 */

export const ANCHOR_ATTRIBUTE = 'data-annotation-anchor';

/** 相对批注画布的像素矩形 */
export type Frame = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function hostFrame(width: number, height: number): Frame {
  return { left: 0, top: 0, width, height };
}

/** 从事件目标向上找最近的锚定块 */
export function findAnchorElement(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  return target.closest(`[${ANCHOR_ATTRIBUTE}]`);
}

/**
 * 按视口坐标找锚定块。
 *
 * 批注画布覆盖在内容之上，`event.target` 永远是 canvas，
 * 因此必须穿透画布去查它下面的元素。
 */
export function findAnchorAtPoint(
  clientX: number,
  clientY: number,
): Element | null {
  if (typeof document.elementsFromPoint !== 'function') return null;
  const stack = document.elementsFromPoint(clientX, clientY);
  for (const element of stack) {
    if (element === document.documentElement || element === document.body)
      break;
    const anchor = element.closest(`[${ANCHOR_ATTRIBUTE}]`);
    if (anchor) return anchor;
  }
  return null;
}

export function anchorKeyOf(element: Element | null): string | null {
  const key = element?.getAttribute(ANCHOR_ATTRIBUTE)?.trim();
  return key ? key : null;
}

function escapeAttributeValue(value: string): string {
  const css = globalThis.CSS;
  if (css && typeof css.escape === 'function') return css.escape(value);
  return value.replace(/["\\]/g, '\\$&');
}

export function queryAnchor(host: HTMLElement, key: string): Element | null {
  return host.querySelector(
    `[${ANCHOR_ATTRIBUTE}="${escapeAttributeValue(key)}"]`,
  );
}

/** 元素相对画布的位置；元素不可见或已脱离文档时返回 null */
export function frameFromElement(
  element: Element,
  canvas: HTMLCanvasElement,
): Frame | null {
  if (!element.isConnected) return null;
  const hostRect = canvas.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    left: rect.left - hostRect.left,
    top: rect.top - hostRect.top,
    width: rect.width,
    height: rect.height,
  };
}

/** 画布内像素坐标 → 某个坐标系内的归一化坐标 */
export function toFramePoint(px: { x: number; y: number }, frame: Frame) {
  const width = frame.width || 1;
  const height = frame.height || 1;
  return {
    x: (px.x - frame.left) / width,
    y: (px.y - frame.top) / height,
  };
}
