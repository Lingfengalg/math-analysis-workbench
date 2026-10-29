import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Button, Card, Popconfirm, Segmented, Tooltip, Typography } from 'antd';
import {
  ClearOutlined,
  DeleteOutlined,
  EditOutlined,
  RedoOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { createHistory } from './history';
import { AnnotationLayer } from './layer';
import {
  COLORS,
  COLOR_LABELS,
  TOOL_LABELS,
  WIDTHS,
  WIDTH_LABELS,
  type AnnotationItem,
  type ToolMode,
  type ToolState,
} from './model';
import {
  clearAllAnnotations,
  clearAnnotation,
  loadAnnotation,
  saveAnnotation,
} from './storage';
import styles from './AnnotationOverlay.module.css';

const SAVE_DELAY_MS = 250;

const TOOL_OPTIONS = (Object.keys(TOOL_LABELS) as ToolMode[]).map((value) => ({
  value,
  label: TOOL_LABELS[value],
}));

const WIDTH_OPTIONS = WIDTHS.map((value) => ({
  value,
  label: WIDTH_LABELS[value] ?? String(value),
}));

type Props = {
  /** 页面标识，通常取路由 pathname；不同页面各自保存批注 */
  pageId: string;
  children: ReactNode;
};

/**
 * 全页面批注层：在页面内容之上叠一层透明画布，支持多色手写、自由涂抹、
 * 整笔擦除与文字标注，按页面分别保存在 localStorage。
 */
export function AnnotationOverlay({ pageId, children }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<AnnotationLayer | null>(null);
  const historyRef = useRef(createHistory<AnnotationItem[]>(60));
  const pageIdRef = useRef(pageId);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [tool, setTool] = useState<ToolState>({
    mode: 'pen',
    color: COLORS[0],
    width: WIDTHS[1],
  });
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  // 读到损坏/不兼容数据时暂停自动保存，避免把用户原数据覆盖掉
  const blockedRef = useRef(false);

  /** 防抖期间待落盘的内容；必须记录自己的 pageId，避免切页后写到新页面。 */
  const pendingRef = useRef<{
    pageId: string;
    items: AnnotationItem[];
  } | null>(null);

  const cancelPending = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    pendingRef.current = null;
  }, []);

  const flushPending = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const pending = pendingRef.current;
    if (!pending) return;
    const error = saveAnnotation(pending);
    if (error) {
      // 保留草稿，等待用户重试；不能假报成功，也不能直接丢弃
      pendingRef.current = pending;
      setSaveFailed(true);
      setNotice(`${error} 未保存的批注已保留，可点击「重试保存」。`);
      return;
    }
    pendingRef.current = null;
    setSaveFailed(false);
  }, []);

  const persist = useCallback(
    (items: AnnotationItem[]) => {
      if (blockedRef.current) return;
      pendingRef.current = { pageId: pageIdRef.current, items };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(flushPending, SAVE_DELAY_MS);
    },
    [flushPending],
  );

  const handleChange = useCallback(
    (items: AnnotationItem[]) => {
      const history = historyRef.current;
      history.record(items);
      setCanUndo(history.canUndo());
      setCanRedo(history.canRedo());
      persist(items);
    },
    [persist],
  );

  // 画布只创建一次，后续通过 ref 操作
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const layer = new AnnotationLayer(host, {
      onChange: handleChange,
      onLimit: (message) => setNotice(message),
    });
    layerRef.current = layer;
    layer.setEnabled(false);

    return () => {
      flushPending();
      layer.destroy();
      layerRef.current = null;
    };
  }, [handleChange, flushPending]);

  // 切页：写入上一页未落盘内容后载入当前页
  useEffect(() => {
    // 先落盘上一页，再切 pageId；否则防抖中的改动会被写到新页面
    flushPending();
    pageIdRef.current = pageId;
    const layer = layerRef.current;
    if (!layer) return;

    const { doc, error } = loadAnnotation(pageId);
    layer.setItems(doc.items);
    historyRef.current.reset(layer.snapshot());
    setCanUndo(false);
    setCanRedo(false);
    blockedRef.current = Boolean(error);
    setNotice(error ? `${error} 已暂停自动保存，避免覆盖本页原有批注。` : null);
  }, [pageId, flushPending]);

  useEffect(() => {
    layerRef.current?.setTool(tool);
  }, [tool]);

  useEffect(() => {
    layerRef.current?.setEnabled(enabled);
  }, [enabled]);

  // 刷新、关闭或切到后台时同步落盘，不依赖 React 卸载（#33）
  useEffect(() => {
    const handlePageHide = () => flushPending();
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flushPending();
    };
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [flushPending]);
  const undo = useCallback(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const previous = historyRef.current.undo();
    if (!previous) return;
    layer.setItems(previous);
    setCanUndo(historyRef.current.canUndo());
    setCanRedo(historyRef.current.canRedo());
    persist(previous);
  }, [persist]);

  const redo = useCallback(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const next = historyRef.current.redo();
    if (!next) return;
    layer.setItems(next);
    setCanUndo(historyRef.current.canUndo());
    setCanRedo(historyRef.current.canRedo());
    persist(next);
  }, [persist]);

  const clearPage = useCallback(() => {
    cancelPending();
    const layer = layerRef.current;
    if (!layer) return;
    // 数据损坏被暂停保存时，「清空本页」是用户显式的重置操作，允许覆盖
    if (!blockedRef.current && layer.isEmpty()) return;
    layer.setItems([]);
    historyRef.current.record([]);
    setCanUndo(historyRef.current.canUndo());
    setCanRedo(historyRef.current.canRedo());
    const error = clearAnnotation(pageIdRef.current);
    if (error) {
      setNotice(error);
      return;
    }
    blockedRef.current = false;
    setNotice(null);
  }, [cancelPending]);

  const clearAll = useCallback(() => {
    cancelPending();
    const error = clearAllAnnotations();
    if (error) {
      setNotice(error);
      return;
    }
    const layer = layerRef.current;
    layer?.setItems([]);
    historyRef.current.reset([]);
    setCanUndo(false);
    setCanRedo(false);
    blockedRef.current = false;
    setNotice('已清空全部页面的批注。');
  }, [cancelPending]);

  // 键盘快捷键：批注开启时 P / E / T 切换工具，Ctrl/Cmd + Z 撤销
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      if (
        tagName === 'INPUT' ||
        tagName === 'TEXTAREA' ||
        target?.isContentEditable
      ) {
        return;
      }

      if (!enabled) return;

      const withMeta = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (withMeta && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (withMeta && key === 'y') {
        event.preventDefault();
        redo();
        return;
      }
      if (key === 'p') setTool((current) => ({ ...current, mode: 'pen' }));
      else if (key === 'e')
        setTool((current) => ({ ...current, mode: 'eraser' }));
      else if (key === 't')
        setTool((current) => ({ ...current, mode: 'text' }));
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, redo, undo]);

  const statusText = enabled
    ? `当前：${TOOL_LABELS[tool.mode]} · ${COLOR_LABELS[tool.color] ?? tool.color} · ${WIDTH_LABELS[tool.width] ?? tool.width}`
    : '开启后可在本页写字、涂抹、添加文字';

  return (
    <div className={styles.host} ref={hostRef}>
      {children}
      <div className={styles.toolbar}>
        {enabled && (
          <Card size="small" className={styles.panel} title="批注">
            <Segmented
              aria-label="批注工具"
              block
              value={tool.mode}
              options={TOOL_OPTIONS}
              onChange={(value) =>
                setTool((current) => ({
                  ...current,
                  mode: value as ToolMode,
                }))
              }
            />
            <div className={styles.swatches} role="group" aria-label="笔色">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`${styles.swatch}${color === tool.color ? ` ${styles.swatchActive}` : ''}`}
                  style={{ backgroundColor: color }}
                  aria-label={COLOR_LABELS[color]}
                  aria-pressed={color === tool.color}
                  onClick={() => setTool((current) => ({ ...current, color }))}
                />
              ))}
            </div>
            <Segmented
              aria-label="笔宽"
              block
              value={tool.width}
              options={WIDTH_OPTIONS}
              onChange={(value) =>
                setTool((current) => ({
                  ...current,
                  width: value as number,
                }))
              }
            />
            <div className={styles.actions}>
              <Tooltip title="撤销（Ctrl/Cmd + Z）">
                <Button
                  icon={<UndoOutlined />}
                  aria-label="撤销"
                  disabled={!canUndo}
                  onClick={undo}
                />
              </Tooltip>
              <Tooltip title="重做（Ctrl/Cmd + Shift + Z）">
                <Button
                  icon={<RedoOutlined />}
                  aria-label="重做"
                  disabled={!canRedo}
                  onClick={redo}
                />
              </Tooltip>
              <Tooltip title="清空本页（可撤销）">
                <Button
                  danger
                  icon={<ClearOutlined />}
                  aria-label="清空本页批注"
                  onClick={clearPage}
                />
              </Tooltip>
            </div>
            <Popconfirm
              title="清空全部页面的批注？"
              description="所有页面保存的批注都会被删除，无法撤销。"
              okText="全部清空"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={clearAll}
            >
              <Button block danger icon={<DeleteOutlined />}>
                清空全部
              </Button>
            </Popconfirm>{' '}
            {saveFailed && (
              <Button block danger onClick={flushPending}>
                重试保存
              </Button>
            )}
            <Typography.Text type="secondary" className={styles.status}>
              {statusText}
            </Typography.Text>
            {notice && (
              <Typography.Text type="danger" className={styles.status}>
                {notice}
              </Typography.Text>
            )}
          </Card>
        )}
        <Button
          type={enabled ? 'primary' : 'default'}
          icon={<EditOutlined />}
          aria-pressed={enabled}
          onClick={() => setEnabled((value) => !value)}
        >
          {enabled ? '退出批注' : '批注'}
        </Button>
      </div>
    </div>
  );
}
