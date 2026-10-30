import { clamp01, pointInRect, strokeHit } from './geometry';
import {
  anchorKeyOf,
  findAnchorAtPoint,
  frameFromElement,
  hostFrame,
  queryAnchor,
  toFramePoint,
  type Frame,
} from './anchoring';
import {
  ANNOTATION_LIMITS,
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
  /** 达到条目或点数上限时提示，不静默丢弃 */
  onLimit?: (message: string) => void;
  /** 有批注锚定的内容块已不在页面上时汇报数量（0 表示全部可显示） */
  onStale?: (count: number) => void;
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
  private readonly onLimit: (message: string) => void;
  private readonly onStale: (count: number) => void;

  private items: AnnotationItem[] = [];
  private tool: ToolState = { mode: 'pen', color: '#1f2937', width: 4 };
  private enabled = false;

  private dpr = 1;
  private cssWidth = 1;
  private cssHeight = 1;

  private drawing: StrokeItem | null = null;
  private dragging: { item: TextItem; offset: Point; frame: Frame } | null =
    null;
  /** 文字按下时的位置，用于区分「点击编辑」与「拖动移动」 */
  private pressed: {
    item: TextItem;
    start: Point;
    moved: boolean;
  } | null = null;
  private editor: HTMLTextAreaElement | null = null;
  private editing: TextItem | null = null;
  private editorPoint: Point = { x: 0, y: 0 };
  private editorFrame: Frame = { left: 0, top: 0, width: 1, height: 1 };
  private editorAnchorKey: string | null = null;
  private observer: ResizeObserver | null = null;

  /** 指针按下时所在的坐标系：命中的锚定块，或整页 */
  private activeFrame: Frame = { left: 0, top: 0, width: 1, height: 1 };
  private activeAnchorKey: string | null = null;
  private staleCount = 0;

  constructor(host: HTMLElement, options: LayerOptions) {
    this.host = host;
    this.onChange = options.onChange;
    this.onLimit =
      options.onLimit ??
      (() => {
        /* 默认不提示，由调用方决定 */
      });
    this.onStale =
      options.onStale ??
      (() => {
        /* 默认不汇报 */
      });
    this.activeFrame = hostFrame(1, 1);

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

  /** 键盘路径：在页面中部新建一条文字批注 */
  createTextAtCenter(): void {
    this.openEditor(
      { x: this.cssWidth / 2, y: this.cssHeight / 2 },
      hostFrame(this.cssWidth, this.cssHeight),
      null,
      null,
    );
  }

  /** 键盘路径：编辑指定文字批注 */
  editText(id: string): void {
    const item = this.items.find(
      (entry): entry is TextItem => entry.kind === 'text' && entry.id === id,
    );
    if (!item) return;
    const frame =
      this.frameOf(item) ?? hostFrame(this.cssWidth, this.cssHeight);
    this.openEditor(
      {
        x: frame.left + item.x * frame.width,
        y: frame.top + item.y * frame.height,
      },
      frame,
      item.anchor?.key ?? null,
      item,
    );
  }

  /** 键盘路径：删除单条批注，返回是否真的删掉了内容 */
  removeItem(id: string): boolean {
    const next = this.items.filter((item) => item.id !== id);
    if (next.length === this.items.length) return false;
    this.items = next;
    this.render();
    this.onChange(this.snapshot());
    return true;
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

    let stale = 0;
    for (const item of this.items) {
      const frame = this.frameOf(item);
      if (!frame) {
        stale += 1;
        continue;
      }
      this.drawItem(item, frame);
    }
    if (this.drawing) this.drawItem(this.drawing, this.activeFrame);

    if (stale !== this.staleCount) {
      this.staleCount = stale;
      this.onStale(stale);
    }
  }

  /** 条目所在的坐标系；锚定块已不存在时返回 null，该条批注暂时不显示 */
  private frameOf(item: AnnotationItem): Frame | null {
    if (!item.anchor) return hostFrame(this.cssWidth, this.cssHeight);
    const element = queryAnchor(this.host, item.anchor.key);
    if (!element) return null;
    return frameFromElement(element, this.canvas);
  }

  private drawItem(item: AnnotationItem, frame: Frame): void {
    if (item.kind === 'stroke') this.drawStroke(item, frame);
    else this.drawText(item, frame);
  }

  private drawStroke(stroke: StrokeItem, frame: Frame): void {
    const ctx = this.ctx;
    if (!ctx || stroke.points.length === 0) return;

    const points = stroke.points.map((point) => ({
      x: frame.left + point.x * frame.width,
      y: frame.top + point.y * frame.height,
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

  private drawText(note: TextItem, frame: Frame): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.fillStyle = note.color;
    ctx.font = `600 ${FONT_PX}px ${FONT_FAMILY}`;
    ctx.textBaseline = 'top';
    note.text.split('\n').forEach((line, index) => {
      ctx.fillText(
        line,
        frame.left + note.x * frame.width,
        frame.top + note.y * frame.height + index * LINE_HEIGHT,
      );
    });
  }

  private textBox(
    note: TextItem,
    frame: Frame,
  ): {
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
      x: frame.left + note.x * frame.width,
      y: frame.top + note.y * frame.height,
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

    // 指针落在哪个内容块上，就记进哪个块的坐标系；不在任何块上则退回整页
    const anchorElement = findAnchorAtPoint(event.clientX, event.clientY);
    const anchorFrame = anchorElement
      ? frameFromElement(anchorElement, this.canvas)
      : null;
    this.activeAnchorKey = anchorKeyOf(anchorElement);
    this.activeFrame = anchorFrame ?? hostFrame(this.cssWidth, this.cssHeight);

    const px = this.pointerPx(event);
    const point = toFramePoint(px, this.activeFrame);

    if (this.tool.mode === 'pen') {
      if (this.items.length >= ANNOTATION_LIMITS.items) {
        this.onLimit(
          `本页最多 ${ANNOTATION_LIMITS.items} 条批注，请先删除部分内容`,
        );
        return;
      }
      this.drawing = {
        kind: 'stroke',
        id: newId(),
        color: this.tool.color,
        width: this.tool.width,
        points: [point],
        ...(this.activeAnchorKey
          ? { anchor: { key: this.activeAnchorKey } }
          : {}),
      };
      this.render();
      return;
    }

    if (this.tool.mode === 'eraser') {
      this.eraseAt(px);
      return;
    }

    const hit = this.hitText(px);
    if (hit) {
      const hitFrame = this.frameOf(hit) ?? this.activeFrame;
      const local = toFramePoint(px, hitFrame);
      this.dragging = {
        item: hit,
        offset: { x: local.x - hit.x, y: local.y - hit.y },
        frame: hitFrame,
      };
      this.pressed = { item: hit, start: px, moved: false };
      return;
    }
    this.openEditor(px, this.activeFrame, this.activeAnchorKey, null);
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (this.drawing) {
      const point = toFramePoint(this.pointerPx(event), this.activeFrame);
      const points = this.drawing.points;
      const last = points[points.length - 1];
      if (points.length >= ANNOTATION_LIMITS.points) {
        this.onLimit(`单笔最多 ${ANNOTATION_LIMITS.points} 个点，已停止追加`);
        return;
      }
      if (Math.hypot(point.x - last.x, point.y - last.y) > MIN_POINT_GAP) {
        points.push(point);
        this.render();
      }
      return;
    }

    if (this.dragging) {
      const px = this.pointerPx(event);
      if (this.pressed) {
        const moved =
          Math.hypot(px.x - this.pressed.start.x, px.y - this.pressed.start.y) >
          CLICK_TOLERANCE_PX;
        if (moved) this.pressed.moved = true;
      }
      const local = toFramePoint(px, this.dragging.frame);
      this.dragging.item.x = clamp01(local.x - this.dragging.offset.x);
      this.dragging.item.y = clamp01(local.y - this.dragging.offset.y);
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
      const frame = this.dragging.frame;
      const wasClick = this.pressed ? !this.pressed.moved : false;
      this.dragging = null;
      this.pressed = null;
      this.render();
      // 没有移动就是一次点击：打开编辑器修改这段文字，而不是只结束拖动
      if (wasClick) {
        const anchorKey = target.anchor?.key ?? null;
        this.openEditor(
          {
            x: frame.left + target.x * frame.width,
            y: frame.top + target.y * frame.height,
          },
          frame,
          anchorKey,
          target,
        );
        return;
      }
      this.onChange(this.snapshot());
    }
  };

  private eraseAt(px: Point): void {
    const before = this.items.length;

    this.items = this.items.filter((item) => {
      const frame = this.frameOf(item);
      // 已隐藏（锚定块不存在）的批注不参与擦除，避免误删看不到的内容
      if (!frame) return true;
      if (item.kind === 'stroke') {
        const local = toFramePoint(px, frame);
        return !strokeHit(local, item, frame.width, frame.height);
      }
      return !this.hitText(px, item);
    });

    if (this.items.length !== before) {
      this.render();
      this.onChange(this.snapshot());
    }
  }

  private hitText(px: Point, only?: TextItem): TextItem | null {
    const candidates = only ? [only] : this.items;
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const item = candidates[index];
      if (item.kind !== 'text') continue;
      const frame = this.frameOf(item);
      if (!frame) continue;
      const box = this.textBox(item, frame);
      if (
        pointInRect(px, box.x - 4, box.y - 4, box.width + 8, box.height + 8)
      ) {
        return item;
      }
    }
    return null;
  }

  /** 画布内的像素坐标 */
  private pointerPx(event: PointerEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
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

  private openEditor(
    point: Point,
    frame: Frame,
    anchorKey: string | null,
    existing: TextItem | null,
  ): void {
    this.closeEditor(false);
    this.editorPoint = point;
    this.editorFrame = frame;
    this.editorAnchorKey = anchorKey;
    this.editing = existing;

    const area = document.createElement('textarea');
    area.dataset.annotationEditor = 'true';
    area.value = existing?.text ?? '';
    area.rows = 2;
    area.maxLength = ANNOTATION_LIMITS.text;
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

    const left = Math.min(point.x, Math.max(0, this.cssWidth - 240));
    const top = Math.min(point.y, Math.max(0, this.cssHeight - 64));
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

    if (this.items.length >= ANNOTATION_LIMITS.items) {
      this.onLimit(
        `本页最多 ${ANNOTATION_LIMITS.items} 条批注，文字未添加，请先删除部分内容`,
      );
      this.render();
      return;
    }
    const local = toFramePoint(this.editorPoint, this.editorFrame);
    const anchorKey = this.editorAnchorKey;
    this.items.push({
      kind: 'text',
      id: newId(),
      color: this.tool.color,
      x: clamp01(local.x),
      y: clamp01(local.y),
      text,
      ...(anchorKey ? { anchor: { key: anchorKey } } : {}),
    });
    this.render();
    this.onChange(this.snapshot());
  }
}
