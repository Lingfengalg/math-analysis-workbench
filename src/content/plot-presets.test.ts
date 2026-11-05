import { describe, expect, it } from 'vitest';
import { plotPresetSchema, plotPresets } from './plot-presets';
import { plotRequestSchema } from '@/shared/contracts';
import { compileExpression } from '@/shared/math/sample';

describe('绘图预置内容契约', () => {
  it('预置 id 唯一，内容符合结构约定', () => {
    expect(new Set(plotPresets.map((preset) => preset.id)).size).toBe(
      plotPresets.length,
    );
    plotPresets.forEach((preset) =>
      expect(plotPresetSchema.safeParse(preset).success).toBe(true),
    );
  });
  it('预置表达式与区间满足绘图请求契约', () => {
    for (const preset of plotPresets) {
      expect(
        plotRequestSchema.safeParse({
          expression: preset.expression,
          xMin: preset.xMin,
          xMax: preset.xMax,
        }).success,
      ).toBe(true);
    }
  });
  it('预置表达式符合白名单且能编译', () => {
    for (const preset of plotPresets)
      expect(() => compileExpression(preset.expression)).not.toThrow();
  });
});
