import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Segmented,
  Select,
  Space,
  Tag,
} from 'antd';
import {
  ArrowRightOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  ExperimentOutlined,
  LineChartOutlined,
  PlusOutlined,
  ReadOutlined,
  SearchOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { knowledgeCards } from '@/content/knowledge';
import { starterMistakes } from '@/content/mistakes/starter';
import {
  KNOWLEDGE_TOPIC_LABELS,
  MISTAKE_ERROR_LABELS,
  MISTAKE_STATUS_LABELS,
  mistakeItemSchema,
  mistakesStoreSchema,
  plotRequestSchema,
  type KnowledgeTopic,
  type MistakeErrorTag,
  type MistakeItem,
  type MistakeStatus,
  type PlotRequest,
} from '@/shared/contracts';
import { compileExpression } from '@/shared/math/sample';
import { createKnowledgeLink } from '@/shared/navigation/knowledge-link';
import {
  parseMistakeDraftSearch,
  type MistakeDraftQuery,
} from '@/shared/navigation/mistake-link';
import { createPlotLink } from '@/shared/navigation/plot-link';
import { createStorage } from '@/shared/storage';
import { Formula } from '@/shared/ui/Formula';
import { PageHeader } from '@/shared/ui/PageHeader';
import styles from './MistakesPage.module.css';

const mistakesStorage = createStorage('mistakes', mistakesStoreSchema);

interface MistakeFormValues {
  title: string;
  topic: KnowledgeTopic;
  errorTag: MistakeErrorTag;
  status: MistakeStatus;
  prompt: string;
  formula?: string;
  myAttempt: string;
  correction: string;
  relatedKnowledgeId?: string;
  plotExpression?: string;
  plotXMin?: number | null;
  plotXMax?: number | null;
}

interface EditorState {
  key: string;
  mode: 'create' | 'edit';
  editingItem?: MistakeItem;
  initialValues: MistakeFormValues;
}

interface FeedbackBanner {
  type: 'success' | 'info' | 'warning' | 'error';
  title: string;
  description?: string;
}

const TOPIC_OPTIONS = (
  Object.entries(KNOWLEDGE_TOPIC_LABELS) as [KnowledgeTopic, string][]
).map(([value, label]) => ({ value, label }));

const ERROR_TAG_OPTIONS = (
  Object.entries(MISTAKE_ERROR_LABELS) as [MistakeErrorTag, string][]
).map(([value, label]) => ({ value, label }));

const STATUS_OPTIONS = (
  Object.entries(MISTAKE_STATUS_LABELS) as [MistakeStatus, string][]
).map(([value, label]) => ({ value, label }));

function buildDefaultFormValues(draft?: MistakeDraftQuery): MistakeFormValues {
  return {
    title: draft?.title ?? '',
    topic: draft?.topic ?? 'limit',
    errorTag: 'condition-misused',
    status: 'unresolved',
    prompt: '',
    formula: '',
    myAttempt: '',
    correction: '',
    relatedKnowledgeId: draft?.relatedKnowledgeId,
    plotExpression: draft?.expression ?? '',
    plotXMin: draft?.xMin ?? -5,
    plotXMax: draft?.xMax ?? 5,
  };
}

function buildEditFormValues(item: MistakeItem): MistakeFormValues {
  return {
    title: item.title,
    topic: item.topic,
    errorTag: item.errorTag,
    status: item.status,
    prompt: item.prompt,
    formula: item.formula ?? '',
    myAttempt: item.myAttempt,
    correction: item.correction,
    relatedKnowledgeId: item.relatedKnowledgeId,
    plotExpression: item.counterexamplePlot?.expression ?? '',
    plotXMin: item.counterexamplePlot?.xMin ?? -5,
    plotXMax: item.counterexamplePlot?.xMax ?? 5,
  };
}

function generateMistakeId(): string {
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `mistake-${Date.now().toString(36)}-${randomPart}`;
}

async function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('无法读取所选文件内容。'));
    reader.readAsText(file);
  });
}

