import { z } from 'zod';
import { knowledgeCardSchema } from '@/shared/contracts';

// Starter examples only; the course team must independently review and expand.
export const knowledgeCards = z.array(knowledgeCardSchema).parse([
  {
    id: 'limit-square',
    topic: 'limit',
    title: '函数极限：靠近，而非到达',
    definition:
      '当 x 在去心邻域内趋近 a 时，若函数值可以任意接近 L，则称 L 为该函数在 a 处的极限。函数在 a 处可以没有定义。',
    formula: '\\lim_{x\\to a} f(x)=L',
    conditions: [
      '在 a 的某个去心邻域内有定义。',
      '两侧极限都存在且相等时，双侧极限才存在。',
    ],
    examples: [
      {
        explanation: '观察 x² 在 x 趋近 1 时的变化，其函数值趋近 1。',
        plot: {
          expression: 'x^2',
          xMin: -2,
          xMax: 3,
          sourceKnowledgeId: 'limit-square',
        },
      },
    ],
    pitfalls: [
      '不能仅凭图像或有限次采样证明极限存在。',
      '极限存在不要求 f(a) 等于该极限，甚至不要求 f(a) 有定义。',
    ],
    references: [
      '参考主题：函数极限的 ε-δ 定义；提交前由组员对照本课程教材补充版本与页码。',
    ],
  },
  {
    id: 'continuity-reciprocal',
    topic: 'continuity',
    title: '连续性：先检查定义域',
    definition:
      '设 D 是函数定义域，a ∈ D。若对任意 ε > 0，都存在 δ > 0，使定义域内满足 |x − a| < δ 的 x 均有 |f(x) − f(a)| < ε，则称函数在 a 处连续。',
    formula: 'x\\in D,\\quad |x-a|<\\delta\\implies |f(x)-f(a)|<\\varepsilon',
    conditions: [
      'a 是函数定义域中的点。',
      '当 a 是定义域的聚点时，连续等价于按定义域取值趋近 a 的函数极限等于 f(a)。',
      '区间端点通常使用对应的单侧极限；定义域的孤立点按上述相对定义域的定义连续，不使用去心极限刻画。',
    ],
    examples: [
      {
        explanation:
          '1/x 在 (-∞, 0) 与 (0, +∞) 上连续，但 0 不在定义域中，不能说它在 0 点连续。',
        plot: {
          expression: '1/x',
          xMin: -5,
          xMax: 5,
          sourceKnowledgeId: 'continuity-reciprocal',
        },
      },
      {
        explanation:
          '例如函数 f(x) = x 的定义域为 {0} ∪ [1, 2]，0 是定义域的孤立点；按相对定义域的 ε-δ 定义，f 在 0 处连续。',
      },
    ],
    pitfalls: [
      '图中看起来平滑不代表已证明连续。',
      '不能不加条件地用去心极限刻画孤立点处的连续性。',
      '绘图不得把 1/x 在 0 两侧的分支直接相连。',
    ],
    references: [
      '参考主题：函数连续性与定义域；提交前对照本课程教材补充引用。',
    ],
  },
  {
    id: 'derivative-absolute',
    topic: 'derivative',
    title: '可导与连续：逆命题不成立',
    definition: '导数是差商的极限。内点处可导必连续，但连续不一定可导。',
    formula: "f'(a)=\\lim_{h\\to0}\\frac{f(a+h)-f(a)}{h}",
    conditions: ['函数在 a 附近有定义。', '差商的左右极限存在、有限且相等。'],
    examples: [
      {
        explanation:
          '|x| 在 0 处连续，左导数为 -1，右导数为 1，因此在 0 处不可导。',
        plot: {
          expression: 'abs(x)',
          xMin: -3,
          xMax: 3,
          sourceKnowledgeId: 'derivative-absolute',
        },
      },
    ],
    pitfalls: [
      '不能把“可导必连续”倒过来使用。',
      '数值差商只是观察工具，不能替代极限论证。',
    ],
    references: [
      '参考主题：导数定义及可导与连续的关系；提交前对照本课程教材补充引用。',
    ],
  },
]);
