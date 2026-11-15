import { useEffect, useRef, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router';
import { GithubOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { modules } from './moduleRegistry';
import { AnnotationOverlay } from '@/shared/annotation/AnnotationOverlay';

export function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const main = useRef<HTMLElement>(null);
  const active = modules.find((module) => module.path === location.pathname);
  useEffect(() => {
    document.title = `${active?.title ?? '页面未找到'} · 析知`;
    main.current?.focus();
    window.scrollTo({ top: 0 });
  }, [location.pathname, active?.title]);

  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          main.current?.focus();
        }}
      >
        跳至主要内容
      </a>
      <aside className="sidebar">
        <NavLink to="/" className="brand" aria-label="析知 首页">
          <span className="brand-symbol">∂</span>
          <span>
            析知<small>数学分析学习工作台</small>
          </span>
        </NavLink>
        <div className="nav-label">学习工具</div>
        <nav aria-label="主导航">
          {modules.map((module) => {
            const Icon = module.Icon;
            return (
              <NavLink
                key={module.id}
                to={module.path}
                end
                aria-label={
                  module.status === 'planned'
                    ? `${module.title}（待开发）`
                    : undefined
                }
                className={({ isActive }) =>
                  `nav-item${isActive ? ' active' : ''}`
                }
              >
                <Icon />
                <span>{module.title}</span>
                {module.status === 'planned' && <small>待开发</small>}
              </NavLink>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="project-note">
            <span className="status-dot" /> 课程示例
            <p>知识、绘图与错题复习</p>
          </div>
          <a
            href="https://github.com/Lingfengalg/math-analysis-workbench"
            target="_blank"
            rel="noreferrer"
          >
            <GithubOutlined /> 开源仓库 <ArrowUpOutlined rotate={45} />
          </a>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            数学分析 <span className="separator">/</span>{' '}
            {active?.title ?? '页面未找到'}
          </span>
          <span className="version-label">课程示例</span>
        </header>
        <main
          id="main-content"
          ref={main}
          tabIndex={-1}
          className="main-content"
        >
          <AnnotationOverlay pageId={location.pathname}>
            {children}
          </AnnotationOverlay>
        </main>
        <footer className="footer">
          <span>析知 · 数学分析</span>
          <span>数值观察 ≠ 数学证明</span>
        </footer>
      </div>
    </div>
  );
}
