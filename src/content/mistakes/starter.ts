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
  {
    id: 'mistake-polar-missing-jacobian',
    title: '极坐标计算二重积分时漏乘雅可比因子 r',
    topic: 'integral',
    errorTag: 'calculation-error',
    status: 'unresolved',
    prompt:
      '在圆域 D: x^2 + y^2 ≤ 4 上计算二重积分 ∬_D exp(-(x^2 + y^2)) dx dy，检验极坐标变换时的面积微元换算。',
    formula:
      '\\iint_{x^2+y^2\\le 4} e^{-(x^2+y^2)}\\,\\mathrm{d}x\\,\\mathrm{d}y = \\int_0^{2\\pi}\\mathrm{d}\\theta\\int_0^2 e^{-r^2}\\,r\\,\\mathrm{d}r = \\pi(1-e^{-4})',
    myAttempt:
      '令 x = r cos θ, y = r sin θ，直接把 dx dy 写成 dr dθ，试图计算 ∫_0^{2π} dθ ∫_0^2 exp(-r^2) dr，不仅漏掉因子 r 且导致被积函数无初等原函数。',
    correction:
      '极坐标变换的雅可比行列式为 |∂(x, y)/∂(r, θ)| = r（r ≥ 0），面积微元必须满足 dx dy = r dr dθ（扇形微元弧长 r dθ 乘径向厚度 dr）。补上因子 r 后，∫_0^2 r·exp(-r^2) dr = (1 - e^{-4})/2，再乘 2π 得精确值 π(1 - e^{-4}) ≈ 3.084058。',
    relatedKnowledgeId: 'integral-double-riemann',
    counterexampleSurfacePlot: {
      expression: 'exp(-(x^2 + y^2))',
      xMin: -2.5,
      xMax: 2.5,
      yDomainMin: -2.5,
      yDomainMax: 2.5,
      gridSize: 64,
      integral: {
        regionType: 'disk',
        xStart: -2,
        xEnd: 2,
        yStart: -2,
        yEnd: 2,
        partitions: 18,
        rule: 'midpoint',
      },
      sourceMistakeId: 'mistake-polar-missing-jacobian',
    },
    createdAt: '2026-03-05T09:20:00.000Z',
    updatedAt: '2026-03-05T09:20:00.000Z',
  },
  {
    id: 'mistake-green-origin-pole',
    title: '忽略区域内部奇点直接套用格林公式归零',
    topic: 'integral',
    errorTag: 'domain-ignored',
    status: 'reviewing',
    prompt:
      '沿逆时针单位圆周 L: x^2 + y^2 = 1 计算第二类曲线积分 ∮_L (-y dx + x dy)/(x^2 + y^2)，分析为何 ∂Q/∂x ≡ ∂P/∂y 却不能直接得出环量为 0。',
    formula:
      '\\oint_{x^2+y^2=1}\\frac{-y\\,\\mathrm{d}x+x\\,\\mathrm{d}y}{x^2+y^2}=2\\pi \\neq 0',
    myAttempt:
      '分别求偏导算出 ∂Q/∂x = (y^2 - x^2)/(x^2 + y^2)^2 且 ∂P/∂y = (y^2 - x^2)/(x^2 + y^2)^2，见二者相等便直接套用格林公式写成 ∬_D (∂Q/∂x - ∂P/∂y) dx dy = 0。',
    correction:
      '格林公式要求 P, Q 在闭区域 D 的每一点（含内部与边界）均具有一阶连续偏导数。本题 (0, 0) ∈ D 是无界奇点，不能直接对单位圆盘应用单连通格林公式！应围绕原点作半径 ε < 1 的辅助小圆挖孔（复连通域格林公式），或直接参数化 x = cos t, y = sin t (0 ≤ t ≤ 2π) 算得精确环量 2π。',
    relatedKnowledgeId: 'integral-green-singularity',
    counterexampleSurfacePlot: {
      expression: 'x / (x^2 + y^2)',
      xMin: -2,
      xMax: 2,
      yDomainMin: -2,
      yDomainMax: 2,
      zMin: -4,
      zMax: 4,
      gridSize: 64,
      sourceMistakeId: 'mistake-green-origin-pole',
    },
    createdAt: '2026-03-06T11:00:00.000Z',
    updatedAt: '2026-03-06T11:00:00.000Z',
  },
]);
