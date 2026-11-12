import { useRef, useState, type ChangeEvent } from 'react';
import { Alert, Button, Input, Popconfirm } from 'antd';
import { PageHeader } from '@/shared/ui/PageHeader';
import { MathInputLauncher } from '@/shared/ui/math-input/MathInputLauncher';
import type { MistakeDraft, MistakeTopic } from '../model';
import { topicLabels } from '../model';
import { correctAnswer, displayAnswer, gradePractice } from './grading';
import { practiceQuestions, type PracticeQuestion } from './questions';
import {
  parsePracticeBackup,
  emptyProgress,
  latestAttempt,
  practiceStorage,
  serializePracticeBackup,
  type PracticeAttempt,
} from './progress';
import { usePracticeProgress } from './usePracticeProgress';
import styles from './PracticeView.module.css';

type Props = {
  initialTopic: MistakeTopic | 'all';
  onBack: () => void;
  syncMistake: (
    questionId: string,
    draft: MistakeDraft,
    correct: boolean,
  ) => Promise<boolean>;
  mistakeError: string | null;
};

function draftFor(question: PracticeQuestion, answer: string): MistakeDraft {
  const choices =
    question.kind === 'choice'
      ? `\n选项：${question.options.map((option) => option.label).join('；')}`
      : '';
  return {
    title: question.title,
    topic: question.topic,
    problem: question.prompt + choices,
    mistakeReason: `练习时作答：${displayAnswer(question, answer)}`,
    correction: `参考答案：${correctAnswer(question)}。\n${question.explanation}`,
  };
}