function parseImportedMistakes(
  rawText: string,
): { ok: true; items: MistakeItem[] } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {
      ok: false,
      error: '文件内容不是合法的 JSON 格式，请检查文件是否损坏。',
    };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      ok: false,
      error: 'JSON 顶层结构必须是包含 items 错题数组的对象。',
    };
  }
  const record = parsed as Record<string, unknown>;
  if ('schemaVersion' in record && record.schemaVersion !== 1) {
    return {
      ok: false,
      error: `不支持的数据版本（schemaVersion: ${String(record.schemaVersion)}），当前仅兼容版本 1。`,
    };
  }
  const candidate =
    'data' in record && typeof record.data === 'object' && record.data !== null
      ? record.data
      : record;
  const validated = mistakesStoreSchema.safeParse(candidate);
  if (!validated.success) {
    const issue = validated.error.issues[0];
    return {
      ok: false,
      error: `错题数据校验未通过：${issue?.message ?? '字段格式不符合约定'}。`,
    };
  }
  for (const item of validated.data.items) {
    if (item.counterexamplePlot) {
      try {
        compileExpression(item.counterexamplePlot.expression);
      } catch (cause) {
        return {
          ok: false,
          error: `错题「${item.title}」的反例表达式不受支持：${
            cause instanceof Error ? cause.message : '语法无效'
          }`,
        };
      }
    }
  }
  return { ok: true, items: validated.data.items };
}

