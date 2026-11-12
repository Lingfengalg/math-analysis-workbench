import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Easing } from '@tweenjs/tween.js';
import { fixWebmDuration } from '@fix-webm-duration/fix';
import LimitChart from './LimitChart';
import {
  formatLimitNumber,
  observeLimit,
  type LimitExample,
} from './limitMath';

const DURATION = 5500;
const WIDTH = 640;
const HEIGHT = 400;

function checkCancelled(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('已取消导出', 'AbortError');
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted)
      return reject(new DOMException('已取消导出', 'AbortError'));
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    function abort() {
      clearTimeout(timer);
      reject(new DOMException('已取消导出', 'AbortError'));
    }
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** 离屏复用页面的 JSXGraph 画面；只录制内置示例，不解析或执行用户输入。 */
export async function exportLimitVideo(
  example: LimitExample,
  signal: AbortSignal,
  onProgress: (progress: number) => void,
): Promise<Blob> {
  checkCancelled(signal);
  if (
    typeof MediaRecorder === 'undefined' ||
    typeof HTMLCanvasElement.prototype.captureStream !== 'function' ||
    typeof MediaRecorder.isTypeSupported !== 'function' ||
    !MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
  )
    throw new Error(
      '当前浏览器不支持 WebM 视频导出，请使用支持 WebM 录制的浏览器。',
    );

  const host = document.createElement('div');
  host.style.cssText =
    'position:fixed;left:-10000px;top:0;width:640px;pointer-events:none;';
  host.setAttribute('aria-hidden', 'true');
  host.dataset.limitVideoHost = '';
  document.body.append(host);
  const root = createRoot(host);
  let exporter: (() => string) | null = null;
  const receive = (fn: (() => string) | null) => {
    exporter = fn;
  };
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  let stream: MediaStream | undefined;
  let recorder: MediaRecorder | undefined;
  try {
    if (!context) throw new Error('无法创建视频画布。');
    const draw = async (progress: number) => {
      checkCancelled(signal);
      flushSync(() =>
        root.render(
          createElement(LimitChart, { example, progress, onExporter: receive }),
        ),
      );
      const getSvg = exporter as (() => string) | null;
      if (!getSvg) throw new Error('图像尚未准备好。');
      {
        const image = new Image();
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(getSvg())}`;
        await image.decode();
        checkCancelled(signal);
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, WIDTH, HEIGHT);
        context.drawImage(image, 0, 0, WIDTH, 300);
        const sample = observeLimit(example, progress);
        context.font = '16px sans-serif';
        context.fillStyle = '#263859';
        context.fillText(
          `距离: ${formatLimitNumber(sample.distance)}`,
          16,
          330,
        );
        context.fillStyle = '#b65e42';
        context.fillText(
          `左侧函数值: ${formatLimitNumber(sample.leftY)}`,
          16,
          360,
        );
        context.fillStyle = '#328278';
        context.fillText(
          `右侧函数值: ${formatLimitNumber(sample.rightY)}`,
          300,
          360,
        );
        context.fillStyle = '#59677d';
        context.font = '12px sans-serif';
        context.fillText(
          example === 'square'
            ? '左右函数值趋向 1；最小距离为 0.01。'
            : '左右函数值分别为 -1 和 1，双侧极限不存在。',
          16,
          386,
        );
      }
    };
    await draw(0);
    stream = canvas.captureStream(15);
    recorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp8',
      videoBitsPerSecond: 1500000,
    });
    const chunks: Blob[] = [];
    let bytes = 0;
    let tooLarge = false;
    const stopped = new Promise<{ blob?: Blob; error?: Error }>((resolve) => {
      if (!recorder) return resolve({ error: new Error('视频录制不可用。') });
      recorder.ondataavailable = (event) => {
        bytes += event.data.size;
        if (bytes > 8 * 1024 * 1024) {
          tooLarge = true;
          if (recorder?.state === 'recording') recorder.stop();
        } else if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => resolve({ error: new Error('视频录制失败。') });
      recorder.onstop = () =>
        resolve({ blob: new Blob(chunks, { type: 'video/webm' }) });
    });
    recorder.start(500);
    const start = performance.now();
    while (true) {
      checkCancelled(signal);
      if (tooLarge) throw new Error('视频超出大小限制，已停止导出。');
      const elapsed = Math.min(DURATION, performance.now() - start);
      const progress = Easing.Quadratic.Out(elapsed / DURATION) * 100;
      await draw(progress);
      onProgress((elapsed / DURATION) * 100);
      if (elapsed >= DURATION) break;
      await wait(100, signal);
    }
    await wait(250, signal);
    if (tooLarge) throw new Error('视频超出大小限制，已停止导出。');
    recorder.stop();
    const result = await stopped;
    if (tooLarge) throw new Error('视频超出大小限制，已停止导出。');
    checkCancelled(signal);
    if (result.error || !result.blob?.size)
      throw result.error ?? new Error('视频文件为空。');
    const blob = await fixWebmDuration(result.blob, performance.now() - start, {
      logger: false,
    });
    checkCancelled(signal);
    return blob;
  } finally {
    if (recorder?.state !== 'inactive') recorder?.stop();
    stream?.getTracks().forEach((track) => track.stop());
    root.unmount();
    host.remove();
  }
}
