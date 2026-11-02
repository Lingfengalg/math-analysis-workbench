import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import 'antd/dist/reset.css';
import 'katex/dist/katex.min.css';
import '@/shared/styles/global.css';
import { App } from '@/app/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#485bb2',
          borderRadius: 10,
          fontFamily: 'Inter, "PingFang SC", "Microsoft YaHei", sans-serif',
          colorText: '#202b41',
          colorBorderSecondary: '#e2e6ef',
        },
      }}
    >
      <App />
    </ConfigProvider>
  </StrictMode>,
);
