import type { FullBackup } from './model';

/**
 * 模块备份适配器：由各模块自己提供，应用层负责组装。
 * `validate` 只校验不改动存储；`restore` 在已通过校验后写入。
 */
export type BackupModuleAdapter = {
  id: string;
  label: string;
  /** 读取当前数据；读取失败时返回错误而不是空数据，避免「恢复成空」覆盖原内容。 */
  read: () => { ok: true; data: unknown } | { ok: false; error: string };
  /** 校验备份中的该模块数据；返回 null 表示可恢复。 */
  validate: (data: unknown) => string | null;
  /** 写入本机存储；返回 null 表示成功。 */
  restore: (data: unknown) => string | null;
};

export type RestorePlan = {
  /** 通过校验、可以恢复的模块 */
  ready: BackupModuleAdapter[];
  /** 备份里没有该模块数据 */
  missing: { id: string; label: string }[];
  /** 备份里存在但当前版本无法识别的模块 */
  unknown: string[];
  /** 校验失败的模块：不会写入任何数据 */
  invalid: { id: string; label: string; error: string }[];
};

/**
 * 生成恢复计划：**只校验、不写入**。
 * 先把所有选中的模块校验一遍，任何一个失败都不会改动存储。
 */
export function planRestore(
  backup: FullBackup,
  adapters: readonly BackupModuleAdapter[],
  selectedIds: readonly string[],
): RestorePlan {
  const selected = new Set(selectedIds);
  const plan: RestorePlan = {
    ready: [],
    missing: [],
    unknown: [],
    invalid: [],
  };
  for (const adapter of adapters) {
    if (!selected.has(adapter.id)) continue;
    if (!(adapter.id in backup.modules)) {
      plan.missing.push({ id: adapter.id, label: adapter.label });
      continue;
    }
    const error = adapter.validate(backup.modules[adapter.id]);
    if (error)
      plan.invalid.push({ id: adapter.id, label: adapter.label, error });
    else plan.ready.push(adapter);
  }
  const known = new Set(adapters.map((adapter) => adapter.id));
  for (const id of Object.keys(backup.modules)) {
    if (!known.has(id)) plan.unknown.push(id);
  }
  return plan;
}

export type RestoreResult = {
  restored: string[];
  failed: { id: string; error: string }[];
  /** 恢复前的快照（成功读取的模块），失败时可用于人工回滚 */
  snapshot: Record<string, unknown>;
};

/**
 * 执行恢复：逐模块写入，遇到失败立即停止，并返回已完成 / 失败与恢复前快照。
 * 调用方必须提示「非原子」并保留快照；不得宣称跨键事务。
 */
export function applyRestore(
  plan: RestorePlan,
  backup: FullBackup,
): RestoreResult {
  const result: RestoreResult = { restored: [], failed: [], snapshot: {} };
  for (const adapter of plan.ready) {
    const before = adapter.read();
    if (before.ok) result.snapshot[adapter.id] = before.data;
    const error = adapter.restore(backup.modules[adapter.id]);
    if (error) {
      result.failed.push({ id: adapter.id, error });
      break;
    }
    result.restored.push(adapter.id);
  }
  return result;
}
