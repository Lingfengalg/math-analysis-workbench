import type { ComponentType } from 'react';

/** 导航展示契约，不包含路由实现或功能模块依赖。 */
export interface NavigationModule {
  id: string;
  path: `/${string}`;
  title: string;
  caption: string;
  status: 'available' | 'planned';
  Icon: ComponentType;
}
