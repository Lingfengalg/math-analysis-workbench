import { clamp01, pointInRect, strokeHit } from './geometry';
import {
  cloneItems,
  newId,
  type AnnotationItem,
  type Point,
  type StrokeItem,
  type TextItem,
  type ToolState,
} from './model';

const FONT_PX = 15;
const LINE_HEIGHT = 21;
const FONT_FAMILY =
  'ui-sans-serif, system-ui, "Microsoft YaHei", "PingFang SC", sans-serif';
const MIN_POINT_GAP = 0.0018;
/** 小于这个像素位移视为点击，用于区分「编辑文字」与「拖动文字」 */
const CLICK_TOLERANCE_PX = 4;

type LayerOptions = {
  /** 一次完整操作（画完一笔、擦除、拖动/提交文字）结束后触发 */
  onChange: (items: AnnotationItem[]) => void;
};

/**
 * 覆盖在页面内容之上的批注画布。
 *
 * - 尺寸跟随容器（ResizeObserver），按 devicePixelRatio 缩放，高清屏不糊；
 * - 数据存归一化坐标，容器尺寸变化不会让笔迹错位；
 * - 关闭批注时 `pointer-events: none`，完全不拦截页面原有交互。
 */
export class AnnotationLayer {
  readonly canvas: HTMLCanvasElement;

  private readonly host: HTMLElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly onChange: (items: AnnotationItem[]) => void;

  private items: AnnotationItem[] = [];
  private tool: ToolState = { mode: 'pen', color: '#1f2937', width: 4 };
  private enabled = false;

  private dpr = 1;
  private cssWidth = 1;
  private cssHeight = 1;

  private drawing: StrokeItem | null = null;
  private dragging: { item: TextItem; offset: Point } | null = null;
  /** 文字按下时的位置，用于区分「点击编辑」与「拖动移动」 */
  private pressed: {
    item: TextItem;
    start: Point;
    moved: boolean;
  } | null = null;
  private editor: HTMLTextAreaElement | null = null;
  private editing: TextItem | null = null;
  private editorPoint: Point = { x: 0, y: 0 };
  private observer: ResizeObserver | null = null;

  constructor(host: HTMLElement, options: LayerOptions) {
    this.host = host;
    this.onChange = options.onChange;

    this.canvas = document.createElement('canvas');
    this.canvas.dataset.annotationCanvas = 'true';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.style.position = 'absolute';
    this.canvas.style.inset = '0';
    this.canvas.style.zIndex = '5';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.touchAction = 'auto';

    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = this.canvas.getContext('2d');
    } catch {
      // 无 Canvas 实现的环境（如 jsdom）保持 null，后续绘制调用会自动跳过
    }
    this.ctx = ctx;

