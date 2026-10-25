import { Link } from 'react-router';
import {
  ArrowRightOutlined,
  BookOutlined,
  LineChartOutlined,
  EditOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { Tag } from 'antd';
import { PageHeader } from '@/shared/ui/PageHeader';
import { modules } from '@/shared/navigation/modules';
import styles from './DashboardPage.module.css';

const icons = {
  knowledge: BookOutlined,
  plotting: LineChartOutlined,
  mistakes: EditOutlined,
  assistant: RobotOutlined,
};

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        eyebrow="YOUR MATHEMATICS, CONNECTED"
        title="让每一次探索，都有迹可循。"
        description="从定义出发，用图像观察，再回到严谨的数学推理。"
      />
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <span className={styles.heroLabel}>从一个好问题开始</span>
          <h2 id="hero-title">
            连续的函数，
            <br />
            就一定可导吗？
          </h2>
          <p>
            观察绝对值函数在原点附近的变化，
            <br />
            把“看起来如此”变成“为什么如此”。
          </p>
          <Link className={styles.heroButton} to="/knowledge?topic=derivative">
            探索这个问题 <ArrowRightOutlined />
          </Link>
        </div>
        <div className={styles.graph} aria-hidden="true">
          <div className={styles.graphGrid} />
          <svg viewBox="0 0 420 260">
            <path
              d="M25 205 H400 M210 20 V245"
              stroke="#a6c4b5"
              strokeWidth="1"
            />
            <path
              d="M48 42 L210 205 L372 42"
              fill="none"
              stroke="#e5f6d2"
              strokeWidth="3"
            />
            <circle cx="210" cy="205" r="5" fill="#e5f6d2" />
            <text
              x="252"
              y="94"
              fill="#e5f6d2"
              fontSize="25"
              fontFamily="Georgia,serif"
            >
              f(x) = |x|
            </text>
            <text x="218" y="228" fill="#b9d2c4" fontSize="12">
              0
            </text>
          </svg>
          <span className={styles.graphNote}>在 0 处连续，但不可导</span>
        </div>
      </section>
      <div className="section-title">
        <h2>你的学习工具</h2>
        <span>独立模块 · 在同一工作台连接</span>
      </div>
      <section className={styles.moduleGrid} aria-label="学习工具">
        {modules
          .filter((module) => module.id !== 'dashboard')
          .map((module, index) => {
            const Icon = icons[module.id as keyof typeof icons];
            return (
              <Link
                to={module.path}
                key={module.id}
                className={styles.moduleCard}
              >
                <div className={styles.cardTop}>
                  <span className={styles.moduleIcon}>
                    <Icon />
                  </span>
                  <Tag
                    color={module.status === 'available' ? 'green' : 'default'}
                  >
                    {module.status === 'available' ? '示例可用' : '待开发'}
                  </Tag>
                </div>
                <span className={styles.moduleNumber}>MODULE 0{index + 1}</span>
                <h3>{module.title}</h3>
                <p>{module.caption}</p>
                <span className={styles.cardLink}>
                  进入模块 <ArrowRightOutlined />
                </span>
              </Link>
            );
          })}
      </section>
      <section className={styles.teamNote}>
        <div>
          <span className="eyebrow">BUILT TOGETHER</span>
          <h2>一个工作台，多个人一起完善。</h2>
          <p>
            目前提供基础工程与示例内容，不代表课程作品已完成。团队可在独立模块中开发，通过
            PR 集成。
          </p>
        </div>
        <a
          href="https://github.com/Lingfengalg/math-analysis-workbench/blob/main/CONTRIBUTING.md"
          target="_blank"
          rel="noreferrer"
        >
          查看开发约定 <ArrowRightOutlined />
        </a>
      </section>
    </>
  );
}