function download(text: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function PracticeView({
  initialTopic,
  onBack,
  syncMistake,
  mistakeError,
}: Props) {
  const progress = usePracticeProgress();
  const [index, setIndex] = useState(() => {
    const first = practiceQuestions.findIndex(
      (item) => item.topic === initialTopic,
    );
    return first < 0 ? 0 : first;
  });
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(
    null,
  );
  const [hintOpen, setHintOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [syncFailed, setSyncFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const question = practiceQuestions[index];
  const history = progress.attempts.filter(
    (item) => item.questionId === question.id,
  );
  const last = latestAttempt(history, question.id);

  const selectQuestion = (next: number) => {
    setIndex(next);
    setAnswer('');
    setFeedback(null);
    setHintOpen(false);
    setMessage(null);
    setSyncFailed(false);
  };
  const sync = async (item: PracticeAttempt) => {
    const ok = await syncMistake(
      question.id,
      draftFor(question, item.answer),
      item.correct,
    );
    setSyncFailed(!ok);
    setMessage(
      ok
        ? item.correct
          ? '作答已保存；如有对应练习错题，已标记为已复习。'
          : '作答已保存，错题已加入错题本。'
        : '作答已保存，但错题本未同步。可使用“同步最近结果”重试。',
    );
  };
  const submit = async () => {
    if (busy.current) return;
    let grade: ReturnType<typeof gradePractice>;
    try {
      grade = gradePractice(question, answer);
    } catch {
      setMessage('评分暂不可用，请稍后重试；本次没有保存。');
      return;
    }
    if (grade === 'invalid') {
      setSyncFailed(false);
      setMessage(
        question.kind === 'number'
          ? '请输入有效整数、小数或分数（分母不能为零）。'
          : '请先选择一个答案。',
      );
      return;
    }
    busy.current = true;
    setSaving(true);
    setSyncFailed(false);
    setMessage(null);
    try {
      await navigator.locks.request(
        'math-workbench:practice-operation',
        async () => {
          const correct = grade === 'correct';
          if (!(await progress.record(question.id, answer.trim(), correct))) {
            setMessage('本次作答未保存，请检查练习记录提示后重试。');
            return;
          }
          setFeedback(grade);
          await sync({
            id: 'current',
            questionId: question.id,
            answer: answer.trim(),
            correct,
            answeredAt: Date.now(),
          });
        },
      );
    } catch {
      setMessage('练习操作未能完成，请先查看记录后再重试，避免重复提交。');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const retrySync = async () => {
    if (!last || busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      await navigator.locks.request(
        'math-workbench:practice-operation',
        async () => {
          const current = practiceStorage.read(emptyProgress);
          if (!current.ok) {
            setMessage('无法读取最新练习记录，未同步。');
            return;
          }
          const latest = latestAttempt(current.data.attempts, question.id);
          if (!latest) {
            setMessage('此题已没有练习记录，未同步。');
            return;
          }
          const grade = gradePractice(question, latest.answer);
          if (grade === 'invalid' || (grade === 'correct') !== latest.correct) {
            setMessage('记录与当前评分不一致，未同步；请重新作答。');
            return;
          }
          await sync(latest);
        },
      );
    } catch {
      setMessage('无法同步练习记录，请稍后重试。');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  const exportData = () => {
    const current = practiceStorage.read(emptyProgress);
    if (!current.ok) {
      const raw = practiceStorage.readRaw();
      if (!raw.ok || raw.data === null) {
        setMessage('无法读取原始记录，未导出。');
        return;
      }
      download(raw.data, 'practice-raw-backup.json');
    } else
      download(
        serializePracticeBackup(current.data.attempts),
        'practice-backup.json',
      );
  };
  const importData = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 1_000_000) {
      setMessage('备份文件超过 1 MB，未导入。');
      return;
    }
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      const data = parsePracticeBackup(await file.text());
      if (!data) {
        setMessage('备份格式不正确，未导入。');
        return;
      }
      setMessage(
        (await navigator.locks.request(
          'math-workbench:practice-operation',
          () => progress.merge(data),
        ))
          ? '练习记录已合并；未自动更改错题本。'
          : '练习记录未导入，请查看错误提示。',
      );
    } catch {
      setMessage('文件读取失败，未导入。');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  const resetData = async () => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      const ok = await navigator.locks.request(
        'math-workbench:practice-operation',
        () => progress.reset(),
      );
      if (ok) setMessage('练习记录已清除。');
    } catch {
      setMessage('无法取得练习操作锁，未清除记录。');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="PRACTICE"
        title="做一题，再把思路走通。"
        description="先独立作答，再看提示和解析。示例题的作答记录保存在当前浏览器。"
        extra={
          <Button onClick={onBack} disabled={saving}>
            返回错题本
          </Button>
        }
      />
      {!progress.canWrite && (
        <Alert
          type="warning"
          showIcon
          title="当前浏览器不支持跨标签页锁，练习记录为只读。"
        />
      )}
      {progress.error && (
        <Alert
          className="section-gap-bottom"
          type="error"
          showIcon
          title="练习记录无法保存或读取"
          description={progress.error}
        />
      )}
      <div className={styles.layout}>
        <nav className={styles.questionList} aria-label="练习题目">
          <div className={styles.listHeader}>
            <strong>示例练习</strong>
            <span>{practiceQuestions.length} 题</span>
          </div>
          {practiceQuestions.map((item, itemIndex) => {
            const results = progress.attempts.filter(
              (attempt) => attempt.questionId === item.id,
            );
            const recent = latestAttempt(results, item.id);
            return (
              <button
                type="button"
                key={item.id}
                className={styles.questionLink}
                aria-current={itemIndex === index ? 'step' : undefined}
                disabled={saving}
                onClick={() => selectQuestion(itemIndex)}
              >
                <span className={styles.questionTopic}>
                  {topicLabels[item.topic]}
                </span>
                <strong>{item.title}</strong>
                <span>
                  {recent
                    ? recent.correct
                      ? '最近答对'
                      : '等待重做'
                    : '尚未作答'}
                </span>
              </button>
            );
          })}
          <p className={styles.listNote}>
            内置题目为工程示例，仍需课程团队核验。
          </p>
        </nav>
        <section className={styles.question} aria-labelledby="practice-title">
          <div className={styles.meta}>
            <span>{topicLabels[question.topic]}</span>
            <span>
              {index + 1} / {practiceQuestions.length}
            </span>
          </div>
          <h2 id="practice-title">{question.title}</h2>
          <p className={styles.prompt}>{question.prompt}</p>
          <div className={styles.answerArea}>
            {question.kind === 'choice' ? (
              <fieldset
                className={styles.options}
                disabled={saving || feedback !== null}
              >
                <legend>选择答案</legend>
                {question.options.map((option) => (
                  <label key={option.id}>
                    <input
                      type="radio"
                      name="practice-answer"
                      value={option.id}
                      checked={answer === option.id}
                      onChange={() => setAnswer(option.id)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </fieldset>
            ) : (
              <>
                <label className={styles.inputLabel}>
                  你的答案
                  <Input
                    aria-label="你的答案"
                    value={answer}
                    maxLength={40}
                    disabled={saving || feedback !== null}
                    onChange={(event) => setAnswer(event.target.value)}
                    placeholder="整数、小数或分数，例如 1/2"
                  />
                </label>
                <MathInputLauncher
                  key={question.id}
                  mode="numeric"
                  value={answer}
                  onApply={setAnswer}
                  disabled={saving || feedback !== null}
                />
              </>
            )}
            {feedback === null ? (
              <div className={styles.controls}>
                <Button
                  type="primary"
                  onClick={() => void submit()}
                  loading={saving}
                  disabled={!progress.canWrite}
                >
                  提交答案
                </Button>
                <Button
                  onClick={() => setHintOpen((open) => !open)}
                  disabled={saving}
                >
                  {hintOpen ? '收起提示' : '查看提示'}
                </Button>
              </div>
            ) : (
              <div className={styles.result} role="status">
                <strong>
                  {feedback === 'correct' ? '回答正确' : '还不正确，再试一次'}
                </strong>
                <p>
                  {feedback === 'correct'
                    ? question.explanation
                    : `提示：${question.hint}`}
                </p>
                {feedback === 'incorrect' && (
                  <details>
                    <summary>查看答案与解析</summary>
                    <p>
                      参考答案：{correctAnswer(question)}。
                      {question.explanation}
                    </p>
                  </details>
                )}
                <Button
                  onClick={() => {
                    setAnswer('');
                    setFeedback(null);
                    setHintOpen(false);
                    setMessage(null);
                  }}
                  disabled={saving}
                >
                  再做一次
                </Button>
              </div>
            )}
            {hintOpen && feedback === null && (
              <p className={styles.hint}>{question.hint}</p>
            )}
            {message && (
              <p
                className={syncFailed ? styles.error : styles.message}
                role="status"
              >
                {message}
                {syncFailed && mistakeError ? ` ${mistakeError}` : ''}
              </p>
            )}
          </div>
          <div className={styles.history}>
            <strong>本题记录</strong>
            <span>
              {history.length
                ? `已作答 ${history.length} 次，最近一次${last?.correct ? '正确' : '未答对'}。`
                : '还没有作答记录。'}
            </span>
            {last && (
              <button
                type="button"
                onClick={() => void retrySync()}
                disabled={saving || !progress.canWrite}
              >
                同步最近结果到错题本
              </button>
            )}
          </div>
        </section>
      </div>
      <section className={styles.backup} aria-label="练习记录备份">
        <div>
          <strong>练习记录与备份</strong>
          <p>
            题目结果单独存储，不包含在错题本 JSON
            中。导入只合并记录，不自动修改错题本。
          </p>
        </div>
        <div className={styles.backupActions}>
          <Button
            onClick={exportData}
            disabled={!progress.error && progress.attempts.length === 0}
          >
            导出练习记录
          </Button>
          <label className={styles.fileButton}>
            导入练习记录
            <input
              type="file"
              accept=".json,application/json"
              disabled={!progress.canWrite || saving}
              onChange={(event) => void importData(event)}
            />
          </label>
          <Popconfirm
            title="清除全部练习记录？"
            description="只清除练习记录，不删除错题；建议先导出备份。"
            okText="确认清除"
            cancelText="取消"
            onConfirm={() => void resetData()}
          >
            <Button
              danger
              disabled={
                !progress.canWrite ||
                saving ||
                (!progress.error && progress.attempts.length === 0)
              }
            >
              清除记录
            </Button>
          </Popconfirm>
        </div>
      </section>
    </>
  );
}