    this.host.appendChild(this.canvas);

    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('pointercancel', this.handlePointerUp);

    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(this.host);
    }

    this.resize();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.canvas.style.pointerEvents = enabled ? 'auto' : 'none';
    this.canvas.style.touchAction = enabled ? 'none' : 'auto';
    if (!enabled) this.closeEditor(false);
    this.updateCursor();
  }

  setTool(tool: ToolState): void {
    this.tool = { ...tool };
    this.updateCursor();
  }

  /** 直接替换整份批注（切页、撤销、清空），不触发 onChange */
  setItems(items: AnnotationItem[]): void {
    this.items = cloneItems(items);
    this.closeEditor(false);
    this.render();
  }

  snapshot(): AnnotationItem[] {
    return cloneItems(this.items);
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  resize(): void {
    const rect = this.host.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    this.cssWidth = width;
    this.cssHeight = height;
    this.dpr = Math.max(1, window.devicePixelRatio || 1);

    const pixelWidth = Math.round(width * this.dpr);
    const pixelHeight = Math.round(height * this.dpr);
    if (this.canvas.width !== pixelWidth) this.canvas.width = pixelWidth;
    if (this.canvas.height !== pixelHeight) this.canvas.height = pixelHeight;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    this.ctx?.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.render();
  }

  destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.closeEditor(false);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerUp);
    this.canvas.remove();
  }

  private render(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
    for (const item of this.items) this.drawItem(item);
    if (this.drawing) this.drawItem(this.drawing);
  }

  private drawItem(item: AnnotationItem): void {
    if (item.kind === 'stroke') this.drawStroke(item);
    else this.drawText(item);
  }

  private drawStroke(stroke: StrokeItem): void {
    const ctx = this.ctx;
    if (!ctx || stroke.points.length === 0) return;

    const points = stroke.points.map((point) => ({
      x: point.x * this.cssWidth,
      y: point.y * this.cssHeight,
    }));

    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, stroke.width / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    // 用二次贝塞尔穿过相邻点中点，笔迹比折线更顺滑
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length - 1; index += 1) {
      const midX = (points[index].x + points[index + 1].x) / 2;
      const midY = (points[index].y + points[index + 1].y) / 2;
      ctx.quadraticCurveTo(points[index].x, points[index].y, midX, midY);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }

  private drawText(note: TextItem): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.fillStyle = note.color;
    ctx.font = `600 ${FONT_PX}px ${FONT_FAMILY}`;
    ctx.textBaseline = 'top';
    note.text.split('\n').forEach((line, index) => {
      ctx.fillText(
        line,
        note.x * this.cssWidth,
        note.y * this.cssHeight + index * LINE_HEIGHT,
      );
    });
  }

  private textBox(note: TextItem): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    const lines = note.text.split('\n');
    let width = 0;
    if (this.ctx) {
      this.ctx.font = `600 ${FONT_PX}px ${FONT_FAMILY}`;
      for (const line of lines) {
        width = Math.max(width, this.ctx.measureText(line).width);
      }
    } else {
      for (const line of lines) {
        width = Math.max(width, line.length * FONT_PX * 0.62);
      }
    }
    return {
      x: note.x * this.cssWidth,
      y: note.y * this.cssHeight,
      width: Math.max(width, 8) + 6,
      height: lines.length * LINE_HEIGHT,
    };
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (!this.enabled || !this.ctx) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();

    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // 某些环境不支持指针捕获，退化为普通事件流即可
    }

    const point = this.toNormalized(event);

    if (this.tool.mode === 'pen') {
      this.drawing = {
        kind: 'stroke',
        id: newId(),
        color: this.tool.color,
        width: this.tool.width,
        points: [point],
      };
      this.render();
      return;
    }

    if (this.tool.mode === 'eraser') {
      this.eraseAt(point);
      return;
    }

    const hit = this.hitText(point);
    if (hit) {
      this.dragging = {
        item: hit,
        offset: { x: point.x - hit.x, y: point.y - hit.y },
      };
      this.pressed = { item: hit, start: point, moved: false };
      return;
    }
    this.openEditor(point, null);
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (this.drawing) {
      const point = this.toNormalized(event);
      const points = this.drawing.points;
      const last = points[points.length - 1];
      if (Math.hypot(point.x - last.x, point.y - last.y) > MIN_POINT_GAP) {
        points.push(point);
        this.render();
      }
      return;
    }

    if (this.dragging) {
      const point = this.toNormalized(event);
      if (this.pressed) {
        const moved =
          Math.abs(point.x - this.pressed.start.x) * this.cssWidth +
            Math.abs(point.y - this.pressed.start.y) * this.cssHeight >
          CLICK_TOLERANCE_PX;
        if (moved) this.pressed.moved = true;
      }
      this.dragging.item.x = clamp01(point.x - this.dragging.offset.x);
      this.dragging.item.y = clamp01(point.y - this.dragging.offset.y);
      this.render();
    }
  };

  private handlePointerUp = (event: PointerEvent): void => {
    try {
      this.canvas.releasePointerCapture(event.pointerId);
    } catch {
      // 忽略不支持指针捕获的环境
    }

    if (this.drawing) {
      const stroke = this.drawing;
      this.drawing = null;
      this.items.push(stroke);
      this.render();
      this.onChange(this.snapshot());
      return;
    }

    if (this.dragging) {
      const target = this.dragging.item;
      const wasClick = this.pressed ? !this.pressed.moved : false;
      this.dragging = null;
      this.pressed = null;
      this.render();
      // 没有移动就是一次点击：打开编辑器修改这段文字，而不是只结束拖动
      if (wasClick) {
        this.openEditor({ x: target.x, y: target.y }, target);
        return;
      }
      this.onChange(this.snapshot());
    }
  };

  private eraseAt(point: Point): void {
    const before = this.items.length;

    this.items = this.items.filter((item) =>
      item.kind === 'stroke'
        ? !strokeHit(point, item, this.cssWidth, this.cssHeight)
        : !this.hitText(point, item),
    );

    if (this.items.length !== before) {
      this.render();
      this.onChange(this.snapshot());
    }
  }

  private hitText(point: Point, only?: TextItem): TextItem | null {
    const pixel = {
      x: point.x * this.cssWidth,
      y: point.y * this.cssHeight,
    };
    const candidates = only ? [only] : this.items;
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const item = candidates[index];
      if (item.kind !== 'text') continue;
      const box = this.textBox(item);
      if (
        pointInRect(pixel, box.x - 4, box.y - 4, box.width + 8, box.height + 8)
      ) {
        return item;
      }
    }
    return null;
  }

  private toNormalized(event: PointerEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width || this.cssWidth || 1;
    const height = rect.height || this.cssHeight || 1;
    return {
      x: clamp01((event.clientX - rect.left) / width),
      y: clamp01((event.clientY - rect.top) / height),
    };
  }

  private updateCursor(): void {
    if (!this.enabled) {
      this.canvas.style.cursor = 'default';
      return;
    }
    this.canvas.style.cursor =
      this.tool.mode === 'text'
        ? 'text'
        : this.tool.mode === 'eraser'
          ? 'cell'
          : 'crosshair';
  }

  private openEditor(point: Point, existing: TextItem | null): void {
    this.closeEditor(false);
    this.editorPoint = point;
    this.editing = existing;

    const area = document.createElement('textarea');
    area.dataset.annotationEditor = 'true';
    area.value = existing?.text ?? '';
    area.rows = 2;
    area.setAttribute('aria-label', '批注文字');
    area.spellcheck = false;
    Object.assign(area.style, {
      position: 'absolute',
      zIndex: '6',
      padding: '6px 8px',
      border: '1px solid #2563eb',
      borderRadius: '8px',
      background: '#fff',
      color: '#0f172a',
      fontFamily: FONT_FAMILY,
      fontSize: '15px',
      lineHeight: '1.4',
      resize: 'none',
      boxShadow: '0 8px 24px rgb(15 23 42 / 14%)',
    });

    const left = Math.min(
      point.x * this.cssWidth,
      Math.max(0, this.cssWidth - 240),
    );
    const top = Math.min(
      point.y * this.cssHeight,
      Math.max(0, this.cssHeight - 64),
    );
    area.style.left = `${left}px`;
    area.style.top = `${top}px`;
    area.style.width = '232px';

    area.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeEditor(false);
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this.closeEditor(true);
      }
    });
    area.addEventListener('blur', () => this.closeEditor(true));

    this.host.appendChild(area);
    this.editor = area;
    area.focus();
    area.select();
  }

  private closeEditor(commit: boolean): void {
    const area = this.editor;
    if (!area) return;
    this.editor = null;

    const text = area.value.trim();
    const editing = this.editing;
    this.editing = null;
    area.remove();

    if (!commit) {
      this.render();
      return;
    }

    if (editing) {
      if (text.length === 0) {
        this.items = this.items.filter((item) => item.id !== editing.id);
      } else {
        editing.text = text;
      }
      this.render();
      this.onChange(this.snapshot());
      return;
    }

    if (text.length === 0) {
      this.render();
      return;
    }

    this.items.push({
      kind: 'text',
      id: newId(),
      color: this.tool.color,
      x: this.editorPoint.x,
      y: this.editorPoint.y,
      text,
    });
    this.render();
    this.onChange(this.snapshot());
  }
}
