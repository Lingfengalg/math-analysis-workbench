import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildPlotExportName,
  downloadBlob,
  pngDataUrlToBlob,
} from './plot-export';

beforeEach(() => {
  // jsdom 不实现对象 URL 与下载导航，用桩替代并断言调用。
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:mock'),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('导出文件名安全化（#54）', () => {
  it('普通表达式与区间拼接为文件名', () => {
    expect(buildPlotExportName('x^2', -5, 5)).toBe('函数图像_x^2_-5到5.png');
  });
  it('去除路径分隔符等文件系统非法字符', () => {
    expect(buildPlotExportName('1/x', -5, 5)).toBe('函数图像_1x_-5到5.png');
    expect(buildPlotExportName('a\\b:c*d?e"f<g>h|i', -5, 5)).toBe(
      '函数图像_abcdefghi_-5到5.png',
    );
  });
  it('空白替换为下划线', () => {
    expect(buildPlotExportName('sin(x) + 1', -5, 5)).toBe(
      '函数图像_sin(x)_+_1_-5到5.png',
    );
  });
  it('超长表达式截断，空表达式有兜底', () => {
    expect(buildPlotExportName('x'.repeat(161), -5, 5)).toBe(
      `函数图像_${'x'.repeat(40)}_-5到5.png`,
    );
    expect(buildPlotExportName('///', -5, 5)).toBe('函数图像_函数_-5到5.png');
  });
});

describe('PNG data URL 转 Blob（#54）', () => {
  it('合法 PNG data URL 返回对应 Blob', () => {
    // 1×1 透明 PNG 的 base64
    const dataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const blob = pngDataUrlToBlob(dataUrl);
    expect(blob).not.toBeNull();
    expect(blob!.type).toBe('image/png');
    expect(blob!.size).toBeGreaterThan(0);
  });
  it.each([
    'data:image/jpeg;base64,abc',
    'data:image/png;base64,',
    '不是 data URL',
    'data:image/png',
  ])('非 PNG 或不完整的数据返回 null', (dataUrl) => {
    expect(pngDataUrlToBlob(dataUrl)).toBeNull();
  });
});

describe('浏览器下载触发（#54）', () => {
  it('创建对象 URL、点击下载链接并回收', () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    const blob = new Blob(['x'], { type: 'image/png' });
    expect(downloadBlob(blob, '测试.png')).toBe(true);
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    expect(click).toHaveBeenCalledTimes(1);
  });
  it('对象 URL 不可用时返回 false', () => {
    (URL.createObjectURL as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('not supported');
    });
    expect(downloadBlob(new Blob(['x']), '测试.png')).toBe(false);
  });
});
