import { lazy, Suspense, type ComponentType } from 'react';
import { HashRouter, Route, Routes, useLocation } from 'react-router';
import { Button, Result, Spin } from 'antd';
import { Link } from 'react-router';
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary';
import { modules, type ModuleId } from '@/shared/navigation/modules';
import { AppLayout } from './AppLayout';

const pages = {
  dashboard: lazy(() => import('@/features/dashboard')),
  knowledge: lazy(() => import('@/features/knowledge')),
  plotting: lazy(() => import('@/features/plotting')),
  mistakes: lazy(() => import('@/features/mistakes')),
  assistant: lazy(() => import('@/features/assistant')),
} satisfies Record<ModuleId, ComponentType>;

function AppRoutes() {
  const location = useLocation();
  return (
    <AppLayout>
      <ErrorBoundary key={location.pathname}>
        <Suspense
          fallback={
            <div className="loading-state">
              <Spin description="正在加载模块…" />
            </div>
          }
        >
          <Routes>
            {modules.map((module) => {
              const Page = pages[module.id];
              return (
                <Route key={module.id} path={module.path} element={<Page />} />
              );
            })}
            <Route
              path="*"
              element={
                <Result
                  status="404"
                  title="没有找到这个页面"
                  subTitle="可以返回工作台，从导航重新开始。"
                  extra={
                    <Link to="/">
                      <Button type="primary">返回工作台</Button>
                    </Link>
                  }
                />
              }
            />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </AppLayout>
  );
}

export function App() {
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}
