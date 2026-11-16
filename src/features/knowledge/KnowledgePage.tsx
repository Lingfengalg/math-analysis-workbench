import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button, Card, Input, Segmented, Tag } from 'antd';
import {
  ArrowRightOutlined,
  CompassOutlined,
  EditOutlined,
  LinkOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { knowledgeCards } from '@/content/knowledge';
import {
  KNOWLEDGE_TOPIC_LABELS,
  type KnowledgeCard,
  type KnowledgeTopic,
} from '@/shared/contracts';
import {
  createKnowledgeLink,
  parseKnowledgeSearch,
} from '@/shared/navigation/knowledge-link';
import { createMistakeDraftLink } from '@/shared/navigation/mistake-link';
import { createPlotLink } from '@/shared/navigation/plot-link';
import { Formula } from '@/shared/ui/Formula';
import { PageHeader } from '@/shared/ui/PageHeader';
import styles from './KnowledgePage.module.css';

const labels = KNOWLEDGE_TOPIC_LABELS;

const cardById = new Map<string, KnowledgeCard>(
  knowledgeCards.map((card) => [card.id, card]),
);

function matchesCardSearch(card: KnowledgeCard, rawQuery: string): boolean {
  const tokens = rawQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  const searchableText = [
    card.title,
    card.definition,
    card.formula,
    ...card.conditions,
    ...card.pitfalls,
    ...card.examples.flatMap((example) => [
      example.explanation,
      example.plot?.expression ?? '',
      example.plot?.compareExpression ?? '',
    ]),
  ]
    .join(' ')
    .toLowerCase();

  return tokens.every((token) => searchableText.includes(token));
}

export default function KnowledgePage() {
  const [search, setSearch] = useState('');
  const [params, setParams] = useSearchParams();
  const { topic, cardId } = parseKnowledgeSearch(params);

  const focusedCard = cardId ? cardById.get(cardId) : undefined;

  const cards = useMemo(() => {
    if (focusedCard && !search.trim()) {
      return [focusedCard];
    }
    return knowledgeCards.filter(
      (card) =>
        (topic === 'all' || card.topic === topic) &&
        matchesCardSearch(card, search),
    );
  }, [focusedCard, search, topic]);

  const handleTopicChange = (value: string | number) => {
    const nextTopic = String(value);
    if (nextTopic === 'all') {
      setParams({});
    } else {
      setParams({ topic: nextTopic });
    }
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (params.has('card')) {
      const next = new URLSearchParams(params);
      next.delete('card');
      setParams(next);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="ε-δ · 定理与反例图谱"
        title="把条件看清，把概念串起来。"
        description="先读定义，再检查条件，用正例、反例与关联知识图谱检验自己的理解。"
      />
      <div className={styles.metaRibbon}>
        <span className={styles.metaBadge}>
          12 张核心知识卡片 · 5 大数分板块
        </span>
        <span className={styles.metaHint}>
          覆盖数列极限、函数极限、连续性、导数与微分、积分学 ·
          图像与数值观察不能替代严格数学证明
        </span>
      </div>

      {focusedCard && !search.trim() && (
        <div className={styles.focusBanner} role="status">
          <span className={styles.focusTitle}>
            <CompassOutlined />
            当前聚焦知识卡片：{focusedCard.title}
          </span>
          <Button size="small" onClick={() => setParams({})}>
            查看全部知识卡片
          </Button>
        </div>
      )}

      <div className={styles.filterBar}>
        <div className={styles.segmentedWrap}>
          <Segmented
            aria-label="知识主题"
            value={
              focusedCard && !search.trim()
                ? focusedCard.topic
                : (topic as KnowledgeTopic | 'all')
            }
            options={[
              { label: '全部', value: 'all' },
              ...Object.entries(labels).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
            onChange={handleTopicChange}
          />
        </div>
        <Input
          className={styles.searchInput}
          aria-label="搜索知识卡片"
          placeholder="搜索概念或关键词"
          prefix={<SearchOutlined />}
          value={search}
          onChange={(event) => handleSearchChange(event.target.value)}
          allowClear
        />
      </div>

      <div className={styles.resultMeta}>
        <span>
          当前展示 {cards.length} / {knowledgeCards.length} 张知识卡片
        </span>
        {search.trim() && (
          <span>支持标题、条件、易错点、公式与函数表达式检索</span>
        )}
      </div>

      <div
        className={`${styles.cardGrid} ${
          focusedCard && !search.trim() ? styles.cardGridSingle : ''
        }`}
      >
        {cards.map((card) => {
          const relatedCards = card.relatedIds
            .map((id) => cardById.get(id))
            .filter((item): item is KnowledgeCard => Boolean(item));
          const primaryPlot = card.examples[0]?.plot;
          const mistakeDraftUrl = createMistakeDraftLink({
            topic: card.topic,
            relatedKnowledgeId: card.id,
            expression: primaryPlot?.expression,
            xMin: primaryPlot?.xMin,
            xMax: primaryPlot?.xMax,
          });

          return (
            <Card
              key={card.id}
              className={`${styles.knowledgeCard} ${
                focusedCard?.id === card.id ? styles.knowledgeCardFocused : ''
              }`}
              title={card.title}
              extra={
                <Tag className={styles.topicTag}>{labels[card.topic]}</Tag>
              }
            >
              <p className={styles.bodyText}>{card.definition}</p>
              <Formula value={card.formula} />

              <h3 className={styles.detailHeading}>先检查这些条件</h3>
              <ul className={styles.detailList}>
                {card.conditions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>

              <h3 className={styles.detailHeading}>典型示例与反例辨析</h3>
              <div className={styles.exampleList}>
                {card.examples.map((example) => {
                  const isCounterexample = example.kind === 'counterexample';
                  return (
                    <div
                      key={example.explanation}
                      className={`${styles.exampleBox} ${
                        isCounterexample ? styles.counterexampleBox : ''
                      }`}
                    >
                      <div className={styles.exampleHeader}>
                        {isCounterexample ? (
                          <Tag color="orange">反例警示</Tag>
                        ) : (
                          <Tag color="green">典型正例</Tag>
                        )}
                        {example.plot && (
                          <code className={styles.expressionCode}>
                            f(x) = {example.plot.expression}
                            {example.plot.compareExpression
                              ? ` , g(x) = ${example.plot.compareExpression}`
                              : ''}
                          </code>
                        )}
                      </div>
                      <p className={styles.bodyText}>{example.explanation}</p>
                      {example.plot && (
                        <Link
                          className={styles.plotAction}
                          to={createPlotLink(example.plot)}
                        >
                          去绘图中观察 <ArrowRightOutlined />
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>

              <h3 className={styles.detailHeading}>容易忽略</h3>
              <ul className={styles.detailList}>
                {card.pitfalls.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>

              {relatedCards.length > 0 && (
                <div className={styles.relatedSection}>
                  <h4 className={styles.relatedHeading}>关联概念</h4>
                  <div className={styles.relatedLinks}>
                    {relatedCards.map((target) => (
                      <Link
                        key={target.id}
                        className={styles.relatedLink}
                        to={createKnowledgeLink({
                          topic: target.topic,
                          cardId: target.id,
                        })}
                      >
                        <LinkOutlined />
                        {labels[target.topic]} · {target.title}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              <div className={styles.cardFooter}>
                <details className={styles.references}>
                  <summary>参考与核验说明</summary>
                  {card.references.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </details>
                <Link className={styles.mistakeAction} to={mistakeDraftUrl}>
                  <EditOutlined /> 记入错题本
                </Link>
              </div>
            </Card>
          );
        })}
      </div>

      {cards.length === 0 && (
        <div className={styles.emptyState}>
          没有找到匹配的知识点，请更换关键词或选择“全部”。
        </div>
      )}
    </>
  );
}
