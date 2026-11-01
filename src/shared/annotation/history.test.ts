import { describe, expect, it } from 'vitest';
import { createHistory } from './history';

describe('annotation history', () => {
  it('初始状态不可撤销', () => {
    const history = createHistory<number[]>();
    history.reset([]);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
    expect(history.undo()).toBeNull();
  });

  it('撤销与重做按顺序回放', () => {
    const history = createHistory<number[]>();
    history.reset([1]);
    history.record([1, 2]);
    history.record([1, 2, 3]);

    expect(history.undo()).toEqual([1, 2]);
    expect(history.undo()).toEqual([1]);
    expect(history.canUndo()).toBe(false);

    expect(history.redo()).toEqual([1, 2]);
    expect(history.redo()).toEqual([1, 2, 3]);
    expect(history.canRedo()).toBe(false);
  });

  it('新操作清空重做栈', () => {
    const history = createHistory<number[]>();
    history.reset([]);
    history.record([1]);
    history.undo();
    expect(history.canRedo()).toBe(true);

    history.record([2]);
    expect(history.canRedo()).toBe(false);
    expect(history.undo()).toEqual([]);
  });

  it('超过上限丢弃最早历史', () => {
    const history = createHistory<number[]>(3);
    history.reset([]);
    history.record([1]);
    history.record([2]);
    history.record([3]);

    expect(history.undo()).toEqual([2]);
    expect(history.undo()).toEqual([1]);
    expect(history.canUndo()).toBe(false);
  });
});
