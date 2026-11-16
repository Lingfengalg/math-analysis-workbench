import { z } from 'zod';
import { mistakeItemSchema, type MistakeItem } from '@/shared/contracts';

export const starterMistakes: MistakeItem[] = z.array(mistakeItemSchema).parse([
  {
    id: 'mistake-lhopital-oscillation',
    title: '误用洛必达法则判定振荡型极限不存在',
    topic: 'derivative',
    errorTag: 'condition-misused',
    status: 'unresolved',
    prompt:
      '求极限 lim(x → +∞) (x + sin x) / x，并判断能否直接由分子分母求导后极限不存在断定原极限不存在。',
    formula: '\\lim_{x\\to+\\infty}\\frac{x+\\sin x}{x}=1',
    myAttempt:
      '见到 ∞/∞ 型未定式便直接上下求导，得到 lim(x → +∞) (1 + cos x) / 1；因 cos x 持续振荡无极限，于是断定原极限不存在。',
    correction:
      '洛必达法则要求“导数之比的极限存在（或为无穷大）”作为充分条件；当导数比极限振荡不存在时法则失效，不能反推原极限不存在。应提取主部 (x + sin x) / x = 1 + (sin x) / x，由 |sin x| ≤ 1 及有界量乘无穷小得极限为 1。',
    relatedKnowledgeId: 'derivative-lhopital',
    counterexamplePlot: {
      expression: '(x + sin(x)) / x',
      xMin: 1,
      xMax: 40,
      yMin: 0,
      yMax: 2,
      sourceMistakeId: 'mistake-lhopital-oscillation',
    },
    createdAt: '2026-03-01T09:00:00.000Z',
    updatedAt: '2026-03-01T09:00:00.000Z',
  },
  {
    id: 'mistake-newton-leibniz-pole',
    title: '跨越无界奇点直接套用牛顿-莱布尼茨公式',
    topic: 'integral',
    errorTag: 'domain-ignored',
    status: 'unresolved',
    prompt:
      '计算积分 ∫_{-1}^{1} (1 / x^2) dx，核查闭区间 [-1, 1] 上牛顿-莱布尼茨公式的适用前提。',
    formula: '\\int_{-1}^{1}\\frac{1}{x^2}\\,\\mathrm{d}x = +\\infty \\neq -2',
    myAttempt:
      '直接求原函数 -1/x 并代入上下限得 (-1/1) - (-1/(-1)) = -2，甚至未察觉非负函数的积分算出了负数。',
    correction:
      '牛顿-莱布尼茨公式要求被积函数在闭区间 [-1, 1] 上连续（或有界可积且原函数在整个闭区间连续可导）。x = 0 是被积函数的无穷间断点（瑕点），必须拆分为两个反常积分 ∫_{-1}^{0} + ∫_{0}^{1}；因 p = 2 ≥ 1 两侧均发散，故原积分发散。',
    relatedKnowledgeId: 'integral-newton-leibniz',
    counterexamplePlot: {
      expression: '1 / x^2',
      xMin: -3,
      xMax: 3,
      yMin: -2,
      yMax: 20,
      sourceMistakeId: 'mistake-newton-leibniz-pole',
    },
    createdAt: '2026-03-02T10:30:00.000Z',
    updatedAt: '2026-03-02T10:30:00.000Z',
  },
  {
    id: 'mistake-converse-differentiable',
    title: '把“连续”误当成“可导”的充分条件',
    topic: 'derivative',
    errorTag: 'converse-fallacy',
    status: 'reviewing',
    prompt:
      '讨论函数 f(x) = |x| 在分界点 x = 0 处的连续性与可导性，检验分段表达式直接求导的隐患。',
    formula: "f(x)=|x|,\\quad f'_-(0)=-1 \\neq f'_+(0)=1",
    myAttempt:
      '看到函数图像在 x = 0 处不断开（lim(x → 0) |x| = 0 = f(0)），便直接对分段表达式两边求导而不检查分界点左右导数是否相等。',
    correction:
      '内点处“可导必连续”，但逆命题不成立。分段函数或含绝对值函数在分界点处必须严格按导数定义分别检验左导数 lim(h → 0⁻) (f(x₀ + h) - f(x₀)) / h 与右导数 lim(h → 0⁺) (f(x₀ + h) - f(x₀)) / h 是否存在、有限且相等。',
    relatedKnowledgeId: 'derivative-absolute',
    counterexamplePlot: {
      expression: 'abs(x)',
      xMin: -3,
      xMax: 3,
      secant: { x0: 0, h: 0.5 },
      sourceMistakeId: 'mistake-converse-differentiable',
    },
    createdAt: '2026-03-03T14:15:00.000Z',
    updatedAt: '2026-03-03T14:15:00.000Z',
  },
  {
    id: 'mistake-equiv-infinitesimal-sub',
    title: '在加减运算中盲目使用一阶等价无穷小相消',
    topic: 'limit',
    errorTag: 'condition-misused',
    status: 'mastered',
    prompt:
      '计算极限 lim(x → 0) (tan x - sin x) / x^3，分析分子加减项直接等价替换失效的原因。',
    formula:
      '\\lim_{x\\to 0}\\frac{\\tan x - \\sin x}{x^3}=\\frac{1}{2} \\neq 0',
    myAttempt:
      '利用 x → 0 时 tan x ~ x、sin x ~ x，将分子直接替换为 x - x = 0，得出极限为 0。',
    correction:
      '等价无穷小替换仅在乘除因子中无条件成立；加减法中当两个无穷小主部相消（tan x / sin x → 1）时，低阶余项丢失会导致结果错误。应提取公因式 tan x (1 - cos x) ~ x · (1/2)x^2 = (1/2)x^3，或使用三阶泰勒展开 (x + x^3/3) - (x - x^3/6) + o(x^3) = (1/2)x^3 + o(x^3)，得极限为 1/2。',
    relatedKnowledgeId: 'limit-infinitesimal-equiv',
    counterexamplePlot: {
      expression: '(tan(x) - sin(x)) / x^3',
      xMin: -1.2,
      xMax: 1.2,
      yMin: 0,
      yMax: 1.5,
      sourceMistakeId: 'mistake-equiv-infinitesimal-sub',
    },
    createdAt: '2026-03-04T16:45:00.000Z',
    updatedAt: '2026-03-04T16:45:00.000Z',
  },
]);
