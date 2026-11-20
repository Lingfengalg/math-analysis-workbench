import { z } from 'zod';
import { plotRequestSchema, type PlotRequest } from '@/shared/contracts';
import { createStorage } from '@/shared/storage';

/** 最近绘制记录上限；相邻重复（表达式与区间都相同）不重复记录。 */
export const PLOT_HISTORY_LIMIT = 10;

export const plotHistoryEntrySchema = z
  .object({
    request: plotRequestSchema,
    drawnAt: z.number().int().nonnegative().max(8_640_000_000_000_000),
  })
  .strict();

export type PlotHistoryEntry = z.infer<typeof plotHistoryEntrySchema>;

export const plotHistorySchema = z
  .object({
    entries: z.array(plotHistoryEntrySchema).max(PLOT_HISTORY_LIMIT),
  })
  .strict();

export type PlotHistory = z.infer<typeof plotHistorySchema>;

export const EMPTY_PLOT_HISTORY: PlotHistory = { entries: [] };

export const plotHistoryStorage = createStorage(
  'plot-history',
  plotHistorySchema,
);

function sameRequest(left: PlotRequest, right: PlotRequest): boolean {
  return (
    left.expression === right.expression &&
    left.xMin === right.xMin &&
    left.xMax === right.xMax
  );
}

/**
 * 追加一条绘制记录：最新的在前；与当前首条完全相同时不重复记录。
 * 只保留最近 PLOT_HISTORY_LIMIT 条。
 */
export function addHistoryEntry(
  history: PlotHistory,
  request: PlotRequest,
  now: number = Date.now(),
): PlotHistory {
  const first = history.entries[0];
  if (first && sameRequest(first.request, request)) {
    // 相同请求只更新时间，避免历史被同一个表达式挤满
    return {
      entries: [{ request, drawnAt: now }, ...history.entries.slice(1)],
    };
  }
  return {
    entries: [{ request, drawnAt: now }, ...history.entries].slice(
      0,
      PLOT_HISTORY_LIMIT,
    ),
  };
}

/** 历史条目的可读标题，例如「x^2 · [-5, 5]」。 */
export function historyEntryLabel(entry: PlotHistoryEntry): string {
  return `${entry.request.expression} · [${entry.request.xMin}, ${entry.request.xMax}]`;
}
