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

const learningLoopSteps = [
  {
    step: 'STEP 01 · 读条件',
    title: '核查定义域与定理充要前提',
    description:
      '进入知识导航拆解 ε-δ 语言、洛必达法则与牛顿-莱布尼茨公式的成立边界，警惕“把必要条件当充分条件”。',
    actionLabel: '前往知识导航',
    to: '/knowledge',
  },
  {
    step: 'STEP 02 · 看图像',
    title: '用反例曲线与割线检验直觉',
    description:
      '将抽象表达式送入函数实验室观察局部振荡、无穷奇点与尖点左右斜率，理解有限采样观察与严格证明的分界。',
    actionLabel: '前往绘图计算',
    to: '/plotting',
  },
  {
    step: 'STEP 03 · 记错因',
    title: '按思维盲区归档并沉淀订正',
    description:
      '在错题本中对照记录“当时的错误思路”与“严谨条件核查”，一键回跳关联概念与反例图像，形成个人复盘闭环。',
    actionLabel: '前往错题本',
    to: '/mistakes',
  },
] as const;

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
                    {module.status === 'available' ? '已就绪' : '待开发'}
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

      <section
        className={styles.loopSection}
        aria-labelledby="learning-loop-title"
      >
        <div className={styles.loopHeader}>
          <div>
            <span className="eyebrow">THREE-STEP LEARNING LOOP</span>
            <h2 id="learning-loop-title">
              三步学习闭环：读条件 → 看图像 → 记错因
            </h2>
          </div>
          <span className={styles.loopCaption}>
            在知识卡片、函数实验室与错题本之间自由跳转
          </span>
        </div>
        <div className={styles.loopGrid}>
          {learningLoopSteps.map((item) => (
            <div key={item.step} className={styles.loopCard}>
              <span className={styles.loopStepBadge}>{item.step}</span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <Link className={styles.loopAction} to={item.to}>
                {item.actionLabel} <ArrowRightOutlined />
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.teamNote}>
        <div>
          <span className="eyebrow">BUILT TOGETHER</span>
          <h2>一个工作台，多个人一起完善。</h2>
          <p>
            三大核心学习模块已打通跨路由参数联动与本地版本化存储。团队成员可继续扩充课程例题、严谨引用与服务端助教能力。
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
