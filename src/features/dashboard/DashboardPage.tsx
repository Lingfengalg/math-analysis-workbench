import { Link } from 'react-router';
import {
  ArrowRightOutlined,
  BookOutlined,
  LineChartOutlined,
  EditOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { Tag } from 'antd';
import { modules } from '@/shared/navigation/modules';
import styles from './DashboardPage.module.css';

const examplePlot = '/plotting?expression=abs%28x%29&xMin=-5&xMax=5';

const icons = {
  knowledge: BookOutlined,
  plotting: LineChartOutlined,
  mistakes: EditOutlined,
  assistant: RobotOutlined,
};

export default function DashboardPage() {
  return (
    <>
      <header className={styles.pageHeading}>
        <p>数学分析学习工作台</p>
        <h1>让每一次探索，都有迹可循。</h1>
        <span>从定义出发，用图像观察，再回到严谨的数学推理。</span>
      </header>
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <span className={styles.heroLabel}>从一个反例开始</span>
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
          <div className={styles.heroActions}>
            <Link
              className={styles.heroButton}
              to="/knowledge?topic=derivative"
            >
              探索这个问题 <ArrowRightOutlined />
            </Link>
            <Link className={styles.heroSecondary} to={examplePlot}>
              在绘图中观察 <ArrowRightOutlined />
            </Link>
          </div>
        </div>
        <figure className={styles.graph} aria-labelledby="graph-caption">
          <div className={styles.graphGrid} aria-hidden="true" />
          <div className={styles.graphHeader}>
            <span>绝对值函数</span>
            <span className={styles.formula}>f(x) = |x|</span>
          </div>
          <svg viewBox="0 0 420 240" aria-hidden="true">
            <path
              d="M25 192 H400 M210 12 V220"
              stroke="#a7b4cf"
              strokeWidth="1"
            />
            <path
              d="M50 32 L210 192 L370 32"
              fill="none"
              stroke="#485bb2"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle cx="210" cy="192" r="5" fill="#485bb2" />
            <circle
              cx="210"
              cy="192"
              r="10"
              fill="none"
              stroke="#485bb2"
              strokeOpacity=".25"
            />
            <text x="219" y="212" fill="#62708d" fontSize="12">
              0
            </text>
          </svg>
          <figcaption id="graph-caption" className={styles.graphCaption}>
            <span>在 x = 0 处</span>
            <strong>连续，但不可导</strong>
          </figcaption>
          <div className={styles.derivatives} aria-label="原点处的单侧导数">
            <span>
              左导数 <strong>−1</strong>
            </span>
            <span>
              右导数 <strong>+1</strong>
            </span>
          </div>
        </figure>
      </section>
      <section className={styles.learningPath} aria-label="探索路径">
        <div className={styles.pathIntro}>
          <h2>理解一个问题</h2>
          <span>从观察，到思考。</span>
        </div>
        <ol>
          <li>
            <strong>01</strong>
            <span>
              读懂概念<small>从定义与条件出发</small>
            </span>
          </li>
          <li>
            <strong>02</strong>
            <span>
              观察变化<small>用图像检验直觉</small>
            </span>
          </li>
          <li>
            <strong>03</strong>
            <span>
              记录思考<small>回到推理与复习</small>
            </span>
          </li>
        </ol>
      </section>
      <div className={styles.sectionHeading}>
        <h2>你的学习工具</h2>
        <p>从想做的事开始，选择一个工具。</p>
      </div>
      <section className={styles.moduleGrid} aria-label="学习工具">
        {modules
          .filter((module) => module.id !== 'dashboard')
          .map((module) => {
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
                    color={
                      module.status === 'available' ? 'geekblue' : 'default'
                    }
                  >
                    {module.status === 'available' ? '示例可用' : '待开发'}
                  </Tag>
                </div>
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
