import { Link } from 'react-router';
import { ArrowRightOutlined } from '@ant-design/icons';
import { Tag } from 'antd';
import type { NavigationModule } from '@/shared/navigation/modules';
import styles from './DashboardPage.module.css';

const examplePlot = '/plotting?expression=abs%28x%29&xMin=-5&xMax=5';

export default function DashboardPage({
  modules,
}: {
  modules: readonly NavigationModule[];
}) {
  return (
    <>
      <header className={styles.heading}>
        <div>
          <p className={styles.subject}>工科数学分析 · 学习工具</p>
          <h1>数学分析学习工作台</h1>
          <p className={styles.intro}>
            查概念、画函数、练习和复习错题，把学习中的问题放在一起解决。
          </p>
        </div>
        <span className={styles.scope}>当前为课程示例，内容持续完善中</span>
      </header>

      <div className={styles.workspace}>
        <section className={styles.tools} aria-label="学习工具">
          <div className={styles.sectionHeading}>
            <div>
              <h2>开始学习</h2>
              <p>选择你现在想做的事</p>
            </div>
          </div>
          <div className={styles.moduleGrid}>
            {modules.map((module) => {
              const Icon = module.Icon;
              return (
                <Link
                  to={module.path}
                  key={module.id}
                  className={styles.moduleCard}
                >
                  <span className={styles.moduleIcon}>
                    <Icon />
                  </span>
                  <span className={styles.moduleBody}>
                    <span className={styles.moduleTitle}>
                      {module.title}{' '}
                      <Tag
                        color={
                          module.status === 'available' ? 'geekblue' : 'default'
                        }
                      >
                        {module.status === 'available' ? '示例可用' : '待开发'}
                      </Tag>
                    </span>
                    <span className={styles.moduleCaption}>
                      {module.caption}
                    </span>
                  </span>
                  <ArrowRightOutlined className={styles.arrow} />
                </Link>
              );
            })}
          </div>
          <p className={styles.privacy}>
            错题和练习记录保存在当前浏览器；清除浏览器数据前请先导出备份。
          </p>
        </section>

        <section className={styles.example} aria-labelledby="example-title">
          <div className={styles.exampleHead}>
            <span>从一个例子开始</span>
            <span>导数与连续</span>
          </div>
          <h2 id="example-title">连续的函数一定可导吗？</h2>
          <p>观察 f(x) = |x| 在原点的左右变化，理解可导与连续的区别。</p>
          <figure className={styles.graph} aria-labelledby="graph-caption">
            <div className={styles.graphTitle}>
              <span>绝对值函数</span>
              <span>f(x) = |x|</span>
            </div>
            <svg viewBox="0 0 420 220" aria-hidden="true">
              <path
                d="M22 180 H398 M210 12 V205"
                stroke="#9aa7b4"
                strokeWidth="1"
              />
              <path
                d="M48 18 L210 180 L372 18"
                fill="none"
                stroke="#35567e"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <circle cx="210" cy="180" r="5" fill="#c37c32" />
              <text x="221" y="198" fill="#667482" fontSize="12">
                0
              </text>
            </svg>
            <figcaption id="graph-caption">
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
          <div className={styles.exampleActions}>
            <Link to="/knowledge?topic=derivative">
              探索这个问题 <ArrowRightOutlined />
            </Link>
            <Link to={examplePlot}>
              在绘图中观察 <ArrowRightOutlined />
            </Link>
          </div>
        </section>
      </div>
      <p className={styles.note}>
        图像有助于观察，但数值结果不能代替数学证明。
      </p>
    </>
  );
}
