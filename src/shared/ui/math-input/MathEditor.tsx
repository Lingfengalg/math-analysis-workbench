import {
  createElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Button } from 'antd';
import {
  MathfieldElement,
  convertAsciiMathToLatex,
  convertLatexToAsciiMath,
} from 'mathlive';
import 'mathlive/fonts.css';
import {
  calculatePlot,
  calculateSequence,
  verifyMathEditorRoundtrip,
} from '@/shared/math/client';
import {
  convertMathInput,
  toEditorAscii,
  type MathInputMode,
} from './conversion';
import styles from './MathEditor.module.css';

// 字体由 Vite 打包到本地；禁用 MathLive 默认的声音资源请求。
MathfieldElement.fontsDirectory = null;
MathfieldElement.soundsDirectory = null;

export default function MathEditor({
  mode,
  targetValue,
  onApply,
  onClose,
  disabled,
}: {
  mode: MathInputMode;
  targetValue: string;
  onApply: (value: string) => void;
  onClose: () => void;
  disabled: boolean;
}) {
  const field = useRef<MathfieldElement | null>(null);
  const latestTarget = useRef(targetValue);
  const request = useRef<AbortController | null>(null);
  const [latex, setLatex] = useState('');
  const [ascii, setAscii] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [checking, setChecking] = useState(false);
  useLayoutEffect(() => {
    latestTarget.current = targetValue;
  }, [targetValue]);
  useEffect(() => () => request.current?.abort(), []);

  let candidate = '';
  try {
    if (latex) candidate = convertMathInput(latex, ascii, mode);
  } catch {
    /* 编辑中可以尚不完整 */
  }
  const insert = (template: string) => {
    field.current?.focus();
    field.current?.executeCommand(['insert', template]);
  };
  const importOriginal = async () => {
    if (
      !field.current ||
      checking ||
      disabled ||
      field.current.getValue('latex')
    )
      return;
    const snapshot = latestTarget.current;
    const controller = new AbortController();
    request.current = controller;
    setChecking(true);
    setError('');
    setNotice('');
    try {
      const source = toEditorAscii(snapshot);
      const proposed = convertAsciiMathToLatex(source);
      const converted = convertMathInput(
        proposed,
        convertLatexToAsciiMath(proposed),
        mode,
      );
      if (mode === 'numeric') {
        if (converted !== snapshot.replace(/\s+/g, ''))
          throw new Error('原答案暂不能安全载入。');
      } else {
        await verifyMathEditorRoundtrip(
          snapshot,
          converted,
          mode === 'function' ? 'x' : 'n',
          controller.signal,
        );
      }
      if (controller.signal.aborted) return;
      if (
        latestTarget.current !== snapshot ||
        !field.current ||
        field.current.getValue('latex')
      )
        throw new Error('校验期间原输入或编辑器已更改，未载入。');
      field.current.setValue(proposed);
      const actualLatex = field.current.getValue('latex');
      const actualAscii = field.current.getValue('ascii-math');
      try {
        if (convertMathInput(actualLatex, actualAscii, mode) !== converted)
          throw new Error('转换结果不同');
      } catch {
        field.current.setValue('');
        throw new Error('编辑器转换结果与校验结果不一致，未载入。');
      }
      setLatex(actualLatex);
      setAscii(actualAscii);
      setNotice('已载入原输入；原文本不会改变，确认后才会替换。');
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(
          `${reason instanceof Error ? reason.message : '无法载入原输入。'} 原输入未更改。`,
        );
    } finally {
      if (!controller.signal.aborted) setChecking(false);
      if (request.current === controller) request.current = null;
    }
  };
  const apply = async () => {
    if (!field.current || checking || disabled) return;
    const snapshot = latestTarget.current;
    let expression: string;
    try {
      expression = convertMathInput(
        field.current.getValue('latex'),
        field.current.getValue('ascii-math'),
        mode,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '公式无法转换。');
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setChecking(true);
    setError('');
    try {
      if (mode !== 'numeric')
        await verifyMathEditorRoundtrip(
          expression,
          expression,
          mode === 'function' ? 'x' : 'n',
          controller.signal,
        );
      if (mode === 'function')
        await calculatePlot(
          { expression, xMin: -1, xMax: 1 },
          controller.signal,
        );
      if (mode === 'sequence')
        await calculateSequence({ expression, terms: 2 }, controller.signal);
      if (controller.signal.aborted) return;
      if (latestTarget.current !== snapshot) {
        setError('原输入在校验期间已更改，未覆盖；请重新确认。');
        return;
      }
      onApply(expression);
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(reason instanceof Error ? reason.message : '公式未通过校验。');
    } finally {
      if (!controller.signal.aborted) setChecking(false);
      if (request.current === controller) request.current = null;
    }
  };
  return (
    <section className={styles.editor} aria-label="数学公式编辑器">
      <div className={styles.heading}>
        <strong>数学编辑器</strong>
        <span>可从空白开始，或载入兼容的原输入</span>
      </div>
      <div className={styles.tools} aria-label="数学符号工具">
        <Button
          size="small"
          disabled={disabled || checking || Boolean(latex)}
          onClick={() => void importOriginal()}
        >
          载入原输入
        </Button>
        <Button
          size="small"
          disabled={disabled || checking}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => insert('\\frac{#@}{#?}')}
        >
          分数
        </Button>
        {mode !== 'numeric' && (
          <>
            <Button
              size="small"
              disabled={disabled || checking}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insert('#@^{#?}')}
            >
              幂
            </Button>
            <Button
              size="small"
              disabled={disabled || checking}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insert('\\sqrt{#@}')}
            >
              根号
            </Button>
            <Button
              size="small"
              disabled={disabled || checking}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insert('\\sin\\left(#@\\right)')}
            >
              sin
            </Button>
            <Button
              size="small"
              disabled={disabled || checking}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insert('\\pi')}
            >
              π
            </Button>
          </>
        )}
      </div>
      {createElement('math-field', {
        ref: field,
        className: styles.mathfield,
        'aria-label': '输入数学公式',
        'math-virtual-keyboard-policy': 'auto',
        readOnly: disabled || checking,
        onInput: (event: React.FormEvent<MathfieldElement>) => {
          const input = event.currentTarget;
          setLatex(input.getValue('latex'));
          setAscii(input.getValue('ascii-math'));
          setError('');
          setNotice('');
        },
      })}
      <p className={styles.description}>
        {mode === 'numeric'
          ? '支持整数、小数和整数分数。'
          : `支持四则运算、π、幂、分数、根号、三角函数、反三角函数和 ln；自变量使用 ${mode === 'function' ? 'x' : 'n'}。`}
      </p>
      {mode !== 'numeric' && (
        <p className={styles.description}>
          请使用乘号明确相乘；清空当前公式后才能载入原输入，回填暂不支持
          abs、科学计数法。原表达式 log(x) 按自然对数载入为
          ln(x)，不接受含糊底数的 log 记号。
        </p>
      )}
      {notice && (
        <p className={styles.description} role="status">
          {notice}
        </p>
      )}
      {candidate && (
        <p className={styles.preview}>
          转换结果：<code>{candidate}</code>
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <Button
          type="primary"
          size="small"
          loading={checking}
          disabled={disabled}
          onClick={() => void apply()}
        >
          替换原输入
        </Button>
        <Button size="small" disabled={checking} onClick={onClose}>
          取消
        </Button>
      </div>
    </section>
  );
}
