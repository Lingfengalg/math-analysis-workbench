import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  ClearOutlined,
  DownloadOutlined,
  LinkOutlined,
  ReloadOutlined,
  RobotOutlined,
  SendOutlined,
  StopOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Alert, Button, Input, Select, Tag } from 'antd';
import { knowledgeCards } from '@/content/knowledge';
import {
  KNOWLEDGE_TOPIC_LABELS,
  MISTAKE_ERROR_LABELS,
  assistantChatResponseSchema,
  assistantHealthSchema,
  assistantSessionSchema,
  mistakesStoreSchema,
  type AssistantChatRequest,
  type AssistantContext,
  type AssistantHealth,
  type AssistantMessage,
  type MistakeItem,
} from '@/shared/contracts';
import { parseAssistantSearch } from '@/shared/navigation/assistant-link';
import { createKnowledgeLink } from '@/shared/navigation/knowledge-link';
import { createStorage } from '@/shared/storage';
import { Formula } from '@/shared/ui/Formula';
import { PageHeader } from '@/shared/ui/PageHeader';
import styles from './AssistantPage.module.css';

const DEFAULT_PRIVACY_NOTICE =
  '仅向已配置的模型服务发送当前对话与主动挂载的数学卡片/错题摘要，不采集个人身份信息，密钥仅保存在服务端环境变量。';

const GUIDED_PROMPTS = [
  {
    label: '核查洛必达与等价替换前提',
    prompt:
      '我在化简含未定式的极限时，怎样先核查洛必达法则的三条前提，避免在加减法里误用一阶等价无穷小？',
  },
  {
    label: '连续与可导的边界反例',
    prompt:
      '为什么函数在某一点连续却不一定可导？请结合左右导数定义与经典反例一步步追问我。',
  },
  {
    label: '二重积分极坐标与曲边定限',
    prompt:
      '把直角坐标二重积分化成极坐标或 X/Y-型曲边域累次积分时，最容易遗漏哪几个几何条件与雅可比因子？',
  },
  {
    label: '三重积分截面法与数值直观边界',
    prompt:
      '求解三重积分时何时优先用“先二后一”截面法？为什么三维体素黎曼和只能提供直观而不能替代严格证明？',
  },
] as const;

const CONTEXT_KIND_LABELS: Record<AssistantContext['kind'], string> = {
  knowledge: '知识图谱卡片',
  mistake: '错题本记录',
  plotting: '仿真实验上下文',
};

const sessionStorage = createStorage(
  'assistant-session',
  assistantSessionSchema,
);
const mistakesStorage = createStorage('mistakes', mistakesStoreSchema);

type HealthState =
  | { status: 'checking' }
  | { status: 'ready'; health: AssistantHealth }
  | { status: 'unconfigured'; health: AssistantHealth }
  | { status: 'offline'; message: string };

type MathBlockChunk =
  { type: 'text'; value: string } | { type: 'block-math'; value: string };

type InlineChunk =
  { type: 'text'; value: string } | { type: 'inline-math'; value: string };

function splitBlockMath(input: string): MathBlockChunk[] {
  const chunks: MathBlockChunk[] = [];
  let buffer = '';
  let index = 0;

  while (index < input.length) {
    if (input[index] === '\\' && input[index + 1] === '$') {
      buffer += '$';
      index += 2;
      continue;
    }

    if (input.startsWith('$$', index)) {
      let closeIndex = index + 2;
      let foundClose = -1;
      while (closeIndex < input.length) {
        if (input[closeIndex] === '\\' && input[closeIndex + 1] === '$') {
          closeIndex += 2;
          continue;
        }
        if (input.startsWith('$$', closeIndex)) {
          foundClose = closeIndex;
          break;
        }
        closeIndex += 1;
      }

      if (foundClose !== -1) {
        const formula = input.slice(index + 2, foundClose).trim();
        if (formula) {
          if (buffer) {
            chunks.push({ type: 'text', value: buffer });
            buffer = '';
          }
          chunks.push({ type: 'block-math', value: formula });
          index = foundClose + 2;
          continue;
        }
      }
    }

    buffer += input[index];
    index += 1;
  }

  if (buffer) {
    chunks.push({ type: 'text', value: buffer });
  }
  return chunks;
}

