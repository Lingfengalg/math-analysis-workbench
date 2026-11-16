export type ModuleStatus = 'available' | 'planned';

export interface ModuleEntry {
  id: 'dashboard' | 'knowledge' | 'plotting' | 'mistakes' | 'assistant';
  path: string;
  title: string;
  caption: string;
  status: ModuleStatus;
}

export const modules: readonly ModuleEntry[] = [
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
    caption: '三维曲面与重积分仿真',
    status: 'available',
  },
  {
    id: 'mistakes',
    path: '/mistakes',
    title: '错题本',
    caption: '记录错误，整理思路',
    status: 'available',
  },
  {
    id: 'assistant',
    path: '/assistant',
    title: 'AI 助教',
    caption: '苏格拉底式条件引导',
    status: 'available',
  },
];
export type ModuleId = ModuleEntry['id'];
