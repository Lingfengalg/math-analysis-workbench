import { useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Checkbox, Space, Typography } from 'antd';
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import { PageHeader } from '@/shared/ui/PageHeader';
import { downloadBlob } from '@/shared/ui/plot-export';
import {
  createFullBackup,
  fullBackupFileName,
  parseFullBackup,
  serializeFullBackup,
  type FullBackup,
} from '@/shared/backup/model';
import {
  applyRestore,
  planRestore,
  type BackupModuleAdapter,
  type RestorePlan,
} from '@/shared/backup/restore';
import styles from './BackupPage.module.css';

type Props = {
  adapters: readonly BackupModuleAdapter[];
};

type Notice = { ok: boolean; text: string };

/**
 * 跨模块完整备份：本机导出全部模块，导入时先预览、再按模块选择恢复。
 *
 * 明确边界：localStorage 没有跨键事务，恢复是「先校验、再逐模块写入」，
 * 中途失败会保留恢复前快照供人工回滚，不承诺原子性。
 */
export default function BackupPage({ adapters }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [backup, setBackup] = useState<FullBackup | null>(null);
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const moduleSummary = useMemo(
    () =>
      adapters.map((adapter) => {
        const result = adapter.read();
        return {
          id: adapter.id,
          label: adapter.label,
          ok: result.ok,
          detail: result.ok ? '可导出' : result.error,
        };
      }),
    [adapters],
  );

  const exportAll = () => {
    const modules: Record<string, unknown> = {};
    for (const adapter of adapters) {
      const result = adapter.read();
      if (!result.ok) {
        setNotice({
          ok: false,
          text: `${adapter.label}读取失败，已取消导出：${result.error}`,
        });
        return;
      }
      modules[adapter.id] = result.data;
    }
    const payload = createFullBackup(modules);
    downloadBlob(
      new Blob([serializeFullBackup(payload)], { type: 'application/json' }),
      fullBackupFileName(),
    );
    setNotice({
      ok: true,
      text: '已导出完整备份到本机下载目录，未上传任何数据。',
    });
  };

  const readFile = async (file: File) => {
    setBusy(true);
    try {
      const text = await file.text();
      const parsed = parseFullBackup(text);
      if (!parsed.ok) {
        setBackup(null);
        setPlan(null);
        setNotice({ ok: false, text: parsed.error });
        return;
      }
      const nextPlan = planRestore(
        parsed.backup,
        adapters,
        adapters.map((adapter) => adapter.id),
      );
      setBackup(parsed.backup);
      setPlan(nextPlan);
      setSelected(nextPlan.ready.map((adapter) => adapter.id));
      setNotice({
        ok: true,
        text: `已读取备份（${parsed.backup.exportedAt}），请确认要恢复的模块后再执行。`,
      });
    } catch {
      setNotice({ ok: false, text: '读取文件失败，请重新选择文件。' });
    } finally {
      setBusy(false);
    }
  };

  const restoreSelected = () => {
    if (!backup || !plan) return;
    const target = planRestore(backup, adapters, selected);
    if (target.invalid.length > 0) {
      setNotice({
        ok: false,
        text: `有模块数据不合法，未写入任何数据：${target.invalid
          .map((item) => item.label)
          .join('、')}`,
      });
      return;
    }
    setBusy(true);
    const result = applyRestore(target, backup);
    setBusy(false);
    if (result.failed.length > 0) {
      const snapshot = new Blob([JSON.stringify(result.snapshot, null, 2)], {
        type: 'application/json',
      });
      downloadBlob(snapshot, 'math-workbench-restore-snapshot.json');
      setNotice({
        ok: false,
        text: `恢复中途失败（已恢复 ${result.restored.length} 个模块，失败：${result.failed[0].id}）。已下载恢复前快照，可人工回滚；localStorage 没有跨键事务，不能保证原子性。`,
      });
      return;
    }
    setNotice({
      ok: true,
      text: `已恢复 ${result.restored.length} 个模块。如数据看起来不对，请用恢复前快照人工回滚。`,
    });
  };

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="DATA PORTABILITY"
        title="把本机数据带走，也能完整恢复。"
        description="完整备份包含错题、练习记录、批注、绘图设置与最近绘制；只在本机导出，不上传。"
      />
      <Card title="导出" className={styles.card}>
        <Space direction="vertical" size={8}>
          <ul className={styles.list}>
            {moduleSummary.map((item) => (
              <li key={item.id}>
                {item.label}：{item.ok ? '可导出' : `不可用（${item.detail}）`}
              </li>
            ))}
          </ul>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={exportAll}
          >
            导出完整备份
          </Button>
        </Space>
      </Card>

      <Card title="恢复" className={styles.card}>
        <Space direction="vertical" size={8}>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            aria-label="选择完整备份文件"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
              event.target.value = '';
            }}
          />
          {plan && (
            <div className={styles.preview}>
              <Typography.Text strong>预览</Typography.Text>
              <Checkbox.Group
                value={selected}
                onChange={(values) => setSelected(values as string[])}
                options={plan.ready.map((adapter) => ({
                  label: adapter.label,
                  value: adapter.id,
                }))}
              />
              {plan.missing.length > 0 && (
                <Typography.Text type="secondary">
                  备份中没有：
                  {plan.missing.map((item) => item.label).join('、')}
                </Typography.Text>
              )}
              {plan.unknown.length > 0 && (
                <Typography.Text type="warning">
                  备份包含当前版本无法识别的模块：{plan.unknown.join('、')}
                </Typography.Text>
              )}
              {plan.invalid.length > 0 && (
                <Alert
                  type="error"
                  showIcon
                  title="以下模块数据不合法，恢复会被拒绝"
                  description={plan.invalid
                    .map((item) => `${item.label}：${item.error}`)
                    .join('；')}
                />
              )}
              <Button
                danger
                icon={<UploadOutlined />}
                disabled={busy || selected.length === 0}
                onClick={restoreSelected}
              >
                恢复选中模块（覆盖本机数据）
              </Button>
            </div>
          )}
          {notice && (
            <Alert
              type={notice.ok ? 'success' : 'error'}
              showIcon
              title={notice.text}
            />
          )}
        </Space>
      </Card>
    </div>
  );
}
