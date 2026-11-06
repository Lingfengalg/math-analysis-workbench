import { describe, expect, it } from 'vitest';
import {
  defineModuleRegistry,
  modules,
  type RegisteredModule,
} from './moduleRegistry';

const component = () => null;
const entry: RegisteredModule = {
  id: 'first',
  path: '/first',
  title: 'First',
  caption: 'Caption',
  status: 'available',
  Icon: component,
  Page: component,
  showOnDashboard: true,
};

describe('模块注册表', () => {
  it('实际条目都有可用的路由组件、图标和展示信息', () => {
    expect(modules.map((module) => module.id)).toEqual([
      'dashboard',
      'knowledge',
      'plotting',
      'mistakes',
      'assistant',
    ]);
    expect(modules.filter((module) => module.showOnDashboard)).toHaveLength(4);
    for (const module of modules) {
      expect(module.title).not.toBe('');
      expect(module.caption).not.toBe('');
      expect(module.Icon).toBeDefined();
      expect(module.Page).toBeDefined();
    }
    expect(modules.find((module) => module.id === 'assistant')?.status).toBe(
      'planned',
    );
    expect(() => defineModuleRegistry(modules)).not.toThrow();
  });

  it('拒绝重复 id 和重复路径', () => {
    expect(() =>
      defineModuleRegistry([entry, { ...entry, path: '/second' }]),
    ).toThrow('重复的模块 id');
    expect(() =>
      defineModuleRegistry([entry, { ...entry, id: 'second' }]),
    ).toThrow('重复的模块路径');
  });

  it('拒绝无效 id 与不规范路由路径', () => {
    expect(() => defineModuleRegistry([{ ...entry, id: 'Bad Id' }])).toThrow(
      '无效的模块 id',
    );
    expect(() => defineModuleRegistry([{ ...entry, path: '/foo/' }])).toThrow(
      '无效的模块路径',
    );
    expect(() =>
      defineModuleRegistry([{ ...entry, path: '/first?x=1' }]),
    ).toThrow('无效的模块路径');
  });
});
