import { ModulePlaceholder } from '@/shared/ui/ModulePlaceholder';

export default function MistakesPage() {
  return (
    <ModulePlaceholder
      title="错题本"
      description="把一次错误，变成下一次理解的起点。"
      directory="src/features/mistakes/"
      tasks={[
        '先在 shared/contracts 中定义错题结构与 Zod 校验。',
        '实现新增、编辑、删除，记录错误原因和订正。',
        '复用 shared/storage，增加版本校验与 JSON 导入导出。',
        '为损坏数据、空状态和存储失败添加测试。',
      ]}
    />
  );
}