function splitInlineMath(paragraph: string): InlineChunk[] {
  const tokens: InlineChunk[] = [];
  let buffer = '';
  let index = 0;

  while (index < paragraph.length) {
    if (paragraph[index] === '\\' && paragraph[index + 1] === '$') {
      buffer += '$';
      index += 2;
      continue;
    }

    if (paragraph[index] === '$' && !paragraph.startsWith('$$', index)) {
      let closeIndex = index + 1;
      let foundClose = -1;
      while (closeIndex < paragraph.length) {
        if (
          paragraph[closeIndex] === '\\' &&
          paragraph[closeIndex + 1] === '$'
        ) {
          closeIndex += 2;
          continue;
        }
        if (
          paragraph[closeIndex] === '$' &&
          !paragraph.startsWith('$$', closeIndex)
        ) {
          foundClose = closeIndex;
          break;
        }
        closeIndex += 1;
      }

      if (foundClose !== -1) {
        const formula = paragraph.slice(index + 1, foundClose).trim();
        if (formula) {
          if (buffer) {
            tokens.push({ type: 'text', value: buffer });
            buffer = '';
          }
          tokens.push({ type: 'inline-math', value: formula });
          index = foundClose + 1;
          continue;
        }
      }
    }

    buffer += paragraph[index];
    index += 1;
  }

  if (buffer) {
    tokens.push({ type: 'text', value: buffer });
  }
  return tokens;
}

function RichMathContent({ content }: { content: string }) {
  const blocks = useMemo(() => splitBlockMath(content), [content]);

  return (
    <div className={styles.richBody}>
      {blocks.map((block, blockIndex) => {
        if (block.type === 'block-math') {
          return (
            <div key={`block-${blockIndex}`} className={styles.blockMath}>
              <Formula value={block.value} />
            </div>
          );
        }

        const paragraphs = block.value
          .split(/\n{2,}/)
          .map((part) => part.trim())
          .filter(Boolean);

        return paragraphs.map((paragraph, pIndex) => {
          const inlineChunks = splitInlineMath(paragraph);
          return (
            <div
              key={`para-${blockIndex}-${pIndex}`}
              className={styles.richParagraph}
            >
              {inlineChunks.map((chunk, chunkIndex) =>
                chunk.type === 'inline-math' ? (
                  <span
                    key={`inline-${chunkIndex}`}
                    className={styles.inlineMath}
                  >
                    <Formula value={chunk.value} />
                  </span>
                ) : (
                  <span key={`text-${chunkIndex}`}>{chunk.value}</span>
                ),
              )}
            </div>
          );
        });
      })}
    </div>
  );
}

function createMessageId(prefix: 'user' | 'assistant'): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatMessageTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildKnowledgeContext(cardId: string): AssistantContext | undefined {
  const card = knowledgeCards.find((item) => item.id === cardId);
  if (!card) return undefined;
  const firstCondition = card.conditions[0] ?? '';
  const summary = `${card.definition} 关键前提：${firstCondition}`.slice(
    0,
    800,
  );
  return {
    kind: 'knowledge',
    id: card.id,
    title: card.title.slice(0, 160),
    summary,
    formula: card.formula.slice(0, 300),
  };
}

function buildMistakeContext(
  items: MistakeItem[],
  mistakeId: string,
): AssistantContext | undefined {
  const item = items.find((entry) => entry.id === mistakeId);
  if (!item) return undefined;
  const summary = `题目：${item.prompt} 当时思路：${item.myAttempt}`.slice(
    0,
    800,
  );
  return {
    kind: 'mistake',
    id: item.id,
    title: item.title.slice(0, 160),
    summary,
    formula: item.formula ? item.formula.slice(0, 300) : undefined,
  };
}

function resolveContextBackLink(context: AssistantContext): {
  to: string;
  label: string;
} {
  if (context.kind === 'knowledge') {
    const matched = knowledgeCards.find((item) => item.id === context.id);
    return {
      to: createKnowledgeLink(
        matched ? { topic: matched.topic, cardId: matched.id } : {},
      ),
      label: matched ? '查看原知识卡片' : '前往知识导航',
    };
  }
  if (context.kind === 'mistake') {
    return { to: '/mistakes', label: '返回错题本' };
  }
  return { to: '/plotting', label: '返回仿真实验室' };
}

