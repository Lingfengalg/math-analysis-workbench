import { ModulePlaceholder } from '@/shared/ui/ModulePlaceholder';

export default function AssistantPage() {
  return (
    <ModulePlaceholder
      title="AI 助教"
      description="好的引导不是替你回答，而是帮助你理解下一步。"
      directory="src/features/assistant/"
      tasks={[
        '与团队先确定后端代理接口、数据发送范围与费用配置。',
        '服务端保存密钥，禁止将密钥放入 VITE_* 或浏览器存储。',
        '实现消息状态、取消、错误反馈和未配置提示。',
        '记录真实测试对话与人工核验，不能用模拟回答冒充模型服务。',
      ]}
    />
  );
}
