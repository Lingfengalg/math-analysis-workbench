import { createElement, lazy, type ComponentType } from 'react';
import {
  AppstoreOutlined,
  BookOutlined,
  EditOutlined,
  LineChartOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import type { NavigationModule } from '@/shared/navigation/modules';

const DashboardPage = lazy(() => import('@/features/dashboard'));

/** 应用层组合模块：路由组件只在这里与共享的导航展示信息相遇。 */
export interface RegisteredModule extends NavigationModule {
  Page: ComponentType;
  showOnDashboard: boolean;
}

/** 在启动和测试时拒绝可能导致路由或导航漂移的重复配置。 */
export function defineModuleRegistry<
  const T extends readonly RegisteredModule[],
>(entries: T): T {
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const entry of entries) {
    if (!/^[a-z][a-z0-9-]*$/.test(entry.id))
      throw new Error(`无效的模块 id：${entry.id}`);
    if (!/^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/.test(entry.path))
      throw new Error(`无效的模块路径：${entry.path}`);
    if (ids.has(entry.id)) throw new Error(`重复的模块 id：${entry.id}`);
    if (paths.has(entry.path)) throw new Error(`重复的模块路径：${entry.path}`);
    ids.add(entry.id);
    paths.add(entry.path);
  }
  return entries;
}

function DashboardRoute() {
  return createElement(DashboardPage, { modules: dashboardModules });
}

export const modules = defineModuleRegistry([
  {
    id: 'dashboard',
    path: '/',
    title: '工作台概览',
    caption: '从一个问题开始',
    status: 'available',
    Icon: AppstoreOutlined,
    Page: DashboardRoute,
    showOnDashboard: false,
  },
  {
    id: 'knowledge',
    path: '/knowledge',
    title: '知识导航',
    caption: '定义、条件与反例',
    status: 'available',
    Icon: BookOutlined,
    Page: lazy(() => import('@/features/knowledge')),
    showOnDashboard: true,
  },
  {
    id: 'plotting',
    path: '/plotting',
    title: '绘图计算',
    caption: '让抽象函数可视化',
    status: 'available',
    Icon: LineChartOutlined,
    Page: lazy(() => import('@/features/plotting')),
    showOnDashboard: true,
  },
  {
    id: 'mistakes',
    path: '/mistakes',
    title: '错题本',
    caption: '记录错误，整理思路',
    status: 'available',
    Icon: EditOutlined,
    Page: lazy(() => import('@/features/mistakes')),
    showOnDashboard: true,
  },
  {
    id: 'assistant',
    path: '/assistant',
    title: 'AI 助教',
    caption: '循序渐进的学习引导',
    status: 'planned',
    Icon: RobotOutlined,
    Page: lazy(() => import('@/features/assistant')),
    showOnDashboard: true,
  },
] as const satisfies readonly RegisteredModule[]);

// 不向 feature 暴露路由组件，避免 feature 反向依赖 app。
const dashboardModules: readonly NavigationModule[] = modules
  .filter((entry) => entry.showOnDashboard)
  .map(({ id, path, title, caption, status, Icon }) => ({
    id,
    path,
    title,
    caption,
    status,
    Icon,
  }));
