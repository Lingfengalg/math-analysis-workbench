import { z } from 'zod';

/** 归一化坐标（相对批注容器 0–1），保证容器尺寸变化时笔迹不错位。 */
export type Point = { x: number; y: number };

/** 颜色只允许 6 位十六进制，避免把任意字符串写进 canvas 上下文。 */
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** 与界面输入限制共用的上限，避免「先画/先写，保存时才失败」。 */
export const ANNOTATION_LIMITS = {
  text: 500,
  points: 4000,
  items: 2000,
} as const;

const pointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const strokeSchema = z.object({
  kind: z.literal('stroke'),
  id: z.string().min(1),
  color: colorSchema,
  width: z.number().positive().max(64),
  points: z.array(pointSchema).min(1).max(ANNOTATION_LIMITS.points),
});

export const textSchema = z.object({
  kind: z.literal('text'),
  id: z.string().min(1),
  color: colorSchema,
  x: z.number(),
  y: z.number(),
  text: z.string().min(1).max(ANNOTATION_LIMITS.text),
});

export const annotationItemSchema = z.discriminatedUnion('kind', [
  strokeSchema,
  textSchema,
]);

export const annotationDocSchema = z.object({
  pageId: z.string().min(1),
  items: z.array(annotationItemSchema).max(ANNOTATION_LIMITS.items),
});

export type AnnotationItem = z.infer<typeof annotationItemSchema>;
export type StrokeItem = z.infer<typeof strokeSchema>;
export type TextItem = z.infer<typeof textSchema>;
export type AnnotationDoc = z.infer<typeof annotationDocSchema>;

export type ToolMode = 'pen' | 'eraser' | 'text';

export type ToolState = {
  mode: ToolMode;
  color: string;
  width: number;
};

export const COLORS = ['#1f2937', '#dc2626', '#2563eb', '#059669'] as const;
export const COLOR_LABELS: Record<string, string> = {
  '#1f2937': '黑色',
  '#dc2626': '红色',
  '#2563eb': '蓝色',
  '#059669': '绿色',
};

export const WIDTHS = [2, 4, 7] as const;
export const WIDTH_LABELS: Record<number, string> = {
  2: '细',
  4: '中',
  7: '粗',
};

export const TOOL_LABELS: Record<ToolMode, string> = {
  pen: '画笔',
  eraser: '橡皮',
  text: '文字',
};

export function emptyDoc(pageId: string): AnnotationDoc {
  return { pageId, items: [] };
}

export function cloneItems(items: AnnotationItem[]): AnnotationItem[] {
  return items.map((item) =>
    item.kind === 'stroke'
      ? { ...item, points: item.points.map((point) => ({ ...point })) }
      : { ...item },
  );
}

let counter = 0;

export function newId(): string {
  counter += 1;
  return `a${Date.now().toString(36)}${counter.toString(36)}`;
}
