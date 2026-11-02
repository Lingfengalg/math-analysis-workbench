import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Input, Segmented } from 'antd';
import { ArrowRightOutlined, SearchOutlined } from '@ant-design/icons';
import { knowledgeCards } from '@/content/knowledge';
import { matchesKnowledgeQuery } from './search';
import { createPlotLink } from '@/shared/navigation/plot-link';
import { Formula } from '@/shared/ui/Formula';
import styles from './KnowledgePage.module.css';

const labels = { limit: '极限', continuity: '连续', derivative: '导数' };

export default function KnowledgePage() {
  const [search, setSearch] = useState('');
  const [params, setParams] = useSearchParams();
  const requestedTopic = params.get('topic') ?? 'all';
  const topic = Object.keys(labels).includes(requestedTopic)
    ? requestedTopic
    : 'all';
  const cards = knowledgeCards.filter(
    (card) =>
      (topic === 'all' || card.topic === topic) &&
      matchesKnowledgeQuery(card, search),
  );
  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <p>数学分析 / 知识导航</p>
        <h1>把条件看清，把概念串起来。</h1>
        <span>先读定义，再检查条件，用例子和反例检验自己的理解。</span>
      </header>
      <div className={styles.notice} role="note">
        <span className={styles.noticeMark} aria-hidden="true">
          i
        </span>
        <p>
          <strong>基础示例：3 张知识卡片</strong>
          <span>
            内容用于演示模块结构，数学内容与参考文献仍需人工核验和完善。
          </span>
        </p>
      </div>
      <div className={styles.toolbar}>
        <Segmented
          aria-label="知识主题"
          value={Object.keys(labels).includes(topic) ? topic : 'all'}
          options={[
            { label: '全部', value: 'all' },
            ...Object.entries(labels).map(([value, label]) => ({
              value,
              label,
            })),
          ]}
          onChange={(value) =>
            setParams(value === 'all' ? {} : { topic: value })
          }
        />
        <Input
          aria-label="搜索知识卡片"
          placeholder="搜索概念、条件、例题或误区"
          prefix={<SearchOutlined />}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          allowClear
        />
      </div>
      <div className={styles.resultsHeader}>
        <h2>知识卡片</h2>
        <span aria-live="polite">{cards.length} 个知识点</span>
      </div>
      <div className={styles.knowledgeList}>
        {cards.map((card) => (
          <article
            key={card.id}
            className={styles.card}
            data-annotation-anchor={`knowledge:${card.id}`}
          >
            <div className={styles.cardMain}>
              <div className={styles.cardHeading}>
                <span className={styles.topic}>{labels[card.topic]}</span>
                <h2>{card.title}</h2>
              </div>
              <p className={styles.definition}>{card.definition}</p>
              <div className={styles.equation}>
                <Formula value={card.formula} />
              </div>
              <section className={styles.conditions}>
                <h3>先检查这些条件</h3>
                <ul>
                  {card.conditions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
              <details className={styles.references}>
                <summary>参考与核验说明</summary>
                {card.references.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </details>
            </div>
            <aside
              className={styles.cardAside}
              aria-label={`${card.title}的例子与提醒`}
            >
              <section className={styles.example}>
                <h3>一个具体例子</h3>
                {card.examples.map((example) => (
                  <div key={example.explanation}>
                    <p>{example.explanation}</p>
                    {example.plot && (
                      <Link
                        className={styles.plotLink}
                        to={createPlotLink(example.plot)}
                      >
                        去绘图中观察 <ArrowRightOutlined />
                      </Link>
                    )}
                  </div>
                ))}
              </section>
              <section className={styles.pitfalls}>
                <h3>容易忽略</h3>
                <ul>
                  {card.pitfalls.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            </aside>
          </article>
        ))}
      </div>
      {cards.length === 0 && (
        <div className={styles.empty}>
          没有找到匹配的知识点，请更换关键词或选择“全部”。
        </div>
      )}
    </div>
  );
}
