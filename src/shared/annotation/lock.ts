const LOCK_PREFIX = 'math-workbench:annotation-write:';

interface LockManagerLike {
  request<T>(
    name: string,
    options: { mode: 'exclusive' },
    callback: () => T | Promise<T>,
  ): Promise<T>;
}

function getLocks(): LockManagerLike | null {
  if (typeof navigator === 'undefined') return null;
  const locks = (navigator as unknown as { locks?: LockManagerLike }).locks;
  return locks && typeof locks.request === 'function' ? locks : null;
}

/** 与错题本一致：按能力探测，要求安全上下文，不嗅探 UA。 */
export function supportsAnnotationLock(): boolean {
  return getLocks() !== null;
}

/**
 * 在「按页面」的跨标签页互斥锁内执行读取-修改-写入。
 * 不支持时调用方应退回只读，不能用不安全写入兜底。
 */
export async function withAnnotationLock<T>(
  pageId: string,
  task: () => T | Promise<T>,
): Promise<T> {
  const locks = getLocks();
  if (!locks) return task();
  return locks.request(`${LOCK_PREFIX}${pageId}`, { mode: 'exclusive' }, () =>
    task(),
  );
}
