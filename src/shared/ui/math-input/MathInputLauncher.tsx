import { lazy, Suspense, useState } from 'react';
import { Button } from 'antd';
import type { MathInputMode } from './conversion';

const MathEditor = lazy(() =>
  import('./MathEditor').catch(() => ({
    default: ({ onClose }: { onClose: () => void }) => (
      <div>
        <p role="alert">数学编辑器加载失败，请继续使用原来的文本输入。</p>
        <Button size="small" onClick={onClose}>
          关闭
        </Button>
      </div>
    ),
  })),
);

export function MathInputLauncher({
  mode,
  value,
  onApply,
  disabled = false,
}: {
  mode: MathInputMode;
  value: string;
  onApply: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      {!open ? (
        <Button size="small" disabled={disabled} onClick={() => setOpen(true)}>
          打开数学编辑器
        </Button>
      ) : (
        <Suspense fallback={<p role="status">正在加载数学编辑器…</p>}>
          <MathEditor
            mode={mode}
            targetValue={value}
            onApply={(next) => {
              onApply(next);
              setOpen(false);
            }}
            onClose={() => setOpen(false)}
            disabled={disabled}
          />
        </Suspense>
      )}
    </div>
  );
}
