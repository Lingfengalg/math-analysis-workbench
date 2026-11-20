import { describe, expect, it } from 'vitest';
import {
  addHistoryEntry,
  EMPTY_PLOT_HISTORY,
  historyEntryLabel,
  PLOT_HISTORY_LIMIT,
  plotHistorySchema,
} from './history';
import type { PlotRequest } from '@/shared/contracts';

const request = (expression: string, xMin = -5, xMax = 5): PlotRequest => ({
  expression,
  xMin,
  xMax,
});

describe('最近绘制记录（#65）', () => {
  it('最新的在最前面', () => {
    const first = addHistoryEntry(EMPTY_PLOT_HISTORY, request('x^2'), 1);
    const second = addHistoryEntry(first, request('abs(x)'), 2);
    expect(second.entries.map((entry) => entry.request.expression)).toEqual([
      'abs(x)',
      'x^2',
    ]);
  });

  it('相邻重复（表达式与区间都相同）不新增条目，只更新时间', () => {
    const first = addHistoryEntry(EMPTY_PLOT_HISTORY, request('x^2'), 1);
    const again = addHistoryEntry(first, request('x^2'), 2);
    expect(again.entries).toHaveLength(1);
    expect(again.entries[0].drawnAt).toBe(2);
  });

  it('区间不同视为不同记录', () => {
    const first = addHistoryEntry(EMPTY_PLOT_HISTORY, request('x^2'), 1);
    const second = addHistoryEntry(first, request('x^2', 0, 10), 2);
    expect(second.entries).toHaveLength(2);
  });

  it(`最多保留 ${PLOT_HISTORY_LIMIT} 条，超出丢弃最旧`, () => {
    let history = EMPTY_PLOT_HISTORY;
    for (let index = 0; index < PLOT_HISTORY_LIMIT + 3; index += 1) {
      history = addHistoryEntry(history, request(`x^${index}`), index);
    }
    expect(history.entries).toHaveLength(PLOT_HISTORY_LIMIT);
    expect(history.entries[0].request.expression).toBe(
      `x^${PLOT_HISTORY_LIMIT + 2}`,
    );
  });

  it('展示标签包含表达式与区间', () => {
    expect(
      historyEntryLabel({ request: request('sin(x)', -1, 1), drawnAt: 1 }),
    ).toBe('sin(x) · [-1, 1]');
  });

  it('损坏数据不会通过 schema 校验（调用方据此保留原数据）', () => {
    expect(
      plotHistorySchema.safeParse({ entries: [{ request: {}, drawnAt: 'x' }] })
        .success,
    ).toBe(false);
    expect(plotHistorySchema.safeParse({ entries: [null] }).success).toBe(
      false,
    );
  });
});
