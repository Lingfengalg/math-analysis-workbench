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
          colorPrimary: '#0f6a58',
          borderRadius: 12,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Inter", "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
          colorText: '#152823',
          colorTextSecondary: '#4b635b',
          colorBgContainer: 'rgba(255, 255, 255, 0.52)',
          colorBgElevated: 'rgba(255, 255, 255, 0.82)',
          colorBorder: 'rgba(22, 58, 49, 0.14)',
          colorBorderSecondary: 'rgba(255, 255, 255, 0.68)',
          boxShadowSecondary:
            '0 20px 50px -12px rgba(14, 44, 37, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
        },
        components: {
          Card: {
            headerBg: 'transparent',
            colorBgContainer: 'rgba(255, 255, 255, 0.46)',
            borderRadiusLG: 18,
          },
          Input: {
            colorBgContainer: 'rgba(255, 255, 255, 0.56)',
            activeBg: 'rgba(255, 255, 255, 0.82)',
            hoverBg: 'rgba(255, 255, 255, 0.7)',
          },
          InputNumber: {
            colorBgContainer: 'rgba(255, 255, 255, 0.56)',
            activeBg: 'rgba(255, 255, 255, 0.82)',
            hoverBg: 'rgba(255, 255, 255, 0.7)',
          },
          Select: {
            colorBgContainer: 'rgba(255, 255, 255, 0.56)',
          },
          Segmented: {
            trackBg: 'rgba(255, 255, 255, 0.42)',
            itemSelectedBg: 'rgba(255, 255, 255, 0.88)',
            itemSelectedColor: '#0f6a58',
          },
          Button: {
            defaultBg: 'rgba(255, 255, 255, 0.54)',
            defaultBorderColor: 'rgba(255, 255, 255, 0.8)',
            defaultHoverBg: 'rgba(255, 255, 255, 0.8)',
          },
          Modal: {
            contentBg: 'rgba(248, 252, 250, 0.82)',
            headerBg: 'transparent',
          },
        },
      }}
    >
      <App />
    </ConfigProvider>
  </StrictMode>,
);
