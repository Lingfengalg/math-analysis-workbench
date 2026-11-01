// 导出文件名的表达式安全化：去掉文件系统非法字符，避免路径分隔符与通配符。
export function buildPlotExportName(
  expression: string,
  xMin: number,
  xMax: number,
): string {
  const safe =
    expression
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 40) || '函数';
  return `函数图像_${safe}_${xMin}到${xMax}.png`;
}

// data:image/png;base64,… → Blob；仅接受 PNG data URL，其余返回 null。
export function pngDataUrlToBlob(dataUrl: string): Blob | null {
  if (!dataUrl.startsWith('data:image/png')) return null;
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return null;
  const payload = dataUrl.slice(comma + 1);
  if (payload.length === 0) return null;
  const binary = window.atob(payload);
  if (binary.length === 0) return null;
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: 'image/png' });
}

// 触发浏览器下载；返回是否成功发起（本地画布数据，不上传任何内容）。
export function downloadBlob(blob: Blob, filename: string): boolean {
  try {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}
