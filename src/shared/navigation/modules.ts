export const modules = [
  {
    id: 'dashboard',
    path: '/',
    title: '工作台概览',
    caption: '从一个问题开始',
    status: 'available',
  },
  {
    id: 'knowledge',
    path: '/knowledge',
    title: '知识导航',
    caption: '定义、条件与反例',
    status: 'available',
  },
  {
    id: 'plotting',
    path: '/plotting',
    title: '绘图计算',
    caption: '让抽象函数可视化',
    status: 'available',
  },
  {
    id: 'mistakes',
    path: '/mistakes',
    title: '错题本',
    caption: '记录错误，整理思路',
    status: 'planned',
  },
  {
    id: 'assistant',
    path: '/assistant',
    title: 'AI 助教',
    caption: '循序渐进的学习引导',
    status: 'planned',
  },
] as const;
export type ModuleId = (typeof modules)[number]['id'];