async function probeAiHealth(signal: AbortSignal): Promise<HealthState | null> {
  try {
    const response = await fetch('/api/ai/health', {
      method: 'GET',
      signal,
    });
    if (!response.ok) {
      return {
        status: 'offline',
        message: `健康检查接口返回 HTTP ${response.status}，请确认代理服务正常运行。`,
      };
    }
    const raw = await response.json();
    const parsed = assistantHealthSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        status: 'offline',
        message: '健康检查返回格式不符合契约，请检查本地代理版本。',
      };
    }
    return parsed.data.configured
      ? { status: 'ready', health: parsed.data }
      : { status: 'unconfigured', health: parsed.data };
  } catch (cause) {
    if (
      signal.aborted ||
      (typeof cause === 'object' &&
        cause !== null &&
        'name' in cause &&
        cause.name === 'AbortError')
    ) {
      return null;
    }
    return {
      status: 'offline',
      message: '未能连接到本地 AI 代理服务（127.0.0.1:8787）。',
    };
  }
}

export default function AssistantPage() {
  const [searchParams] = useSearchParams();
  const urlParsed = useMemo(
    () => parseAssistantSearch(searchParams),
    [searchParams],
  );

  const initialReads = useMemo(() => {
    const sessionRead = sessionStorage.read({ messages: [] });
    const mistakesRead = mistakesStorage.read({ items: [] });
    return { sessionRead, mistakesRead };
  }, []);

  const [sessionCorrupted, setSessionCorrupted] = useState(
    !initialReads.sessionRead.ok,
  );
  const [storageAlerts, setStorageAlerts] = useState<string[]>(() => {
    const alerts: string[] = [];
    if (!initialReads.sessionRead.ok) {
      alerts.push(`会话记录读取异常：${initialReads.sessionRead.error}`);
    }
    if (!initialReads.mistakesRead.ok) {
      alerts.push(`错题本读取异常：${initialReads.mistakesRead.error}`);
    }
    return alerts;
  });

  const [mistakeItems] = useState<MistakeItem[]>(() =>
    initialReads.mistakesRead.ok ? initialReads.mistakesRead.data.items : [],
  );

  const [messages, setMessages] = useState<AssistantMessage[]>(() =>
    initialReads.sessionRead.ok ? initialReads.sessionRead.data.messages : [],
  );
  const [attachedContext, setAttachedContext] = useState<
    AssistantContext | undefined
  >(() => {
    if (urlParsed.context) return urlParsed.context;
    return initialReads.sessionRead.ok
      ? initialReads.sessionRead.data.attachedContext
      : undefined;
  });
  const [inputValue, setInputValue] = useState(() => urlParsed.prompt ?? '');

  const [healthState, setHealthState] = useState<HealthState>({
    status: 'checking',
  });
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const streamRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const healthAbortRef = useRef<AbortController | null>(null);

  const serializedSearch = searchParams.toString();
  const [prevSearch, setPrevSearch] = useState(serializedSearch);
  if (serializedSearch !== prevSearch) {
    setPrevSearch(serializedSearch);
    if (urlParsed.context) {
      setAttachedContext(urlParsed.context);
    }
    if (urlParsed.prompt) {
      setInputValue(urlParsed.prompt);
    }
  }

  const persistSession = useCallback(
    (
      nextMessages: AssistantMessage[],
      nextContext: AssistantContext | undefined,
      forceOverwrite = false,
    ) => {
      if (sessionCorrupted && !forceOverwrite) return;
      const writeResult = sessionStorage.write({
        messages: nextMessages.slice(-60),
        ...(nextContext ? { attachedContext: nextContext } : {}),
      });
      if (!writeResult.ok) {
        setStorageAlerts((prev) =>
          prev.includes(writeResult.error)
            ? prev
            : [...prev, writeResult.error],
        );
      }
    },
    [sessionCorrupted],
  );

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [messages, isSending]);

  const refreshHealth = useCallback(() => {
    healthAbortRef.current?.abort();
    const controller = new AbortController();
    healthAbortRef.current = controller;
    setHealthState({ status: 'checking' });
    void probeAiHealth(controller.signal).then((nextState) => {
      if (!controller.signal.aborted && nextState) {
        setHealthState(nextState);
      }
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    healthAbortRef.current = controller;
    void probeAiHealth(controller.signal).then((nextState) => {
      if (!controller.signal.aborted && nextState) {
        setHealthState(nextState);
      }
    });
    return () => {
      controller.abort();
      chatAbortRef.current?.abort();
    };
  }, []);

  const knowledgeSelectOptions = useMemo(
    () =>
      knowledgeCards.map((card) => ({
        value: card.id,
        label: `[${KNOWLEDGE_TOPIC_LABELS[card.topic]}] ${card.title}`,
      })),
    [],
  );

  const mistakeSelectOptions = useMemo(
    () =>
      mistakeItems.map((item) => ({
        value: item.id,
        label: `[${MISTAKE_ERROR_LABELS[item.errorTag]}] ${item.title}`,
      })),
    [mistakeItems],
  );

  const selectedKnowledgeId =
    attachedContext?.kind === 'knowledge' &&
    knowledgeCards.some((card) => card.id === attachedContext.id)
      ? attachedContext.id
      : undefined;

  const selectedMistakeId =
    attachedContext?.kind === 'mistake' &&
    mistakeItems.some((item) => item.id === attachedContext.id)
      ? attachedContext.id
      : undefined;

  const privacyNotice =
    healthState.status === 'ready' || healthState.status === 'unconfigured'
      ? healthState.health.privacyNotice
      : DEFAULT_PRIVACY_NOTICE;

  const handleSelectKnowledge = (cardId?: string) => {
    if (!cardId) {
      if (attachedContext?.kind === 'knowledge') {
        setAttachedContext(undefined);
        persistSession(messages, undefined);
      }
      return;
    }
    const next = buildKnowledgeContext(cardId);
    if (next) {
      setAttachedContext(next);
      setStatusNote(`已挂载知识卡片：${next.title}`);
      persistSession(messages, next);
    }
  };

  const handleSelectMistake = (mistakeId?: string) => {
    if (!mistakeId) {
      if (attachedContext?.kind === 'mistake') {
        setAttachedContext(undefined);
        persistSession(messages, undefined);
      }
      return;
    }
    const next = buildMistakeContext(mistakeItems, mistakeId);
    if (next) {
      setAttachedContext(next);
      setStatusNote(`已挂载错题记录：${next.title}`);
      persistSession(messages, next);
    }
  };

  const handleApplyPrompt = (prompt: string) => {
    setInputValue(prompt);
    setChatError(null);
    inputRef.current?.focus();
  };

  const handleCancelRequest = () => {
    chatAbortRef.current?.abort();
  };

  const handleClearChat = () => {
    chatAbortRef.current?.abort();
    setIsSending(false);
    setMessages([]);
    setChatError(null);
    setStatusNote('已清空当前对话记录。');
    setSessionCorrupted(false);
    setStorageAlerts((prev) =>
      prev.filter((msg) => !msg.startsWith('会话记录读取异常')),
    );
    sessionStorage.clear();
  };

  const handleExportJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      attachedContext: attachedContext ?? null,
      messages,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `math-tutor-session-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatusNote('已导出当前对话与上下文 JSON 文件。');
  };

  const sendMessage = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isSending) return;

    const userMessage: AssistantMessage = {
      id: createMessageId('user'),
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };

    const nextMessages = [...messages, userMessage].slice(-60);
    setMessages(nextMessages);
    persistSession(nextMessages, attachedContext);
    setInputValue('');
    setChatError(null);
    setStatusNote(null);
    setIsSending(true);

    const requestPayload: AssistantChatRequest = {
      messages: nextMessages.slice(-24).map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      ...(attachedContext ? { context: attachedContext } : {}),
    };

    chatAbortRef.current?.abort();
    const controller = new AbortController();
    chatAbortRef.current = controller;

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
      });

      const rawText = await response.text();
      let parsedJson: unknown = null;
      try {
        parsedJson = rawText ? JSON.parse(rawText) : null;
      } catch {
        parsedJson = null;
      }

      const parsedResponse = assistantChatResponseSchema.safeParse(parsedJson);
      if (!parsedResponse.success) {
        setChatError(
          response.ok
            ? '服务端返回格式不符合契约，未显示回复。'
            : `AI 代理请求失败（HTTP ${response.status}），请确认服务端代理已启动。`,
        );
        return;
      }

      if (!parsedResponse.data.ok) {
        setChatError(parsedResponse.data.error);
        if (parsedResponse.data.code === 'UNCONFIGURED') {
          refreshHealth();
        }
        return;
      }

      const assistantReply: AssistantMessage = {
        id: createMessageId('assistant'),
        role: 'assistant',
        content: parsedResponse.data.reply,
        createdAt: new Date().toISOString(),
        model: parsedResponse.data.model,
      };
      const updatedMessages = [...nextMessages, assistantReply].slice(-60);
      setMessages(updatedMessages);
      persistSession(updatedMessages, attachedContext);
    } catch (cause) {
      const isAbort =
        controller.signal.aborted ||
        (typeof cause === 'object' &&
          cause !== null &&
          'name' in cause &&
          cause.name === 'AbortError');
      if (isAbort) {
        setStatusNote('已停止本次请求。');
        return;
      }
      setChatError(
        '无法连接到 AI 代理服务（/api/ai/chat），请先按上方指引启动服务端代理。',
      );
      refreshHealth();
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage();
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      void sendMessage();
    }
  };

  const statusPillClass =
    healthState.status === 'ready'
      ? `${styles.statusPill} ${styles.statusReady}`
      : healthState.status === 'checking'
        ? `${styles.statusPill} ${styles.statusChecking}`
        : `${styles.statusPill} ${styles.statusWarn}`;

  const statusDotClass =
    healthState.status === 'ready'
      ? styles.dotReady
      : healthState.status === 'checking'
        ? styles.dotChecking
        : styles.dotWarn;

  const statusText =
    healthState.status === 'ready'
      ? `代理已就绪 · ${healthState.health.provider} (${healthState.health.model})`
      : healthState.status === 'checking'
        ? '正在检测服务端代理…'
        : healthState.status === 'unconfigured'
          ? `未配置服务端密钥 · ${healthState.health.provider}`
          : '代理未连接（离线）';

  const contextBackLink = attachedContext
    ? resolveContextBackLink(attachedContext)
    : null;

  return (
    <>
      <PageHeader
        eyebrow="∂ · 苏格拉底式助教"
        title="AI 助教：先问条件，再推结论"
        description="结合你的知识卡片、错题盲区与仿真上下文进行启发式追问；所有模型密钥仅由服务端代理保管，绝不注入前端或伪造回复。"
        extra={
          <div className={styles.headerActions}>
            <span className={statusPillClass} role="status" aria-live="polite">
              <span className={statusDotClass} aria-hidden="true" />
              {statusText}
            </span>
            <Button
              icon={<ReloadOutlined />}
              onClick={refreshHealth}
              disabled={healthState.status === 'checking'}
            >
              刷新连接
            </Button>
            <Button
              icon={<DownloadOutlined />}
              onClick={handleExportJson}
              disabled={messages.length === 0 && !attachedContext}
            >
              导出 JSON
            </Button>
            <Button
              icon={<ClearOutlined />}
              onClick={handleClearChat}
              disabled={
                messages.length === 0 && !sessionCorrupted && !chatError
              }
            >
              清空对话
            </Button>
          </div>
        }
      />

      {storageAlerts.length > 0 && (
        <div className={styles.alertStack}>
          {storageAlerts.map((msg, idx) => (
            <Alert
              key={`storage-alert-${idx}`}
              type="warning"
              showIcon
              title={msg}
            />
          ))}
        </div>
      )}

      {(healthState.status === 'unconfigured' ||
        healthState.status === 'offline') && (
        <section
          className={styles.diagnosticPanel}
          aria-label="服务端代理配置指引"
        >
          <div className={styles.diagnosticCopy}>
            <span className={styles.diagnosticBadge}>
              {healthState.status === 'unconfigured'
                ? '503 UNCONFIGURED · 服务端尚未配置密钥'
                : '代理服务离线 · 未连接到 127.0.0.1:8787'}
            </span>
            <h2>
              {healthState.status === 'unconfigured'
                ? '代理已启动，但尚未检测到模型 API Key'
                : '本地 AI 代理尚未启动或暂不可达'}
            </h2>
            <p>
              {healthState.status === 'unconfigured'
                ? '为保障零密钥泄露，本系统不会在浏览器保存密钥，也绝不使用预置文本冒充模型推理结果。请在服务端环境变量设置密钥后重启代理。'
                : `${healthState.message} 请在独立终端启动零依赖服务端代理（默认监听 127.0.0.1:8787），本页面不会伪造任何 AI 回复。`}
            </p>
            <p className={styles.diagnosticNotice}>{privacyNotice}</p>
          </div>
          <div className={styles.commandCard}>
            <div className={styles.commandHeader}>
              <span>终端启动命令（仅服务端持有密钥）</span>
              <Button
                size="small"
                ghost
                icon={<ReloadOutlined />}
                onClick={refreshHealth}
              >
                重新检测
              </Button>
            </div>
            <pre className={styles.commandPre}>
              <code>{`AI_API_KEY=your_api_key npm run dev:proxy\n# 可选 DeepSeek / DashScope：\n# DEEPSEEK_API_KEY=... npm run dev:proxy\n# DASHSCOPE_API_KEY=... npm run dev:proxy`}</code>
            </pre>
            <p className={styles.commandHint}>
              支持 OpenAI 兼容环境变量：AI_API_KEY / OPENAI_API_KEY /
              DEEPSEEK_API_KEY / DASHSCOPE_API_KEY、AI_BASE_URL、AI_MODEL。
            </p>
          </div>
        </section>
      )}

      <div className={styles.workspaceGrid}>
        <aside
          className={styles.contextSidebar}
          aria-label="学习上下文与审校护栏"
        >
          <section className={styles.glassCard}>
            <div className={styles.cardTitleRow}>
              <h2>受控上下文挂载</h2>
              <Tag color="cyan">按需注入</Tag>
            </div>
            <p className={styles.cardSubtitle}>
              仅发送你主动选中的卡片定义、定理前提或错题摘要，不扫描无关浏览器存储。
            </p>

            <div className={styles.pickerField}>
              <label
                htmlFor="knowledge-context-select"
                className={styles.pickerLabel}
              >
                从知识图谱挂载卡片
              </label>
              <Select
                id="knowledge-context-select"
                aria-label="选择知识图谱卡片"
                className={styles.pickerSelect}
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="选择一张核心数分知识卡片…"
                value={selectedKnowledgeId}
                options={knowledgeSelectOptions}
                onChange={(val) => handleSelectKnowledge(val)}
              />
            </div>

            <div className={styles.pickerField}>
              <label
                htmlFor="mistake-context-select"
                className={styles.pickerLabel}
              >
                从错题本挂载记录
              </label>
              {mistakeItems.length > 0 ? (
                <Select
                  id="mistake-context-select"
                  aria-label="选择错题记录"
                  className={styles.pickerSelect}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="选择一道待攻克或复习中的错题…"
                  value={selectedMistakeId}
                  options={mistakeSelectOptions}
                  onChange={(val) => handleSelectMistake(val)}
                />
              ) : (
                <p className={styles.emptyMistakeNote}>
                  当前本地错题本暂无记录，可前往{' '}
                  <Link to="/mistakes">错题本模块</Link> 录入或载入典型示例。
                </p>
              )}
            </div>
          </section>

          {attachedContext && (
            <section
              className={styles.attachedCard}
              aria-label="当前已挂载上下文"
            >
              <div className={styles.attachedTop}>
                <Tag color="green">
                  {CONTEXT_KIND_LABELS[attachedContext.kind]}
                </Tag>
                <Button
                  size="small"
                  type="text"
                  onClick={() => {
                    setAttachedContext(undefined);
                    setStatusNote('已取消挂载当前上下文。');
                    persistSession(messages, undefined);
                  }}
                >
                  取消挂载
                </Button>
              </div>
              <h3 className={styles.attachedTitle}>{attachedContext.title}</h3>
              <p className={styles.attachedSummary}>
                {attachedContext.summary}
              </p>
              {attachedContext.formula && (
                <div className={styles.contextFormula}>
                  <Formula value={attachedContext.formula} />
                </div>
              )}
              {contextBackLink && (
                <div className={styles.attachedFooter}>
                  <Link to={contextBackLink.to} className={styles.jumpLink}>
                    <LinkOutlined /> {contextBackLink.label}
                  </Link>
                </div>
              )}
            </section>
          )}

          <section className={styles.glassCard}>
            <div className={styles.cardTitleRow}>
              <h2>数分审校护栏</h2>
            </div>
            <ul className={styles.guardrailList}>
              <li>
                <strong>条件先行：</strong>
                优先追问定义域、去心邻域与定理充分条件（如洛必达、牛顿-莱布尼茨无瑕点条件）。
              </li>
              <li>
                <strong>拒绝跳步代写：</strong>
                每次拆解 1–2 个关键卡点，引导你自己完成严格推导。
              </li>
              <li>
                <strong>直观 ≠ 证明：</strong>
                函数采样曲线、曲面网格与三维体素黎曼和仅提供几何直观或反例线索，不能替代{' '}
                <Formula value="\varepsilon\text{-}\delta" /> 证明。
              </li>
            </ul>
          </section>
        </aside>

        <section className={styles.chatPanel} aria-label="苏格拉底对话区">
          <div className={styles.templateSection}>
            <div className={styles.templateHeader}>
              <span>数分启发式切入芯片</span>
              <small>点击填入提问框，可继续补充你的推导步骤</small>
            </div>
            <div className={styles.templateGrid}>
              {GUIDED_PROMPTS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className={styles.templateBtn}
                  onClick={() => handleApplyPrompt(item.prompt)}
                >
                  <strong>{item.label}</strong>
                </button>
              ))}
            </div>
          </div>

          {chatError && (
            <Alert type="error" showIcon title={chatError} role="alert" />
          )}

          {statusNote && !chatError && (
            <Alert type="info" showIcon title={statusNote} />
          )}

          <div
            ref={streamRef}
            className={styles.messageStream}
            aria-label="对话消息记录"
          >
            {messages.length === 0 && !isSending ? (
              <div className={styles.emptyChat}>
                <span className={styles.emptyChatBadge}>
                  苏格拉底式对话 · 条件核查优先
                </span>
                <h3>写下你卡住的那一步推导</h3>
                <p>
                  你可以先从左侧挂载一张知识卡片或错题记录，再点击上方启发芯片或直接输入你的尝试过程。助教会先帮你检查隐藏前提，而不是直接替你给出答案。
                </p>
              </div>
            ) : (
              messages.map((msg) => (
                <article
                  key={msg.id}
                  className={`${styles.messageCard} ${
                    msg.role === 'user' ? styles.userCard : styles.assistantCard
                  }`}
                >
                  <div className={styles.messageMeta}>
                    <span className={styles.roleLabel}>
                      {msg.role === 'user' ? (
                        <>
                          <UserOutlined /> 你的推导
                        </>
                      ) : (
                        <>
                          <RobotOutlined /> AI 助教
                        </>
                      )}
                      {msg.model && (
                        <span className={styles.modelBadge}>{msg.model}</span>
                      )}
                    </span>
                    <time dateTime={msg.createdAt}>
                      {formatMessageTime(msg.createdAt)}
                    </time>
                  </div>
                  <RichMathContent content={msg.content} />
                </article>
              ))
            )}

            {isSending && (
              <article
                className={`${styles.messageCard} ${styles.assistantCard} ${styles.pendingCard}`}
                aria-live="polite"
              >
                <div className={styles.messageMeta}>
                  <span className={styles.roleLabel}>
                    <RobotOutlined /> AI 助教
                  </span>
                  <span>正在推演启发式追问…</span>
                </div>
                <p className={styles.richParagraph}>
                  正在向服务端安全代理请求回复，可随时点击下方「停止请求」中止等待。
                </p>
              </article>
            )}
          </div>

          <form className={styles.composerForm} onSubmit={handleSubmit}>
            <div className={styles.composerLabelRow}>
              <label
                htmlFor="assistant-prompt-input"
                className={styles.composerLabel}
              >
                输入你的问题或当前推导步骤
              </label>
              <span className={styles.composerShortcut}>
                Ctrl / ⌘ + Enter 发送
              </span>
            </div>
            <Input.TextArea
              id="assistant-prompt-input"
              ref={(node) => {
                inputRef.current = node?.resizableTextArea?.textArea ?? null;
              }}
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="例如：我在求 lim(x→0) (tan x - sin x)/x³ 时直接把 tan x 和 sin x 换成 x 得到 0，请问哪一步的前提不成立？"
              autoSize={{ minRows: 3, maxRows: 6 }}
              maxLength={4000}
              disabled={isSending}
            />
            <div className={styles.composerFooter}>
              <p className={styles.privacyText}>{privacyNotice}</p>
              <div className={styles.composerActions}>
                {isSending && (
                  <Button
                    danger
                    icon={<StopOutlined />}
                    onClick={handleCancelRequest}
                  >
                    停止请求
                  </Button>
                )}
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<SendOutlined />}
                  loading={isSending}
                  disabled={!inputValue.trim() || isSending}
                >
                  发送提问
                </Button>
              </div>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}