function MistakeEditorModal({
  state,
  onCancel,
  onSave,
}: {
  state: EditorState;
  onCancel: () => void;
  onSave: (item: MistakeItem, mode: 'create' | 'edit') => void;
}) {
  const [form] = Form.useForm<MistakeFormValues>();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const watchedFormula = Form.useWatch('formula', form);
  const watchedCardId = Form.useWatch('relatedKnowledgeId', form);

  const knowledgeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const card of knowledgeCards) {
      map.set(card.id, `${card.title} (${card.id})`);
    }
    const extraId = watchedCardId ?? state.initialValues.relatedKnowledgeId;
    if (extraId && !map.has(extraId)) {
      map.set(extraId, `关联卡片：${extraId}`);
    }
    return Array.from(map.entries()).map(([value, label]) => ({
      value,
      label,
    }));
  }, [state.initialValues.relatedKnowledgeId, watchedCardId]);

  const handleFinish = (values: MistakeFormValues) => {
    setSubmitError(null);
    const now = new Date().toISOString();
    const id = state.editingItem?.id ?? generateMistakeId();
    const trimmedExpression = values.plotExpression?.trim() ?? '';

    let counterexamplePlot: PlotRequest | undefined;
    if (trimmedExpression.length > 0) {
      const xMin = values.plotXMin ?? NaN;
      const xMax = values.plotXMax ?? NaN;
      const previousPlot = state.editingItem?.counterexamplePlot;
      const preserveExtras =
        previousPlot && previousPlot.expression === trimmedExpression;
      const plotCandidate: Record<string, unknown> = {
        expression: trimmedExpression,
        xMin,
        xMax,
        sourceMistakeId: id,
      };
      if (preserveExtras) {
        if (previousPlot.compareExpression)
          plotCandidate.compareExpression = previousPlot.compareExpression;
        if (previousPlot.yMin !== undefined)
          plotCandidate.yMin = previousPlot.yMin;
        if (previousPlot.yMax !== undefined)
          plotCandidate.yMax = previousPlot.yMax;
        if (previousPlot.secant) plotCandidate.secant = previousPlot.secant;
      }
      const plotCheck = plotRequestSchema.safeParse(plotCandidate);
      if (!plotCheck.success) {
        setSubmitError(plotCheck.error.issues[0].message);
        return;
      }
      try {
        compileExpression(plotCheck.data.expression);
      } catch (cause) {
        setSubmitError(
          cause instanceof Error ? cause.message : '反例函数表达式无法解析。',
        );
        return;
      }
      counterexamplePlot = plotCheck.data;
    }

    const trimmedFormula = values.formula?.trim() ?? '';
    const trimmedCardId = values.relatedKnowledgeId?.trim() ?? '';

    const candidate: MistakeItem = {
      id,
      title: values.title.trim(),
      topic: values.topic,
      errorTag: values.errorTag,
      status: values.status,
      prompt: values.prompt.trim(),
      formula: trimmedFormula.length > 0 ? trimmedFormula : undefined,
      myAttempt: values.myAttempt.trim(),
      correction: values.correction.trim(),
      relatedKnowledgeId: trimmedCardId.length > 0 ? trimmedCardId : undefined,
      counterexamplePlot,
      createdAt: state.editingItem?.createdAt ?? now,
      updatedAt: now,
    };

    const parsed = mistakeItemSchema.safeParse(candidate);
    if (!parsed.success) {
      setSubmitError(parsed.error.issues[0].message);
      return;
    }
    onSave(parsed.data, state.mode);
  };

  const modalTitle = state.mode === 'create' ? '记录新错题' : '编辑错题记录';

  return (
    <Modal
      title={modalTitle}
      aria-label={modalTitle}
      open
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText={state.mode === 'create' ? '保存错题' : '保存修改'}
      cancelText="取消"
      width={720}
      destroyOnHidden
    >
      {submitError && (
        <Alert
          type="error"
          showIcon
          title="请修正表单填写项"
          description={submitError}
          className="section-gap-bottom"
        />
      )}
      <Form
        form={form}
        name={state.mode === 'create' ? 'mistake-create' : 'mistake-edit'}
        layout="vertical"
        initialValues={state.initialValues}
        onFinish={handleFinish}
        requiredMark={false}
      >
        <Form.Item
          name="title"
          label="错题标题"
          rules={[
            { required: true, whitespace: true, message: '请输入错题标题' },
            { max: 120, message: '标题最多 120 个字符' },
          ]}
        >
          <Input
            placeholder="例如：在加减运算中盲目使用一阶等价无穷小相消"
            maxLength={120}
            autoComplete="off"
          />
        </Form.Item>

        <div className={styles.formTriple}>
          <Form.Item
            name="topic"
            label="所属主题"
            rules={[{ required: true, message: '请选择所属主题' }]}
          >
            <Select options={TOPIC_OPTIONS} />
          </Form.Item>

          <Form.Item
            name="errorTag"
            label="主要错因标签"
            rules={[{ required: true, message: '请选择主要错因标签' }]}
          >
            <Select options={ERROR_TAG_OPTIONS} />
          </Form.Item>

          <Form.Item
            name="status"
            label="掌握状态"
            rules={[{ required: true, message: '请选择掌握状态' }]}
          >
            <Select options={STATUS_OPTIONS} />
          </Form.Item>
        </div>

        <Form.Item
          name="prompt"
          label="题目背景"
          rules={[
            {
              required: true,
              whitespace: true,
              message: '请输入题目或问题背景',
            },
            { max: 1000, message: '题目最多 1000 个字符' },
          ]}
        >
          <Input.TextArea
            rows={2}
            placeholder="记录原题条件、求值目标或待检验命题…"
            maxLength={1000}
          />
        </Form.Item>

        <Form.Item
          name="formula"
          label="核心公式 LaTeX（可选）"
          rules={[{ max: 300, message: '公式最多 300 个字符' }]}
        >
          <Input
            placeholder="纯 LaTeX 数学表达式（不含中文），如 \lim_{x\to 0}\frac{\sin x}{x}=1"
            maxLength={300}
            autoComplete="off"
          />
        </Form.Item>

        {watchedFormula && watchedFormula.trim().length > 0 && (
          <div className={styles.formulaPreview} aria-label="公式实时预览">
            <span className={styles.formulaPreviewLabel}>公式实时预览</span>
            <Formula value={watchedFormula.trim()} />
          </div>
        )}

        <Form.Item
          name="myAttempt"
          label="当时的错误思路"
          rules={[
            {
              required: true,
              whitespace: true,
              message: '请记录当时的错误思路',
            },
            { max: 1000, message: '错误思路最多 1000 个字符' },
          ]}
        >
          <Input.TextArea
            rows={3}
            placeholder="诚实记录最初哪里想错、忽略了哪条前提条件…"
            maxLength={1000}
          />
        </Form.Item>

        <Form.Item
          name="correction"
          label="严谨订正与条件核查"
          rules={[
            {
              required: true,
              whitespace: true,
              message: '请填写严谨订正与条件核查',
            },
            { max: 1500, message: '订正内容最多 1500 个字符' },
          ]}
        >
          <Input.TextArea
            rows={3}
            placeholder="写出严谨推导步骤，并核查定理成立的充分/必要条件…"
            maxLength={1500}
          />
        </Form.Item>

        <Form.Item name="relatedKnowledgeId" label="关联知识卡片（可选）">
          <Select
            allowClear
            placeholder="选择关联的知识卡片（可留空）"
            options={knowledgeOptions}
          />
        </Form.Item>

        <div className={styles.plotConfigBox}>
          <p className={styles.plotConfigTitle}>
            可选反例绘图配置（填写表达式即可一键跳转到绘图实验室观察）
          </p>
          <Form.Item
            name="plotExpression"
            label="反例函数表达式（可选）"
            rules={[
              { max: 160, message: '表达式最多 160 个字符' },
              {
                validator: async (_, value: string | undefined) => {
                  const trimmed = value?.trim() ?? '';
                  if (!trimmed) return;
                  compileExpression(trimmed);
                },
              },
            ]}
          >
            <Input
              placeholder="例如：abs(x) 或 (tan(x) - sin(x)) / x^3"
              autoComplete="off"
            />
          </Form.Item>
          <div className={styles.plotRangeRow}>
            <Form.Item name="plotXMin" label="反例区间左端点">
              <InputNumber min={-10000} max={10000} />
            </Form.Item>
            <Form.Item
              name="plotXMax"
              label="反例区间右端点"
              dependencies={['plotExpression', 'plotXMin']}
              rules={[
                ({ getFieldValue }) => ({
                  validator: async (_, value: number | null | undefined) => {
                    const expr =
                      (
                        getFieldValue('plotExpression') as string | undefined
                      )?.trim() ?? '';
                    if (!expr) return;
                    const xMin = getFieldValue('plotXMin') as
                      number | null | undefined;
                    if (
                      typeof xMin !== 'number' ||
                      typeof value !== 'number' ||
                      !Number.isFinite(xMin) ||
                      !Number.isFinite(value)
                    ) {
                      throw new Error('配置反例表达式时请填写左右端点');
                    }
                    if (xMin >= value) {
                      throw new Error('左端点必须小于右端点');
                    }
                  },
                }),
              ]}
            >
              <InputNumber min={-10000} max={10000} />
            </Form.Item>
          </div>
        </div>
      </Form>
    </Modal>
  );
}

