import { useMemo, useState } from 'react';
import { Alert, Button, Card, Input, Popconfirm, Segmented, Tag } from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { PageHeader } from '@/shared/ui/PageHeader';
import { MistakeFormModal } from './MistakeFormModal';
import { useMistakes } from './useMistakes';
import {
  formatMistakeTime,
  MISTAKE_TOPICS,
  topicLabels,
  type Mistake,
  type MistakeDraft,
  type MistakeTopic,
} from './model';
import styles from './MistakesPage.module.css';

type TopicFilter = 'all' | MistakeTopic;

export default function MistakesPage() {
  const { items, loadError, saveError, canWrite, add, edit, remove, reset } =
    useMistakes();
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState<TopicFilter>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Mistake | null>(null);
  // 打开删除确认时记录快照：期间若被其他标签页修改，确认时要能发现
  const [pendingDelete, setPendingDelete] = useState<Mistake | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const visible = useMemo(() => {
    const keyword = query.trim();
    return items.filter(
      (item) =>
        (topic === 'all' || item.topic === topic) &&
        (keyword === '' ||
          `${item.title} ${item.problem} ${item.mistakeReason} ${item.correction}`.includes(
            keyword,
          )),
    );
  }, [items, query, topic]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (item: Mistake) => {
    setEditing(item);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const submit = async (draft: MistakeDraft) => {
    const saved = editing ? await edit(editing, draft) : await add(draft);
    if (!saved) return;
    setNotice(editing ? '已更新这条错题。' : '已记录一条错题。');
    closeForm();
  };

  const confirmRemove = async (item: Mistake) => {
    if (await remove(item)) setNotice('已删除这条错题。');
  };

  const clearAll = async () => {
    if (await reset()) setNotice('已清除本地错题数据。');
  };

  return (
    <>
      <PageHeader
        eyebrow="MISTAKE NOTEBOOK"
        title="把一次错误，变成下一次理解的起点。"
        description="记录题目、错误原因与订正，标注知识主题，随时回看。数据只保存在当前浏览器。"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreate}
            disabled={Boolean(loadError) || !canWrite}
          >
            记录错题
          </Button>
        }
      />
      {!canWrite && (
        <Alert
          className="section-gap-bottom"
          type="warning"
          showIcon
          title="当前环境不支持跨标签页写入锁，错题本为只读模式"
          description="为避免多个标签页同时写入造成数据丢失，写操作已禁用。已有数据仍可查看和导出备份。如需编辑，请使用支持 Web Locks 的浏览器（Chrome/Edge 79+、Firefox 96+、Safari 15.4+），并通过 https 或 localhost 访问。"
        />
      )}
      {loadError && (
        <Alert
          className="section-gap-bottom"
          type="warning"
          showIcon
          title="本地错题数据无法读取"
          description={`${loadError} 原始数据仍保留在浏览器中，未被自动覆盖。`}
          action={
            <Popconfirm
              title="清空本地错题数据？"
              description="清除后无法恢复，仅在已确认数据无用或已备份时继续。"
              okText="确认清除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={() => void clearAll()}
            >
              <Button danger size="small" disabled={!canWrite}>
                清空并重新开始
              </Button>
            </Popconfirm>
          }
        />
      )}
      {saveError && !formOpen && (
        <Alert
          className="section-gap-bottom"
          type="error"
          showIcon
          title="保存失败"
          description={saveError}
        />
      )}
      {notice && (
        <Alert
          className="section-gap-bottom"
          type="success"
          showIcon
          title={notice}
        />
      )}
      {items.length > 0 && (
        <div className="filter-bar">
          <Segmented
            aria-label="按知识主题筛选"
            value={topic}
            onChange={(value) => setTopic(value as TopicFilter)}
            options={[
              { label: '全部', value: 'all' },
              ...MISTAKE_TOPICS.map((item) => ({
                label: topicLabels[item],
                value: item,
              })),
            ]}
          />
          <Input
            aria-label="搜索错题"
            placeholder="搜索题目、错误原因或订正"
            prefix={<SearchOutlined />}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            allowClear
          />
        </div>
      )}
      {items.length === 0 && !loadError && (
        <div className="empty-state">
          还没有错题记录。点击“记录错题”，把第一道错题留下来。
        </div>
      )}
      {items.length > 0 && (
        <p className={styles.count}>
          共 {items.length} 条错题，当前显示 {visible.length} 条。
        </p>
      )}
      <div className={styles.grid}>
        {visible.map((item) => (
          <Card
            key={item.id}
            title={item.title}
            extra={<Tag>{topicLabels[item.topic]}</Tag>}
            actions={[
              <Button
                key="edit"
                type="link"
                icon={<EditOutlined />}
                disabled={!canWrite}
                onClick={() => openEdit(item)}
              >
                编辑
              </Button>,
              <Popconfirm
                key="delete"
                title="删除这条错题？"
                description="删除后无法恢复。"
                okText="确认删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onOpenChange={(open) => setPendingDelete(open ? item : null)}
                onConfirm={() => {
                  const target = pendingDelete ?? item;
                  setPendingDelete(null);
                  void confirmRemove(target);
                }}
              >
                <Button
                  type="link"
                  danger
                  icon={<DeleteOutlined />}
                  disabled={!canWrite}
                >
                  删除
                </Button>
              </Popconfirm>,
            ]}
          >
            <p className={styles.meta}>
              最近更新：{formatMistakeTime(item.updatedAt)}
            </p>
            {item.problem && (
              <>
                <h4 className={styles.heading}>题目</h4>
                <p className={styles.text}>{item.problem}</p>
              </>
            )}
            {item.mistakeReason && (
              <>
                <h4 className={styles.heading}>错误原因</h4>
                <p className={styles.text}>{item.mistakeReason}</p>
              </>
            )}
            {item.correction && (
              <>
                <h4 className={styles.heading}>订正与正确思路</h4>
                <p className={styles.text}>{item.correction}</p>
              </>
            )}
            {!item.problem && !item.mistakeReason && !item.correction && (
              <p className={styles.text}>这条记录还没有补充详细内容。</p>
            )}
          </Card>
        ))}
      </div>
      {items.length > 0 && visible.length === 0 && (
        <div className="empty-state">
          没有匹配的错题，换个关键词或选择“全部”。
        </div>
      )}
      <MistakeFormModal
        open={formOpen}
        initial={editing}
        onCancel={closeForm}
        onSubmit={submit}
        error={saveError}
      />
    </>
  );
}
