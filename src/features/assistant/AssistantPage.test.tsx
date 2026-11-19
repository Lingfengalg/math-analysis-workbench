import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { starterMistakes } from '@/content/mistakes/starter';
import { createAssistantLink } from '@/shared/navigation/assistant-link';
import AssistantPage from './AssistantPage';

const SESSION_STORAGE_KEY = 'math-workbench:assistant-session';
const MISTAKES_STORAGE_KEY = 'math-workbench:mistakes';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver =
    ResizeObserverMock as unknown as typeof ResizeObserver;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderAssistant(initialEntry = '/assistant') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AssistantPage />
    </MemoryRouter>,
  );
}

describe('AI 助教模块 AssistantPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('代理未配置 API Key 时展示诚实诊断指引、启动命令与隐私声明，且不伪造回复', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        configured: false,
        provider: 'openai',
        model: 'gpt-4o-mini',
        privacyNotice:
          '仅向已配置的模型服务发送当前对话与主动挂载的数学卡片/错题摘要，不采集个人身份信息，密钥仅保存在服务端环境变量。',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderAssistant();

    expect(
      await screen.findByText(/未配置服务端密钥 · openai/),
    ).toBeInTheDocument();
    const panel = screen.getByRole('region', { name: '服务端代理配置指引' });
    expect(within(panel).getByText(/503 UNCONFIGURED/)).toBeInTheDocument();
    expect(
      within(panel).getByText(/AI_API_KEY=your_api_key npm run dev:proxy/),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText(/仅向已配置的模型服务发送当前对话/),
    ).toBeInTheDocument();
    expect(screen.queryByText('AI 助教：')).not.toBeInTheDocument();
  });

  it('代理服务离线时展示离线状态，并在发送提问失败后诚实提示错误而不生成假消息', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', fetchMock);

    renderAssistant();

    expect(await screen.findByText('代理未连接（离线）')).toBeInTheDocument();
    expect(
      screen.getByText(/未能连接到本地 AI 代理服务（127\.0\.0\.1:8787）/),
    ).toBeInTheDocument();

    const textbox = screen.getByLabelText('输入你的问题或当前推导步骤');
    await user.type(textbox, '为什么连续不一定可导？');
    await user.click(screen.getByRole('button', { name: /发送提问/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '无法连接到 AI 代理服务',
    );
    expect(screen.getByText('为什么连续不一定可导？')).toBeInTheDocument();
    expect(screen.queryByText('AI 助教')).not.toBeInTheDocument();
  });

  it('支持 URL 上下文挂载与预填、上下文选择器切换知识卡片/错题记录，并妥善提示损坏的会话存储', async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      MISTAKES_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, data: { items: starterMistakes } }),
    );
    localStorage.setItem(SESSION_STORAGE_KEY, '{corrupt-json');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          configured: true,
          provider: 'deepseek',
          model: 'deepseek-chat',
          privacyNotice: '仅发送当前对话与挂载摘要。',
        }),
      ),
    );

    const entry = createAssistantLink(
      {
        kind: 'knowledge',
        id: 'derivative-lhopital',
        title: '洛必达法则：充分条件而非充要条件',
        summary: '导数比极限不存在时不能反推原极限不存在。',
        formula: "\\lim \\frac{f'(x)}{g'(x)}=L",
      },
      '请追问我如何先核查洛必达的三条前提？',
    );
    renderAssistant(entry);

    expect(await screen.findByText(/会话记录读取异常/)).toBeInTheDocument();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBe('{corrupt-json');

    const attached = screen.getByRole('region', { name: '当前已挂载上下文' });
    expect(
      within(attached).getByText('洛必达法则：充分条件而非充要条件'),
    ).toBeInTheDocument();
    expect(
      within(attached).getByRole('link', { name: /查看原知识卡片/ }),
    ).toHaveAttribute(
      'href',
      expect.stringContaining('card=derivative-lhopital'),
    );
    expect(screen.getByLabelText('输入你的问题或当前推导步骤')).toHaveValue(
      '请追问我如何先核查洛必达的三条前提？',
    );

    // 清空对话后解除损坏状态，再从错题本选择器挂载错题
    await user.click(screen.getByRole('button', { name: /清空对话/ }));
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();

    const mistakeSelect = screen.getByRole('combobox', {
      name: '选择错题记录',
    });
    await user.click(mistakeSelect);
    await user.click(
      await screen.findByTitle(
        '[定理条件未满足强用] 误用洛必达法则判定振荡型极限不存在',
      ),
    );

    const updatedAttached = screen.getByRole('region', {
      name: '当前已挂载上下文',
    });
    expect(
      within(updatedAttached).getByText('误用洛必达法则判定振荡型极限不存在'),
    ).toBeInTheDocument();
    expect(
      within(updatedAttached).getByRole('link', { name: /返回错题本/ }),
    ).toHaveAttribute('href', '/mistakes');

    const persisted = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!);
    expect(persisted.data.attachedContext.id).toBe(
      'mistake-lhopital-oscillation',
    );
  });

  it('支持 4 个数分引导芯片填入问题、携带上下文请求代理，并用 KaTeX 安全渲染行内与块级公式（无原始 HTML 注入）', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/ai/health') {
          return jsonResponse({
            configured: true,
            provider: 'deepseek',
            model: 'deepseek-chat',
            privacyNotice: '仅发送当前对话与挂载摘要。',
          });
        }
        const parsedBody = JSON.parse(String(init?.body ?? '{}'));
        expect(parsedBody.context?.id).toBe('derivative-absolute');
        expect(parsedBody.messages).toHaveLength(1);
        return jsonResponse({
          ok: true,
          reply:
            "先核查定义域与分界点：当 $x \\to 0$ 时，请分别计算左导数与右导数：\n\n$$f'_-(0) = -1,\\quad f'_+(0) = 1$$\n\n注意 <script>window.__xss=1</script> 图像直观不能替代严格证明。",
          model: 'deepseek-chat',
        });
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    renderAssistant();
    await screen.findByText(/代理已就绪 · deepseek \(deepseek-chat\)/);

    // 验证 4 个引导芯片存在
    expect(
      screen.getByRole('button', { name: '核查洛必达与等价替换前提' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '连续与可导的边界反例' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '二重积分极坐标与曲边定限' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '三重积分截面法与数值直观边界' }),
    ).toBeInTheDocument();

    // 先从知识图谱下拉框选择“可导与连续：逆命题不成立”
    const knowledgeSelect = screen.getByRole('combobox', {
      name: '选择知识图谱卡片',
    });
    await user.click(knowledgeSelect);
    await user.click(
      await screen.findByTitle('[导数与微分] 可导与连续：逆命题不成立'),
    );

    // 点击芯片填入提问
    await user.click(
      screen.getByRole('button', { name: '连续与可导的边界反例' }),
    );
    const textbox = screen.getByLabelText('输入你的问题或当前推导步骤');
    expect(textbox).toHaveValue(
      '为什么函数在某一点连续却不一定可导？请结合左右导数定义与经典反例一步步追问我。',
    );

    await user.click(screen.getByRole('button', { name: /发送提问/ }));

    expect(await screen.findByText(/先核查定义域与分界点/)).toBeInTheDocument();
    expect(document.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(
      2,
    );
    expect(document.querySelector('script')).toBeNull();
    expect(
      screen.getByText(/<script>window\.__xss=1<\/script>/),
    ).toBeInTheDocument();
  });

  it('支持请求过程中通过「停止请求」按钮触发 AbortController 中止等待', async () => {
    const user = userEvent.setup();
    let capturedSignal: AbortSignal | undefined;

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/ai/health') {
        return Promise.resolve(
          jsonResponse({
            configured: true,
            provider: 'openai',
            model: 'gpt-4o-mini',
            privacyNotice: '隐私说明',
          }),
        );
      }
      capturedSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAssistant();
    await screen.findByText(/代理已就绪/);

    const textbox = screen.getByLabelText('输入你的问题或当前推导步骤');
    await user.type(textbox, '请引导我检查无穷区间反常积分收敛条件');
    await user.click(screen.getByRole('button', { name: /发送提问/ }));

    const stopButton = await screen.findByRole('button', { name: /停止请求/ });
    expect(stopButton).toBeInTheDocument();

    await user.click(stopButton);

    await waitFor(() => {
      expect(capturedSignal?.aborted).toBe(true);
    });
    expect(await screen.findByText('已停止本次请求。')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /停止请求/ }),
    ).not.toBeInTheDocument();
  });

  it('持久化会话至 assistant-session，支持导出 JSON 与清空对话', async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        data: {
          messages: [
            {
              id: 'user-1',
              role: 'user',
              content: '请问夹逼准则两个端点的极限必须相等吗？',
              createdAt: '2026-11-16T10:00:00.000Z',
            },
            {
              id: 'assistant-1',
              role: 'assistant',
              content: '你可以先试举一个左端趋于 $0$ 而右端趋于 $1$ 的数列。',
              createdAt: '2026-11-16T10:00:05.000Z',
              model: 'gpt-4o-mini',
            },
          ],
        },
      }),
    );

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          configured: true,
          provider: 'openai',
          model: 'gpt-4o-mini',
          privacyNotice: '隐私说明',
        }),
      ),
    );

    const createObjectUrlSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:mock-session');
    const revokeObjectUrlSpy = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => {});
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    renderAssistant();

    expect(
      await screen.findByText('请问夹逼准则两个端点的极限必须相等吗？'),
    ).toBeInTheDocument();
    expect(screen.getByText(/你可以先试举一个左端趋于/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /导出 JSON/ }));
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(anchorClickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:mock-session');
    expect(
      screen.getByText('已导出当前对话与上下文 JSON 文件。'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /清空对话/ }));
    expect(screen.getByText('写下你卡住的那一步推导')).toBeInTheDocument();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('支持取消挂载上下文并正确处理服务端返回 503 UNCONFIGURED', async () => {
    const user = userEvent.setup();
    let healthCallCount = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/ai/health') {
        healthCallCount += 1;
        return jsonResponse({
          configured: healthCallCount === 1,
          provider: 'openai',
          model: 'gpt-4o-mini',
          privacyNotice: '隐私说明',
        });
      }
      return jsonResponse(
        {
          ok: false,
          code: 'UNCONFIGURED',
          error:
            '服务端尚未配置 AI_API_KEY 环境变量，请按页面指引启动代理后再试。',
        },
        503,
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const entry = createAssistantLink({
      kind: 'plotting',
      title: '三维曲顶柱体积分实验',
      summary: 'f(x, y) = x + 2y 在 X-型曲边域上的积分仿真。',
      formula: '\\int_0^1 dx \\int_{x^2}^{\\sqrt{x}} (x+2y) dy',
    });
    renderAssistant(entry);

    await screen.findByText(/代理已就绪/);
    const attached = screen.getByRole('region', { name: '当前已挂载上下文' });
    expect(
      within(attached).getByRole('link', { name: /返回仿真实验室/ }),
    ).toHaveAttribute('href', '/plotting');

    await user.click(
      within(attached).getByRole('button', { name: '取消挂载' }),
    );
    expect(
      screen.queryByRole('region', { name: '当前已挂载上下文' }),
    ).not.toBeInTheDocument();

    const textbox = screen.getByLabelText('输入你的问题或当前推导步骤');
    await user.type(
      textbox,
      '为什么积分限写反了符号会变负？{Control>}{Enter}{/Control}',
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '服务端尚未配置 AI_API_KEY 环境变量',
    );
    expect(
      await screen.findByText(/未配置服务端密钥 · openai/),
    ).toBeInTheDocument();
  });
});