export default function MistakesPage() {
  const [search, setSearch] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [initialState] = useState(() => {
    const stored = mistakesStorage.read({ items: [] });
    const draft = stored.ok ? parseMistakeDraftSearch(search) : null;
    return {
      items: stored.ok ? stored.data.items : [],
      corruptError: stored.ok ? null : stored.error,
      initialEditor: draft
        ? ({
            key: 'draft-init',
            mode: 'create',
            initialValues: buildDefaultFormValues(draft),
          } satisfies EditorState)
        : null,
    };
  });

  const [items, setItems] = useState<MistakeItem[]>(initialState.items);
  const [corruptError, setCorruptError] = useState<string | null>(
    initialState.corruptError,
  );
  const [confirmResetStorage, setConfirmResetStorage] = useState(false);
  const [storageWriteError, setStorageWriteError] = useState<string | null>(
    null,
  );
  const [feedback, setFeedback] = useState<FeedbackBanner | null>(null);
  const [editorState, setEditorState] = useState<EditorState | null>(
    initialState.initialEditor,
  );
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [topicFilter, setTopicFilter] = useState<KnowledgeTopic | 'all'>('all');
  const [errorTagFilter, setErrorTagFilter] = useState<MistakeErrorTag | 'all'>(
    'all',
  );
  const [statusFilter, setStatusFilter] = useState<MistakeStatus | 'all'>(
    'all',
  );
  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    if (search.get('draft') === '1') {
      setSearch({}, { replace: true });
    }
  }, [search, setSearch]);

  const knowledgeTitleMap = useMemo(
    () => new Map(knowledgeCards.map((card) => [card.id, card.title])),
    [],
  );

  const stats = useMemo(() => {
    let unresolved = 0;
    let reviewing = 0;
    let mastered = 0;
    const errorCounts = new Map<MistakeErrorTag, number>();

    for (const item of items) {
      if (item.status === 'unresolved') unresolved += 1;
      else if (item.status === 'reviewing') reviewing += 1;
      else if (item.status === 'mastered') mastered += 1;
      errorCounts.set(item.errorTag, (errorCounts.get(item.errorTag) ?? 0) + 1);
    }

    let topError: { tag: MistakeErrorTag; count: number } | null = null;
    for (const [tag, count] of errorCounts.entries()) {
      if (!topError || count > topError.count) {
        topError = { tag, count };
      }
    }

    return {
      total: items.length,
      unresolved,
      reviewing,
      mastered,
      topError,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = keyword.trim().toLowerCase();
    return items.filter((item) => {
      if (topicFilter !== 'all' && item.topic !== topicFilter) return false;
      if (errorTagFilter !== 'all' && item.errorTag !== errorTagFilter)
        return false;
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (normalizedQuery.length > 0) {
        const haystack =
          `${item.title} ${item.prompt} ${item.myAttempt} ${item.correction}`.toLowerCase();
        if (!haystack.includes(normalizedQuery)) return false;
      }
      return true;
    });
  }, [errorTagFilter, items, keyword, statusFilter, topicFilter]);

  const persistItems = (nextItems: MistakeItem[]): boolean => {
    setItems(nextItems);
    const writeResult = mistakesStorage.write({ items: nextItems });
    if (!writeResult.ok) {
      setStorageWriteError(writeResult.error);
      return false;
    }
    setStorageWriteError(null);
    return true;
  };

  const handleConfirmResetStorage = () => {
    const clearResult = mistakesStorage.clear();
    if (!clearResult.ok) {
      setStorageWriteError(clearResult.error);
      return;
    }
    setCorruptError(null);
    setConfirmResetStorage(false);
    setStorageWriteError(null);
    setItems([]);
    setFeedback({
      type: 'success',
      title: '已重置错题本地存储，现在可以重新记录或导入错题。',
    });
  };

  const openCreateModal = () => {
    setEditorState({
      key: `create-${Date.now()}`,
      mode: 'create',
      initialValues: buildDefaultFormValues(),
    });
  };

  const openEditModal = (item: MistakeItem) => {
    setEditorState({
      key: `edit-${item.id}-${item.updatedAt}`,
      mode: 'edit',
      editingItem: item,
      initialValues: buildEditFormValues(item),
    });
  };

  const handleSaveEditor = (
    savedItem: MistakeItem,
    mode: 'create' | 'edit',
  ) => {
    const nextItems =
      mode === 'create'
        ? [savedItem, ...items]
        : items.map((existing) =>
            existing.id === savedItem.id ? savedItem : existing,
          );
    const savedToDisk = persistItems(nextItems);
    setEditorState(null);
    if (savedToDisk) {
      setFeedback({
        type: 'success',
        title:
          mode === 'create'
            ? `已记录新错题「${savedItem.title}」。`
            : `已更新错题「${savedItem.title}」。`,
      });
    }
  };

  const handleLoadStarter = () => {
    const existingIds = new Set(items.map((item) => item.id));
    const missingStarter = starterMistakes.filter(
      (starter) => !existingIds.has(starter.id),
    );
    if (missingStarter.length === 0) {
      setFeedback({
        type: 'info',
        title: '4 道典型错题示例均已在列表中，未覆盖你的现有修改。',
      });
      return;
    }
    const nextItems = [...items, ...missingStarter];
    const savedToDisk = persistItems(nextItems);
    if (savedToDisk) {
      setFeedback({
        type: 'success',
        title: `已载入 ${missingStarter.length} 道数分高频典型错题示例。`,
      });
    }
  };

  const handleStatusChange = (id: string, nextStatus: MistakeStatus) => {
    const now = new Date().toISOString();
    const nextItems = items.map((item) =>
      item.id === id ? { ...item, status: nextStatus, updatedAt: now } : item,
    );
    persistItems(nextItems);
  };

  const handleDelete = (id: string) => {
    const target = items.find((item) => item.id === id);
    const nextItems = items.filter((item) => item.id !== id);
    setConfirmDeleteId(null);
    const savedToDisk = persistItems(nextItems);
    if (savedToDisk && target) {
      setFeedback({
        type: 'info',
        title: `已删除错题「${target.title}」。`,
      });
    }
  };

  const handleExportJson = () => {
    const payload = {
      schemaVersion: 1 as const,
      exportedAt: new Date().toISOString(),
      items,
    };
    const jsonText = JSON.stringify(payload, null, 2);
    if (typeof URL.createObjectURL !== 'function') {
      setFeedback({
        type: 'warning',
        title: '当前运行环境不支持创建下载链接。',
      });
      return;
    }
    const blob = new Blob([jsonText], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `math-mistakes-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    if (typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(url);
    }
    setFeedback({
      type: 'success',
      title: `已导出 ${items.length} 道错题记录。`,
    });
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (corruptError) {
      setFeedback({
        type: 'error',
        title: '导入已中止',
        description:
          '当前本地存储存在未处理的损坏数据，请先确认重置本地存储后再导入，以免静默覆盖原数据。',
      });
      return;
    }

    try {
      const text = await readFileAsText(file);
      const parsed = parseImportedMistakes(text);
      if (!parsed.ok) {
        setFeedback({
          type: 'error',
          title: 'JSON 导入失败',
          description: parsed.error,
        });
        return;
      }

      const incomingById = new Map(
        parsed.items.map((imported) => [imported.id, imported]),
      );
      let updatedCount = 0;
      const merged: MistakeItem[] = items.map((existing) => {
        const replacement = incomingById.get(existing.id);
        if (replacement) {
          incomingById.delete(existing.id);
          updatedCount += 1;
          return replacement;
        }
        return existing;
      });
      const addedItems = Array.from(incomingById.values());
      const finalItems = [...merged, ...addedItems];

      if (finalItems.length > 500) {
        setFeedback({
          type: 'error',
          title: 'JSON 导入失败',
          description: '合并后的错题数量超过 500 条上限，请精简后再导入。',
        });
        return;
      }

      const savedToDisk = persistItems(finalItems);
      if (savedToDisk) {
        setFeedback({
          type: 'success',
          title: `成功导入 ${parsed.items.length} 道错题（新增 ${addedItems.length} 道，更新 ${updatedCount} 道）。`,
        });
      }
    } catch (cause) {
      setFeedback({
        type: 'error',
        title: 'JSON 导入失败',
        description:
          cause instanceof Error
            ? cause.message
            : '读取导入文件时发生未知错误。',
      });
    }
  };

  const hasActiveFilters =
    topicFilter !== 'all' ||
    errorTagFilter !== 'all' ||
    statusFilter !== 'all' ||
    keyword.trim().length > 0;

  const resetFilters = () => {
    setTopicFilter('all');
    setErrorTagFilter('all');
    setStatusFilter('all');
    setKeyword('');
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        aria-label="导入错题 JSON 文件"
        className={styles.hiddenFileInput}
        onChange={(event) => void handleImportFile(event)}
      />

      <PageHeader
        eyebrow="∑ · 错因归档与复盘"
        title="把每一次失误，沉淀成严谨的条件自觉。"
        description="按数学错因归档典型陷阱，串联定理前提核查与反例图像验证。"
        extra={
          !corruptError && (
            <div className={styles.headerActions}>
              {items.length > 0 && (
                <>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={openCreateModal}
                  >
                    记录新错题
                  </Button>
                  <Button
                    icon={<ExperimentOutlined />}
                    onClick={handleLoadStarter}
                  >
                    载入典型错题示例
                  </Button>
                </>
              )}
              <Button
                icon={<UploadOutlined />}
                onClick={() => fileInputRef.current?.click()}
              >
                导入 JSON
              </Button>
              <Button
                icon={<DownloadOutlined />}
                disabled={items.length === 0}
                onClick={handleExportJson}
              >
                导出 JSON
              </Button>
            </div>
          )
        }
      />

      {(corruptError || storageWriteError || feedback) && (
        <div className={styles.alertStack}>
          {corruptError && (
            <Alert
              type="error"
              showIcon
              title="本地错题存储读取异常（原数据未被覆盖）"
              description={`${corruptError} 为防止意外丢失数据，工作台未自动改写本地记录。若确认不再需要旧缓存，可手动重置错题本地存储。`}
              action={
                !confirmResetStorage ? (
                  <Button
                    danger
                    size="small"
                    onClick={() => setConfirmResetStorage(true)}
                  >
                    重置错题本地存储
                  </Button>
                ) : (
                  <Space size="small">
                    <Button
                      danger
                      type="primary"
                      size="small"
                      onClick={handleConfirmResetStorage}
                    >
                      确认重置
                    </Button>
                    <Button
                      size="small"
                      onClick={() => setConfirmResetStorage(false)}
                    >
                      取消
                    </Button>
                  </Space>
                )
              }
            />
          )}

          {storageWriteError && (
            <Alert
              type="error"
              showIcon
              closable
              onClose={() => setStorageWriteError(null)}
              title="本地存储写入失败（当前页面修改仍保留在内存中）"
              description={`${storageWriteError} 建议立即点击“导出 JSON”备份当前错题记录。`}
            />
          )}

          {feedback && (
            <Alert
              type={feedback.type}
              showIcon
              closable
              onClose={() => setFeedback(null)}
              title={feedback.title}
              description={feedback.description}
            />
          )}
        </div>
      )}

      <section className={styles.statsGrid} aria-label="错题统计概览">
        <div className={styles.statCard}>
          <span className={styles.statLabel}>总错题数</span>
          <strong className={styles.statValue}>{stats.total}</strong>
          <span className={styles.statSubtle}>本地版本化存储</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>待攻克</span>
          <strong
            className={`${styles.statValue} ${styles.statValueUnresolved}`}
          >
            {stats.unresolved}
          </strong>
          <span className={styles.statSubtle}>需重点重推条件</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>复习中</span>
          <strong
            className={`${styles.statValue} ${styles.statValueReviewing}`}
          >
            {stats.reviewing}
          </strong>
          <span className={styles.statSubtle}>结合反例巩固记忆</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>已掌握</span>
          <strong className={`${styles.statValue} ${styles.statValueMastered}`}>
            {stats.mastered}
          </strong>
          <span className={styles.statSubtle}>能独立举出反例</span>
        </div>
        <div className={`${styles.statCard} ${styles.statCardHighlight}`}>
          <span className={styles.statLabel}>当前最高频错因提示</span>
          <strong className={styles.statTopError}>
            {stats.topError
              ? `${MISTAKE_ERROR_LABELS[stats.topError.tag]}（${stats.topError.count} 题）`
              : '暂无记录'}
          </strong>
          <span className={styles.statSubtle}>
            {stats.topError
              ? '做题前优先核查该类前提条件'
              : '记录错题后自动归纳高频思维盲区'}
          </span>
        </div>
      </section>

      {!corruptError && items.length === 0 && (
        <section className={styles.emptyBox} aria-label="错题本空状态">
          <span className={styles.emptyBadge}>START FROM ONE MISTAKE</span>
          <h2>还没有错题记录，从一道典型陷阱开始复盘</h2>
          <p>
            工科数分中最有价值的进步，往往来自看清“为什么看似合理的推导会在边界条件失效”。你可以直接记录自己的错题，或先载入
            4 道精选高频错题体验完整联动。
          </p>
          <div className={styles.emptyActions}>
            <Button
              type="primary"
              size="large"
              icon={<PlusOutlined />}
              onClick={openCreateModal}
            >
              记录新错题
            </Button>
            <Button
              size="large"
              icon={<ExperimentOutlined />}
              onClick={handleLoadStarter}
            >
              载入典型错题示例
            </Button>
          </div>
        </section>
      )}

      {items.length > 0 && (
        <>
          <section className={styles.filterPanel} aria-label="错题多维筛选">
            <div className={styles.filterRow}>
              <Segmented
                name="filter-topic"
                aria-label="按主题筛选"
                value={topicFilter}
                options={[
                  { label: '全部主题', value: 'all' },
                  ...TOPIC_OPTIONS,
                ]}
                onChange={(value) =>
                  setTopicFilter(value as KnowledgeTopic | 'all')
                }
              />
              <Segmented
                name="filter-status"
                aria-label="按掌握状态筛选"
                value={statusFilter}
                options={[
                  { label: '全部状态', value: 'all' },
                  ...STATUS_OPTIONS,
                ]}
                onChange={(value) =>
                  setStatusFilter(value as MistakeStatus | 'all')
                }
              />
            </div>

            <div className={styles.filterRow}>
              <div className={styles.filterControls}>
                <Select
                  id="mistake-error-tag-filter"
                  aria-label="按错因标签筛选"
                  className={styles.errorSelect}
                  value={errorTagFilter}
                  options={[
                    { label: '全部错因标签', value: 'all' },
                    ...ERROR_TAG_OPTIONS,
                  ]}
                  onChange={(value) =>
                    setErrorTagFilter(value as MistakeErrorTag | 'all')
                  }
                />
                <Input
                  aria-label="搜索错题"
                  className={styles.searchInput}
                  placeholder="搜索标题、题目、错误思路或订正内容"
                  prefix={<SearchOutlined />}
                  allowClear
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                />
                {hasActiveFilters && (
                  <Button type="link" onClick={resetFilters}>
                    清空筛选
                  </Button>
                )}
              </div>
              <span className={styles.resultCount}>
                显示 {filteredItems.length} / {items.length} 道错题
              </span>
            </div>
          </section>

          {filteredItems.length === 0 ? (
            <div className={styles.filteredEmpty}>
              <p>没有找到符合当前筛选条件的错题记录。</p>
              <Button onClick={resetFilters}>重置全部筛选条件</Button>
            </div>
          ) : (
            <div className={styles.cardGrid}>
              {filteredItems.map((item) => {
                const matchedTitle = item.relatedKnowledgeId
                  ? knowledgeTitleMap.get(item.relatedKnowledgeId)
                  : undefined;
                const isConfirmingDelete = confirmDeleteId === item.id;

                return (
                  <article
                    key={item.id}
                    className={styles.mistakeCard}
                    aria-label={item.title}
                  >
                    <div className={styles.cardTopBar}>
                      <div className={styles.tagGroup}>
                        <Tag color="cyan">
                          {KNOWLEDGE_TOPIC_LABELS[item.topic]}
                        </Tag>
                        <Tag color="volcano">
                          {MISTAKE_ERROR_LABELS[item.errorTag]}
                        </Tag>
                      </div>
                      <Segmented
                        size="small"
                        name={`card-status-${item.id}`}
                        aria-label={`${item.title} 状态切换`}
                        value={item.status}
                        options={STATUS_OPTIONS}
                        onChange={(value) =>
                          handleStatusChange(item.id, value as MistakeStatus)
                        }
                      />
                    </div>

                    <h3 className={styles.cardTitle}>{item.title}</h3>
                    <p className={styles.promptText}>{item.prompt}</p>

                    {item.formula && <Formula value={item.formula} />}

                    <div className={styles.contrastGrid}>
                      <div className={styles.attemptBox}>
                        <span className={styles.boxLabel}>当时的错误思路</span>
                        <p className={styles.boxText}>{item.myAttempt}</p>
                      </div>
                      <div className={styles.correctionBox}>
                        <span className={styles.boxLabel}>
                          严谨订正与条件核查
                        </span>
                        <p className={styles.boxText}>{item.correction}</p>
                      </div>
                    </div>

                    <div className={styles.cardFooter}>
                      <div className={styles.crossLinks}>
                        {item.relatedKnowledgeId && (
                          <Link
                            className={styles.crossLink}
                            to={createKnowledgeLink({
                              cardId: item.relatedKnowledgeId,
                            })}
                          >
                            <ReadOutlined />
                            复习关联概念：
                            {matchedTitle ?? item.relatedKnowledgeId}
                            <ArrowRightOutlined />
                          </Link>
                        )}
                        {item.counterexamplePlot && (
                          <Link
                            className={styles.crossLink}
                            to={createPlotLink({
                              ...item.counterexamplePlot,
                              sourceMistakeId:
                                item.counterexamplePlot.sourceMistakeId ??
                                item.id,
                            })}
                          >
                            <LineChartOutlined />
                            去绘图中验证反例
                            <ArrowRightOutlined />
                          </Link>
                        )}
                      </div>

                      <div className={styles.cardActions}>
                        <Button
                          size="small"
                          icon={<EditOutlined />}
                          onClick={() => openEditModal(item)}
                        >
                          编辑
                        </Button>
                        {!isConfirmingDelete ? (
                          <Button
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => setConfirmDeleteId(item.id)}
                          >
                            删除
                          </Button>
                        ) : (
                          <>
                            <span className={styles.confirmPrompt}>
                              确认删除？
                            </span>
                            <Button
                              size="small"
                              danger
                              type="primary"
                              onClick={() => handleDelete(item.id)}
                            >
                              确认删除
                            </Button>
                            <Button
                              size="small"
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              取消
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {editorState && (
        <MistakeEditorModal
          key={editorState.key}
          state={editorState}
          onCancel={() => setEditorState(null)}
          onSave={handleSaveEditor}
        />
      )}
    </>
  );
}
