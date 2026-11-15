import { useRef, useState } from 'react';
import { Alert, Button, Input, Modal, Space } from 'antd';
import { formatMistakeTime, type Mistake } from './model';
import {
  previewReviews,
  Rating,
  type ReviewRating,
  type ReviewSchedule,
} from './schedule';
import styles from './MistakeRedoModal.module.css';

type Props = {
  item: Mistake;
  canWrite: boolean;
  error: string | null;
  onClose: () => void;
  onComplete: (item: Mistake, rating: ReviewRating) => Promise<boolean>;
};

/** 自由文本错题由用户对照订正后自评，不宣称自动判分。 */
export function MistakeRedoModal({
  item,
  canWrite,
  error,
  onClose,
  onComplete,
}: Props) {
  const [answer, setAnswer] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<Record<
    ReviewRating,
    ReviewSchedule
  > | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const pending = useRef(false);
  const finish = async (rating: ReviewRating) => {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    try {
      if (await onComplete(item, rating)) onClose();
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  return (
    <Modal
      open
      title={`重做：${item.title}`}
      onCancel={onClose}
      closable={!saving}
      maskClosable={!saving}
      keyboard={!saving}
      footer={null}
      width={620}
    >
      {!item.problem ? (
        <Alert
          type="info"
          showIcon
          title="这条记录还没有题目内容"
          description="请先编辑错题并补充题目，然后再重做。"
        />
      ) : (
        <>
          <h3>题目</h3>
          <p className={styles.text}>{item.problem}</p>
          <label htmlFor="redo-answer">
            你的思路（仅在本次重做中显示，不会保存）
          </label>
          <Input.TextArea
            id="redo-answer"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            rows={4}
            maxLength={2000}
            disabled={revealed || saving}
            placeholder="先独立写下思路，再查看订正"
          />
          {!revealed ? (
            <p>
              <Button
                type="primary"
                disabled={!answer.trim()}
                onClick={() => {
                  try {
                    setPreview(previewReviews(item.schedule, Date.now()));
                    setPreviewError(false);
                  } catch {
                    setPreview(null);
                    setPreviewError(true);
                  }
                  setRevealed(true);
                }}
              >
                查看订正
              </Button>
            </p>
          ) : (
            <>
              <h3>错误原因</h3>
              <p className={styles.text}>{item.mistakeReason || '未填写。'}</p>
              <h3>订正与正确思路</h3>
              <p className={styles.text}>
                {item.correction || '未填写订正，请先编辑补充。'}
              </p>
              <p>
                请自行比较思路并选择记忆程度；FSRS
                将据此安排下次复习，不代表自动判分。
              </p>
              <p>
                仍需复习：未能独立完成；有困难：勉强想起；已掌握：正确完成；很轻松：迅速且有把握。
              </p>
              {preview ? (
                <div
                  className={styles.preview}
                  role="group"
                  aria-label="预计下次复习时间"
                >
                  <strong>预计下次复习时间</strong>
                  <p>
                    按查看订正时的本机时间估算；实际保存时重新计算，不会提前写入。
                  </p>
                  <ul>
                    <li>
                      仍需复习：{formatMistakeTime(preview[Rating.Again].due)}
                    </li>
                    <li>
                      有困难：{formatMistakeTime(preview[Rating.Hard].due)}
                    </li>
                    <li>
                      已掌握：{formatMistakeTime(preview[Rating.Good].due)}
                    </li>
                    <li>
                      很轻松：{formatMistakeTime(preview[Rating.Easy].due)}
                    </li>
                  </ul>
                </div>
              ) : previewError ? (
                <Alert
                  type="warning"
                  showIcon
                  title="无法预览复习时间"
                  description="请检查系统时间与复习记录；预览未更改任何数据。"
                />
              ) : null}
              {error && (
                <Alert
                  type="error"
                  showIcon
                  title="复习状态未保存"
                  description={error}
                />
              )}
              <Space wrap>
                <Button
                  loading={saving}
                  disabled={!canWrite}
                  onClick={() => void finish(Rating.Again)}
                >
                  仍需复习
                </Button>
                <Button
                  loading={saving}
                  disabled={!canWrite}
                  onClick={() => void finish(Rating.Hard)}
                >
                  有困难
                </Button>
                <Button
                  loading={saving}
                  disabled={!canWrite}
                  onClick={() => void finish(Rating.Good)}
                >
                  已掌握，标记已复习
                </Button>
                <Button
                  loading={saving}
                  disabled={!canWrite}
                  onClick={() => void finish(Rating.Easy)}
                >
                  很轻松
                </Button>
                <Button
                  disabled={saving}
                  onClick={() => {
                    setAnswer('');
                    setRevealed(false);
                  }}
                >
                  再做一次
                </Button>
              </Space>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
