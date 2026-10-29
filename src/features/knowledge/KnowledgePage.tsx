import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Alert, Card, Input, Segmented, Tag } from 'antd';
import { ArrowRightOutlined, SearchOutlined } from '@ant-design/icons';
import { knowledgeCards } from '@/content/knowledge';
import { matchesKnowledgeQuery } from './search';
import { createPlotLink } from '@/shared/navigation/plot-link';
import { Formula } from '@/shared/ui/Formula';
import { PageHeader } from '@/shared/ui/PageHeader';

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
    <>
      <PageHeader
        eyebrow="KNOWLEDGE EXPLORER"
        title="把条件看清，把概念串起来。"
        description="先读定义，再检查条件，用例子和反例检验自己的理解。"
      />
      <Alert
        type="info"
        showIcon
        title="基础示例：3 张知识卡片"
        description="内容用于演示模块结构。组员仍需人工核验数学内容、完善参考文献并扩充知识点。"
      />
      <div className="filter-bar">
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
      <div className="knowledge-grid">
        {cards.map((card) => (
          <Card
            key={card.id}
            data-annotation-anchor={`knowledge:${card.id}`}
            title={card.title}
            extra={<Tag>{labels[card.topic]}</Tag>}
          >
            <p className="body-text">{card.definition}</p>
            <Formula value={card.formula} />
            <h3 className="detail-heading">先检查这些条件</h3>
            <ul className="detail-list">
              {card.conditions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <h3 className="detail-heading">一个具体例子</h3>
            {card.examples.map((example) => (
              <div key={example.explanation}>
                <p className="body-text">{example.explanation}</p>
                {example.plot && (
                  <Link
                    className="inline-action"
                    to={createPlotLink(example.plot)}
                  >
                    去绘图中观察 <ArrowRightOutlined />
                  </Link>
                )}
              </div>
            ))}
            <h3 className="detail-heading">容易忽略</h3>
            <ul className="detail-list">
              {card.pitfalls.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <details className="references">
              <summary>参考与核验说明</summary>
              {card.references.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </details>
          </Card>
        ))}
      </div>
      {cards.length === 0 && (
        <div className="empty-state">
          没有找到匹配的知识点，请更换关键词或选择“全部”。
        </div>
      )}
    </>
  );
}
