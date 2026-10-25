import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Result } from 'antd';

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('工作台页面加载失败', error, info.componentStack);
  }
  render() {
    if (this.state.failed)
      return (
        <Result
          status="error"
          title="这个模块暂时无法加载"
          subTitle="请刷新重试；若问题持续，请向项目提交 Issue。"
          extra={
            <Button onClick={() => window.location.reload()}>刷新页面</Button>
          }
        />
      );
    return this.props.children;
  }
}
