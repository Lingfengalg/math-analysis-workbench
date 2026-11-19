import { Link } from 'react-router';
import {
  ArrowRightOutlined,
  BookOutlined,
  LineChartOutlined,
  EditOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { PageHeader } from '@/shared/ui/PageHeader';
import { createKnowledgeLink } from '@/shared/navigation/knowledge-link';
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
    index: '01',
    tag: '读条件',
    title: '核查定义域与充要前提',
    description: '拆解 ε-δ 语言、洛必达与重积分定理边界',
    to: '/knowledge',
  },
  {
    index: '02',
    tag: '看图像',
    title: '三维曲面与体素直观检验',
    description: '对比一元割线、二维曲面与三重积分截面体素',
    to: '/plotting',
  },
  {
    index: '03',
    tag: '记错因',
    title: '按思维盲区归档订正',
    description: '对照记录错误思路与条件核查，一键回跳反例',
    to: '/mistakes',
  },
  {
    index: '04',
    tag: '问助教',
    title: '苏格拉底式条件追问',
    description: '挂载卡片或错题摘要，经服务端安全代理启发推导',
    to: '/assistant',
  },
] as const;

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        eyebrow="∂ · 数分交互研习空间"
        title="让每一次探索，都有迹可循。"
        description="从严格定义出发，借可视化反例审视直觉，再回到条件完备的数学推理。"
      />

      <div className={styles.bentoTop}>
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroGlow} aria-hidden="true" />
          <div className={styles.heroCopy}>
            <span className={styles.heroPill}>经典反例切入 · 连续与可导</span>
            <h2 id="hero-title">
              连续的函数，
              <br />
              就一定可导吗？
            </h2>
            <p>
              观察绝对值函数在原点两侧的差商变化，
              <br />
              把“图像不断开”与“极限存在且相等”区分清楚。
            </p>
            <Link
              className={styles.heroButton}
              to={createKnowledgeLink({
                topic: 'derivative',
                cardId: 'derivative-absolute',
              })}
            >
              探索这个问题 <ArrowRightOutlined />
            </Link>
          </div>
          <div className={styles.graph} aria-hidden="true">
            <svg viewBox="0 0 380 250">
              <defs>
                <linearGradient id="absFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#d9fbe5" stopOpacity="0.24" />
                  <stop offset="100%" stopColor="#d9fbe5" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M24 196 H356 M190 22 V232"
                stroke="rgba(220, 245, 232, 0.28)"
                strokeWidth="1"
              />
              <path
                d="M50 196 L50 56 L190 196 L330 56 L330 196 Z"
                fill="url(#absFill)"
              />
              <path
                d="M90 196 L270 16"
                stroke="rgba(255, 214, 153, 0.5)"
                strokeWidth="1.4"
                strokeDasharray="5 5"
              />
              <path
                d="M290 196 L110 16"
                stroke="rgba(167, 224, 255, 0.5)"
                strokeWidth="1.4"
                strokeDasharray="5 5"
              />
              <path
                d="M50 56 L190 196 L330 56"
                fill="none"
                stroke="#e8f9dc"
                strokeWidth="2.8"
                strokeLinecap="round"
              />
              <circle
                cx="190"
                cy="196"
                r="5.5"
                fill="#0f493d"
                stroke="#e8f9dc"
                strokeWidth="2.5"
              />
              <text
                x="230"
                y="88"
                fill="#eefce6"
                fontSize="21"
                fontFamily="Georgia, serif"
              >
                f(x) = |x|
              </text>
              <text
                x="64"
                y="184"
                fill="rgba(196, 235, 255, 0.85)"
                fontSize="11"
              >
                f&apos;₋(0) = -1
              </text>
              <text
                x="248"
                y="184"
                fill="rgba(255, 226, 176, 0.9)"
                fontSize="11"
              >
                f&apos;₊(0) = +1
              </text>
            </svg>
            <span className={styles.graphNote}>x = 0 处连续，左右差商不等</span>
          </div>
        </section>

        <aside
          className={styles.loopPanel}
          aria-labelledby="learning-loop-title"
        >
          <div className={styles.loopHeader}>
            <h2 id="learning-loop-title">研习路径</h2>
            <span>四模块闭环互通</span>
          </div>
          <div className={styles.loopList}>
            {learningLoopSteps.map((item) => (
              <Link key={item.index} to={item.to} className={styles.loopItem}>
                <span className={styles.loopIndex}>{item.index}</span>
                <div className={styles.loopBody}>
                  <div className={styles.loopTitleRow}>
                    <strong>{item.title}</strong>
                    <span className={styles.loopTag}>{item.tag}</span>
                  </div>
                  <p>{item.description}</p>
                </div>
                <ArrowRightOutlined className={styles.loopArrow} />
              </Link>
            ))}
          </div>
        </aside>
      </div>

      <div className="section-title">
        <h2>工作台模块</h2>
        <span>独立架构边界 · 本地版本化存储</span>
      </div>

      <section className={styles.moduleGrid} aria-label="学习工具">
        {modules
          .filter((module) => module.id !== 'dashboard')
          .map((module) => {
            const Icon = icons[module.id as keyof typeof icons];
            const ready = module.status === 'available';
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
                  <span
                    className={
                      ready ? styles.statusReady : styles.statusPlanned
                    }
                  >
                    {ready ? '已就绪' : '待开发'}
                  </span>
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

      <section className={styles.teamStrip}>
        <p>
          <strong>C4 课程开源协作工程 · v1.0</strong> ·
          知识导航、三维仿真实验室、错题本与苏格拉底 AI
          助教已完整就绪，团队成员可按模块边界继续增补教材引注与实验案例。
        </p>
        <a
          href="https://github.com/Lingfengalg/math-analysis-workbench/blob/main/CONTRIBUTING.md"
          target="_blank"
          rel="noreferrer"
        >
          查看协作约定 <ArrowRightOutlined />
        </a>
      </section>
    </>
  );
}
