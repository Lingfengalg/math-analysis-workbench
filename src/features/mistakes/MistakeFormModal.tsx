import { useEffect, useRef, useState } from 'react';
import { Alert, Form, Input, Modal, Select } from 'antd';
import {
  MISTAKE_LIMITS,
  MISTAKE_TOPICS,
  topicLabels,
  type Mistake,
  type MistakeDraft,
} from './model';

const EMPTY_DRAFT: MistakeDraft = {
  title: '',
  topic: 'limit',
  problem: '',
  mistakeReason: '',
  correction: '',
};

interface Props {
  open: boolean;
  initial: Mistake | null;
  onCancel: () => void;
  onSubmit: (draft: MistakeDraft) => Promise<void>;
  error: string | null;
}

export function MistakeFormModal({
  open,
  initial,
  onCancel,
  onSubmit,
  error,
}: Props) {
  const [form] = Form.useForm<MistakeDraft>();
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (initial) {
      form.setFieldsValue({
        title: initial.title,
        topic: initial.topic,
        problem: initial.problem,
        mistakeReason: initial.mistakeReason,
        correction: initial.correction,
      });
    }
  }, [open, initial, form]);

  const submit = async () => {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    try {
      await onSubmit(await form.validateFields());
    } catch {
      /* 校验失败时表单自身展示错误，弹窗保持打开。 */
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={initial ? '编辑错题' : '记录错题'}
      okText="保存"
      cancelText="取消"
      onOk={() => void submit()}
      onCancel={onCancel}
      confirmLoading={saving}
      closable={!saving}
      cancelButtonProps={{ disabled: saving }}
      maskClosable={!saving}
      keyboard={!saving}
      width={620}
    >
      {error && (
        <Alert type="error" showIcon title="保存失败" description={error} />
      )}
      <Form
        form={form}
        layout="vertical"
        initialValues={EMPTY_DRAFT}
        requiredMark={false}
      >
        <Form.Item
          name="title"
          label="题目"
          rules={[
            { required: true, whitespace: true, message: '请输入题目' },
            {
              max: MISTAKE_LIMITS.title,
              message: `题目最多 ${MISTAKE_LIMITS.title} 个字符`,
            },
          ]}
        >
          <Input placeholder="例如：1/x 在 x = 0 处连续吗" autoComplete="off" />
        </Form.Item>
        <Form.Item name="topic" label="知识主题">
          <Select
            options={MISTAKE_TOPICS.map((topic) => ({
              value: topic,
              label: topicLabels[topic],
            }))}
          />
        </Form.Item>
        <Form.Item
          name="problem"
          label="题目内容"
          rules={[
            {
              max: MISTAKE_LIMITS.problem,
              message: `题目内容最多 ${MISTAKE_LIMITS.problem} 个字符`,
            },
          ]}
        >
          <Input.TextArea rows={3} placeholder="原题、条件或自己的复述" />
        </Form.Item>
        <Form.Item
          name="mistakeReason"
          label="错误原因"
          rules={[
            {
              max: MISTAKE_LIMITS.mistakeReason,
              message: `错误原因最多 ${MISTAKE_LIMITS.mistakeReason} 个字符`,
            },
          ]}
        >
          <Input.TextArea rows={3} placeholder="当时的思路在哪一步出错" />
        </Form.Item>
        <Form.Item
          name="correction"
          label="订正与正确思路"
          rules={[
            {
              max: MISTAKE_LIMITS.correction,
              message: `订正最多 ${MISTAKE_LIMITS.correction} 个字符`,
            },
          ]}
        >
          <Input.TextArea rows={4} placeholder="正确做法、需要检查的条件" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
