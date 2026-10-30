import { describe, expect, it, vi } from 'vitest';
import {
  ANCHOR_ATTRIBUTE,
  anchorKeyOf,
  findAnchorElement,
  frameFromElement,
  hostFrame,
  queryAnchor,
  toFramePoint,
} from './anchoring';

function rect(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

describe('annotation anchoring', () => {
  it('从事件目标向上找到最近的锚定块', () => {
    const card = document.createElement('div');
    card.setAttribute(ANCHOR_ATTRIBUTE, 'knowledge:limit');
    const child = document.createElement('span');
    card.appendChild(child);
    document.body.appendChild(card);

    expect(findAnchorElement(child)).toBe(card);
    expect(anchorKeyOf(findAnchorElement(child))).toBe('knowledge:limit');
    expect(findAnchorElement(document.body)).toBeNull();
    expect(anchorKeyOf(null)).toBeNull();
  });

  it('空白 key 视为未锚定', () => {
    const element = document.createElement('div');
    element.setAttribute(ANCHOR_ATTRIBUTE, '   ');
    expect(anchorKeyOf(element)).toBeNull();
  });

  it('按 key 查找锚定块，并转义引号', () => {
    const host = document.createElement('div');
    const target = document.createElement('section');
    target.setAttribute(ANCHOR_ATTRIBUTE, 'plotting:chart');
    host.appendChild(target);

    expect(queryAnchor(host, 'plotting:chart')).toBe(target);
    expect(queryAnchor(host, 'missing')).toBeNull();
    // 含引号的 key 不应破坏选择器
    expect(() => queryAnchor(host, 'a"b')).not.toThrow();
  });

  it('锚定块坐标相对画布计算', () => {
    const canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = vi.fn(() => rect(0, 0, 800, 600));
    const block = document.createElement('div');
    block.getBoundingClientRect = vi.fn(() => rect(40, 120, 300, 200));
    document.body.appendChild(block);

    expect(frameFromElement(block, canvas)).toEqual({
      left: 40,
      top: 120,
      width: 300,
      height: 200,
    });
  });

  it('不可见或已移除的锚定块返回 null', () => {
    const canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = vi.fn(() => rect(0, 0, 800, 600));

    const detached = document.createElement('div');
    detached.getBoundingClientRect = vi.fn(() => rect(0, 0, 10, 10));
    expect(frameFromElement(detached, canvas)).toBeNull();

    const hidden = document.createElement('div');
    document.body.appendChild(hidden);
    hidden.getBoundingClientRect = vi.fn(() => rect(0, 0, 0, 0));
    expect(frameFromElement(hidden, canvas)).toBeNull();
  });

  it('像素坐标换算为块内归一化坐标', () => {
    const frame = { left: 40, top: 120, width: 300, height: 200 };
    expect(toFramePoint({ x: 40, y: 120 }, frame)).toEqual({ x: 0, y: 0 });
    expect(toFramePoint({ x: 190, y: 220 }, frame)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('零尺寸坐标系不会产生 Infinity', () => {
    const point = toFramePoint({ x: 10, y: 10 }, hostFrame(0, 0));
    expect(Number.isFinite(point.x)).toBe(true);
    expect(Number.isFinite(point.y)).toBe(true);
  });
});
