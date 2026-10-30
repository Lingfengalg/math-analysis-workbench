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
import { supportsAnnotationLock, withAnnotationLock } from './lock';
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
import {
  applyChanges,
  diffItems,
  isEmptyChanges,
  type AnnotationChanges,
} from './sync';
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

/** 供读屏朗读的条目描述；笔迹没有文字内容，用点数与锚点代替 */
function describeItem(item: AnnotationItem, index: number): string {
  if (item.kind === 'text') {
    const text = item.text.replace(/\s+/g, ' ').slice(0, 30);
    return `文字批注 ${index + 1}：${text}`;
  }
  const anchor = item.anchor ? `，锚定 ${item.anchor.key}` : '';
  return `手写批注 ${index + 1}：${item.points.length} 个点${anchor}`;
}
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
  /** 锚定内容块已不在页面上、被暂时隐藏的批注数量 */
  const [staleCount, setStaleCount] = useState(0);
  /** 供键盘/读屏使用的批注清单与播报文本 */
  const [items, setItems] = useState<AnnotationItem[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const [saveFailed, setSaveFailed] = useState(false);
  // 读到损坏/不兼容数据时暂停自动保存，避免把用户原数据覆盖掉
  const blockedRef = useRef(false);

  /** 每页独立保存基线与草稿，切页或等待锁期间不能互相覆盖。 */
  const syncedRef = useRef(new Map<string, AnnotationItem[]>());
  const pendingRef = useRef(
    new Map<string, { changes: AnnotationChanges; items: AnnotationItem[] }>(),
  );
  const [canWrite] = useState(() => supportsAnnotationLock());

  const cancelPending = useCallback((all = false) => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (all) pendingRef.current.clear();
    else pendingRef.current.delete(pageIdRef.current);
  }, []);

  const flushPending = useCallback(
    async (targetPage = pageIdRef.current) => {
      if (!pendingRef.current.has(targetPage)) return;
      if (!canWrite) {
        setSaveFailed(true);
        setNotice('当前环境不支持跨标签页写入锁，批注未保存。');
        return;
      }

      try {
        const outcome = await withAnnotationLock(targetPage, () => {
          // 取得锁后重新读取草稿，而不是使用排队时的旧快照。
          // 读取、写入和移除草稿均为同步操作，不会与本标签页的新输入交错。
          const pending = pendingRef.current.get(targetPage);
          if (!pending) return { skipped: true } as const;
          const latest = loadAnnotation(targetPage);
          if (latest.error) return { error: latest.error } as const;
          const merged = applyChanges(latest.doc.items, pending.changes);
          const error = saveAnnotation({ pageId: targetPage, items: merged });
          if (error) return { error } as const;
          pendingRef.current.delete(targetPage);
          syncedRef.current.set(targetPage, merged);
          return { items: merged, changes: pending.changes } as const;
        });

        if ('skipped' in outcome) return;
        if ('error' in outcome) {
          setSaveFailed(true);
          setNotice(
            `${outcome.error} 未保存的批注已保留，可点击「重试保存」。`,
          );
          return;
        }
        setSaveFailed((failed) => pendingRef.current.size > 0 && failed);
        // 老页面的保存完成不能修改当前页面，也不能覆盖保存完成后产生的新草稿。
        const layer = layerRef.current;
        if (
          targetPage === pageIdRef.current &&
          !pendingRef.current.has(targetPage) &&
          syncedRef.current.get(targetPage) === outcome.items &&
          layer &&
          !isEmptyChanges(outcome.changes) &&
          JSON.stringify(layer.snapshot()) !== JSON.stringify(outcome.items)
        ) {
          layer.setItems(outcome.items);
          setItems(outcome.items);
          historyRef.current.reset(outcome.items);
          setCanUndo(false);
          setCanRedo(false);
        }
      } catch {
        setSaveFailed(true);
        setNotice('批注保存失败，未保存的批注已保留，可点击「重试保存」。');
      }
    },
    [canWrite],
  );

  /** 页面隐藏时同步兜底；这里仍无法取得异步锁，跨标签页竞争另行处理。 */
  const flushPendingSync = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    for (const [targetPage, pending] of pendingRef.current) {
      const latest = loadAnnotation(targetPage);
      if (latest.error) {
        setSaveFailed(true);
        continue;
      }
      const merged = applyChanges(latest.doc.items, pending.changes);
      const error = saveAnnotation({ pageId: targetPage, items: merged });
      if (error) {
        setSaveFailed(true);
        continue;
      }
      pendingRef.current.delete(targetPage);
      syncedRef.current.set(targetPage, merged);
    }
  }, []);

  const persist = useCallback(
    (items: AnnotationItem[]) => {
      if (blockedRef.current) return;
      const targetPage = pageIdRef.current;
      pendingRef.current.set(targetPage, {
        changes: diffItems(syncedRef.current.get(targetPage) ?? [], items),
        items,
      });
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        void flushPending(targetPage);
      }, SAVE_DELAY_MS);
    },
    [flushPending],
  );

  const handleChange = useCallback(
    (items: AnnotationItem[]) => {
      const history = historyRef.current;
      history.record(items);
      setCanUndo(history.canUndo());
      setCanRedo(history.canRedo());
      setItems(items);
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
      onStale: (count) => setStaleCount(count),
    });
    layerRef.current = layer;
    layer.setEnabled(false);

    return () => {
      void flushPending();
      layer.destroy();
      layerRef.current = null;
    };
  }, [handleChange, flushPending]);

  // 切页：写入上一页未落盘内容后载入当前页
  useEffect(() => {
    // 先落盘上一页，再切 pageId；否则防抖中的改动会被写到新页面。
    // 放到微任务里，避免在 effect 同步阶段触发状态更新。
    const previousPage = pageIdRef.current;
    if (previousPage !== pageId) void flushPending(previousPage);
    pageIdRef.current = pageId;
    const layer = layerRef.current;
    if (!layer) return;

    const { doc, error } = loadAnnotation(pageId);
    const pending = pendingRef.current.get(pageId);
    if (!pending) syncedRef.current.set(pageId, doc.items);
    layer.setItems(pending?.items ?? doc.items);
    setItems(pending?.items ?? doc.items);
    if (pending && !error) void flushPending(pageId);
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
    const handlePageHide = () => flushPendingSync();
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flushPendingSync();
    };
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [flushPendingSync]);
  const undo = useCallback(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const previous = historyRef.current.undo();
    if (!previous) return;
    layer.setItems(previous);
    setItems(previous);
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
    setItems(next);
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
    syncedRef.current.set(pageIdRef.current, []);
    setItems([]);
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
    cancelPending(true);
    const error = clearAllAnnotations();
    if (error) {
      setNotice(error);
      return;
    }
    const layer = layerRef.current;
    layer?.setItems([]);
    syncedRef.current.clear();
    syncedRef.current.set(pageIdRef.current, []);
    setItems([]);
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
              <Button
                block
                danger
                onClick={() => {
                  for (const targetPage of pendingRef.current.keys())
                    void flushPending(targetPage);
                }}
              >
                重试保存
              </Button>
            )}
            <Typography.Text type="secondary" className={styles.status}>
              {statusText}
            </Typography.Text>
            <div
              className={styles.a11y}
              role="group"
              aria-label="批注的键盘与读屏入口"
            >
              <Button
                size="small"
                block
                onClick={() => layerRef.current?.createTextAtCenter()}
              >
                添加文字批注
              </Button>
              {items.length > 0 && (
                <details className={styles.list}>
                  <summary>批注列表（{items.length}）</summary>
                  <ul className={styles.listItems}>
                    {items.map((item, index) => (
                      <li key={item.id}>
                        <span>{describeItem(item, index)}</span>
                        <span className={styles.listActions}>
                          {item.kind === 'text' && (
                            <Button
                              size="small"
                              aria-label={`编辑第 ${index + 1} 条批注`}
                              onClick={() => {
                                layerRef.current?.editText(item.id);
                                setAnnouncement(
                                  `正在编辑第 ${index + 1} 条批注`,
                                );
                              }}
                            >
                              编辑
                            </Button>
                          )}
                          <Button
                            size="small"
                            aria-label={`删除第 ${index + 1} 条批注`}
                            onClick={() => {
                              if (layerRef.current?.removeItem(item.id)) {
                                setAnnouncement(`已删除第 ${index + 1} 条批注`);
                              }
                            }}
                          >
                            删除
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <p className={styles.srOnly} role="status" aria-live="polite">
                {announcement}
              </p>
            </div>{' '}
            {notice && (
              <Typography.Text type="danger" className={styles.status}>
                {notice}
              </Typography.Text>
            )}
            {staleCount > 0 && (
              <Typography.Text type="secondary" className={styles.status}>
                {staleCount} 条批注锚定的内容不在当前页面，已暂时隐藏
              </Typography.Text>
            )}
          </Card>
        )}
        {!canWrite && (
          <Typography.Text type="danger" className={styles.status}>
            当前环境不支持跨标签页写入锁，批注不可编辑
          </Typography.Text>
        )}
        <Button
          type={enabled ? 'primary' : 'default'}
          icon={<EditOutlined />}
          aria-pressed={enabled}
          disabled={!canWrite}
          onClick={() => setEnabled((value) => !value)}
        >
          {enabled ? '退出批注' : '批注'}
        </Button>
      </div>
    </div>
  );
}
