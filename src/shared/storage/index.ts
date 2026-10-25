import { z } from 'zod';

const PREFIX = 'math-workbench:';
const envelopeSchema = z.object({
  schemaVersion: z.literal(1),
  data: z.unknown(),
});
export type StorageResult<T> =
  { ok: true; data: T } | { ok: false; error: string };

// Store data behind a versioned envelope. Never silently replace corrupt data.
export function createStorage<T>(key: string, schema: z.ZodType<T>) {
  const name = `${PREFIX}${key}`;
  return {
    read(fallback: T): StorageResult<T> {
      try {
        const raw = window.localStorage.getItem(name);
        if (raw === null) return { ok: true, data: fallback };
        const envelope = envelopeSchema.parse(JSON.parse(raw));
        return { ok: true, data: schema.parse(envelope.data) };
      } catch {
        return {
          ok: false,
          error: '无法读取本地数据：可能版本不兼容、数据损坏或存储被禁用。',
        };
      }
    },
    write(value: T): StorageResult<T> {
      const result = schema.safeParse(value);
      if (!result.success)
        return { ok: false, error: '数据格式不符合约定，未保存。' };
      try {
        window.localStorage.setItem(
          name,
          JSON.stringify({ schemaVersion: 1, data: result.data }),
        );
        return { ok: true, data: result.data };
      } catch {
        return { ok: false, error: '保存失败：浏览器存储不可用或空间不足。' };
      }
    },
    clear(): StorageResult<null> {
      try {
        window.localStorage.removeItem(name);
        return { ok: true, data: null };
      } catch {
        return { ok: false, error: '清除失败：浏览器存储不可用。' };
      }
    },
  };
}
