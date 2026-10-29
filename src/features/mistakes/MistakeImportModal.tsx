import { useRef, useState, type ChangeEvent } from 'react';
import { Alert, Button, Modal, Radio, Space } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import type { Mistake } from './model';
import { parseExport, type ImportMode } from './transfer';
import styles from './MistakesPage.module.css';

interface Props {
  open: boolean;
  onCancel: () => void;
  onConfirm: (items: Mistake[], mode: ImportMode) => void;
}

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsText(file);
  });
}

export function MistakeImportModal({ open, onCancel, onConfirm }: Props) {
  const [mode, setMode] = useState<ImportMode>('merge');
  const [fileName, setFileName] = useState('');
  const [items, setItems] = useState<Mistake[] | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const select = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 清空 value，允许重复选择同一个文件。
    event.target.value = '';
    if (!file) return;
    setFileName(file.name);
    try {
      const result = parseExport(await readText(file));
      if (!result.ok) {
        setItems(null);
        setError(result.error);
        return;
      }
      setItems(result.items);
      setError('');
    } catch {
      setItems(null);
      setError('读取文件失败，请重新选择。');
    }
  };

  return (
    <Modal
      open={open}
      title="导入错题"
      okText="导入"
      cancelText="取消"
      width={560}
      okButtonProps={{ disabled: items === null }}
      onOk={() => {
        if (items) onConfirm(items, mode);
      }}
      onCancel={onCancel}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          aria-label="选择导入文件"
          className={styles.fileInput}
          onChange={(event) => void select(event)}
        />
        <Button
          icon={<UploadOutlined />}
          onClick={() => inputRef.current?.click()}
        >
          选择 JSON 文件
        </Button>
        {fileName && (
          <p className={styles.hint}>
            已选择：{fileName}
            {items ? `（${items.length} 条错题）` : ''}
          </p>
        )}
        <div>
          <p className={styles.hint}>导入方式</p>
          <Radio.Group
            value={mode}
            onChange={(event) => setMode(event.target.value as ImportMode)}
          >
            <Space direction="vertical">
              <Radio value="merge">
                合并：按 id 去重，保留更新时间较新的一条
              </Radio>
              <Radio value="replace">替换：清空现有错题后导入</Radio>
            </Space>
          </Radio.Group>
        </div>
        {error && (
          <Alert type="error" showIcon title="导入失败" description={error} />
        )}
      </Space>
    </Modal>
  );
}
