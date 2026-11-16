import { ModulePlaceholder } from '@/shared/ui/ModulePlaceholder';

export default function AssistantPage() {
  return (
    <ModulePlaceholder
      title="AI 助教"
      description="好的引导不是替你写出答案，而是结合你当前的知识卡片与错题盲区，启发你独立核查下一步定理条件。"
      directory="src/features/assistant/"
      tasks={[
        '定义受控上下文注入协议：仅在用户授权时附带当前知识卡片稳定 ID（定义与适用前提）或错题本摘要（错因标签、当时错误思路与反例表达式），不上传无关浏览器缓存。',
        '严格落实服务端密钥托管与网关隔离：模型 API Key 仅存储在后端服务环境变量中，严禁写入 VITE_*、前端构建产物或 localStorage。',
        '实现真实流式响应状态、请求取消（AbortController）、配额限流与未配置网关时的诚实降级提示，严禁用预置文本冒充模型推理结果。',
        '建立工科数分审校护栏：引导用户先核查定义域、收敛性与可导充要条件，明确区分数值图像直观与严格分析证明，并保留人工核验记录。',
      ]}
    />
  );
}
