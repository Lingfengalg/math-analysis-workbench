/**
 * 写入、单页清空、清空全部共用同一把锁。
 *
 * 早期按页面分锁无法让「清空全部」与各页面写入串行化（多把锁没有固定获取顺序，
 * 加锁顺序也容易死锁），因此改为全局单锁：批注写入量小，串行化的代价远低于
 * 竞争导致的数据丢失。
 */
export const ANNOTATION_LOCK_NAME = 'math-workbench:annotation-write';

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
 * 在全局互斥锁内执行读取-修改-写入。写入、清空本页、清空全部都必须走这里，
 * 保证三种操作之间不会交错。
 */
export async function withAnnotationLock<T>(
  task: () => T | Promise<T>,
): Promise<T> {
  const locks = getLocks();
  if (!locks) return task();
  return locks.request(ANNOTATION_LOCK_NAME, { mode: 'exclusive' }, () =>
    task(),
  );
}
