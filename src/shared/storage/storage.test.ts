import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createStorage } from './index';

const store = createStorage('test', z.object({ title: z.string() }));
beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('版本化本地存储', () => {
  it('缺少数据时使用默认值', () => {
    expect(store.read({ title: '默认' })).toEqual({
      ok: true,
      data: { title: '默认' },
    });
  });
  it('可保存、读取并清除数据', () => {
    expect(store.write({ title: '测试' }).ok).toBe(true);
    expect(
      JSON.parse(localStorage.getItem('math-workbench:test')!).schemaVersion,
    ).toBe(1);
    expect(store.read({ title: '' })).toEqual({
      ok: true,
      data: { title: '测试' },
    });
    expect(store.clear().ok).toBe(true);
    expect(localStorage.getItem('math-workbench:test')).toBeNull();
  });
  it.each([
    'not json',
    '{"schemaVersion":2,"data":{"title":"x"}}',
    '{"schemaVersion":1,"data":{"title":3}}',
  ])('损坏或不兼容的数据不会静默覆盖', (raw) => {
    localStorage.setItem('math-workbench:test', raw);
    expect(store.read({ title: '' }).ok).toBe(false);
    expect(localStorage.getItem('math-workbench:test')).toBe(raw);
  });
  it('保存格式错误时返回错误', () => {
    expect(store.write({ title: 3 } as unknown as { title: string }).ok).toBe(
      false,
    );
  });
  it('存储不可用时给出错误结果', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(store.write({ title: 'x' }).ok).toBe(false);
  });
});

describe('原始数据备份（readRaw）', () => {
  it('无数据时返回 null', () => {
    expect(store.readRaw()).toEqual({ ok: true, data: null });
  });
  it('损坏字符串与未知版本原样保留，不解析不校验', () => {
    for (const raw of [
      'not json',
      '{"schemaVersion":2,"data":{"title":"x"}}',
      '{"schemaVersion":1,"data":{"title":3}}',
    ]) {
      localStorage.setItem('math-workbench:test', raw);
      expect(store.readRaw()).toEqual({ ok: true, data: raw });
      expect(localStorage.getItem('math-workbench:test')).toBe(raw);
    }
  });
  it('存储不可用时给出错误结果', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(store.readRaw().ok).toBe(false);
  });
});
