import { z } from 'zod';
import { knowledgeCardSchema } from '@/shared/contracts';

export const knowledgeCards = z.array(knowledgeCardSchema).parse([
  {
    id: 'sequence-monotone-bounded',
    topic: 'sequence',
    title: '单调有界定理：收敛性的存在判别',
    definition:
      '在实数完备性公理体系下，单调递增且有上界（或单调递减且有下界）的数列必有有限极限。该定理无需预先求出极限数值即可判定收敛性，是证明递推数列存在极限的核心工具。',
    formula:
      'x_n \\le x_{n+1} \\le M \\ (\\forall n \\ge N) \\implies \\lim_{n\\to\\infty} x_n = \\sup_{n\\ge N}\\{x_n\\}',
    conditions: [
      '数列从某一项 N 起保持单调（单调递增 x_n ≤ x_{n+1} 或单调递减 x_n ≥ x_{n+1}），有限项的改变不影响收敛性。',
      '对应方向有界：单调递增数列须有上界（x_n ≤ M），单调递减数列须有下界（x_n ≥ m），单调方向与有界方向不可错配。',
      '依赖实数系的完备性（确界原理）：上确界（或下确界）即为该单调有界数列的极限。',
    ],
    examples: [
      {
        kind: 'example',
        explanation:
          '递推数列 x₁ = √2, x_{n+1} = √(2 + x_n) 满足单调递增且恒有上界 2，由单调有界定理先确认极限 L 存在，再对递推关系两侧取极限解得 L = 2；可借函数 2 - 1/x 在 x → +∞ 时的渐近行为观察上确界逼近。',
        plot: {
          expression: '2 - 1/x',
          compareExpression: '2 + 0*x',
          xMin: 1,
          xMax: 20,
          yMin: 0,
          yMax: 2.5,
          sourceKnowledgeId: 'sequence-monotone-bounded',
        },
      },
      {
        kind: 'counterexample',
        explanation:
          '有界不一定收敛：数列 x_n = (-1)^n 虽满足 |x_n| ≤ 1，但缺乏单调性而在 -1 与 1 之间交替跳跃发散；类比周期函数 cos(x) 在无穷区间上的等幅振荡，仅有有界性不足以保证极限存在。',
        plot: {
          expression: 'cos(x)',
          xMin: 0,
          xMax: 25,
          yMin: -1.5,
          yMax: 1.5,
          sourceKnowledgeId: 'sequence-monotone-bounded',
        },
      },
    ],
    pitfalls: [
      '单调性与有界性缺一不可：x_n = n 单调递增但无上界而发散；x_n = (-1)^n 有界但不单调同样发散。',
      '求解递推数列极限时，不能未经证明直接设 lim x_n = L 代入方程求解，必须先证单调有界以确保极限存在。',
    ],
    references: [
      '同济大学数学科学学院《高等数学》（第八版）上册 · 第一章第二节「数列的极限」与第五节「极限存在准则」',
      '工科数学分析课程讲义：实数完备性与单调有界定理（确界原理）',
    ],
    relatedIds: ['sequence-squeeze', 'limit-square', 'integral-improper-p'],
  },
  {
    id: 'sequence-squeeze',
    topic: 'sequence',
    title: '夹逼准则：放缩构造与同趋一值',
    definition:
      '若在自变量同一变化过程中，目标函数（或数列）始终被夹在两个辅助量之间，且左右两个辅助量趋于同一个有限极限 L，则中间的目标量也必存在极限且等于 L。',
    formula:
      'g(x) \\le f(x) \\le h(x),\\quad \\lim g(x) = \\lim h(x) = L \\implies \\lim f(x) = L',
    conditions: [
      '在极限过程的某去心邻域（或数列某项 N 之后）双侧不等式 g ≤ f ≤ h 恒成立。',
      '左右两端辅助量的极限均存在，且二者极限值严格相等（同为有限常数 L）。',
    ],
    examples: [
      {
        kind: 'example',
        explanation:
          '当 x ≠ 0 时恒有 -|x| ≤ x·sin(1/x) ≤ |x|，由于 x → 0 时两侧 ±|x| 均趋于 0，由夹逼准则知 x·sin(1/x) 在 x → 0 时的极限为 0。',
        plot: {
          expression: 'x * sin(1/x)',
          compareExpression: 'abs(x)',
          xMin: -1,
          xMax: 1,
          yMin: -1,
          yMax: 1,
          sourceKnowledgeId: 'sequence-squeeze',
        },
      },
      {
        kind: 'counterexample',
        explanation:
          '无穷多项无穷小之和误区：考察 S_n = ∑_{k=1}^n 1/√(n² + k) (n → ∞)，虽然每一项都趋于 0，但项数 n 同步趋于无穷，直接按 0 + 0 + … + 0 = 0 推算完全错误；应利用 n/√(n² + n) ≤ S_n ≤ n/√(n² + 1) 夹逼得真实极限为 1。',
      },
    ],
    pitfalls: [
      '无穷个无穷小之和不能直接拆用极限加法法则！极限四则运算仅对固定有限项成立，可变项和须通过夹逼准则或定积分定义处理。',
      '放缩过松会导致上下界极限不相等（如左端趋于 0 而右端趋于 1），此时夹逼准则无法得出结论，需重新精细构造上下界。',
    ],
    references: [
      '同济大学数学科学学院《高等数学》（第八版）上册 · 第一章第五节「极限存在准则 两个重要极限」',
      '工科数学分析课程讲义：数列与函数极限的夹逼放缩方法',
    ],
    relatedIds: [
      'sequence-monotone-bounded',
      'limit-infinitesimal-equiv',
      'continuity-discontinuity-types',
    ],
  },
  {
    id: 'limit-square',
    topic: 'limit',
    title: '函数极限：靠近，而非到达',
    definition:
      '当 x 在 a 的去心邻域内趋近 a 时，若函数值可以任意接近常数 L，则称 L 为该函数在 a 处的极限。极限只刻画 x 靠近 a 时的变化趋势，函数在 a 处可以没有定义或取其他值。',
    formula:
      '\\lim_{x\\to a} f(x)=L \\iff \\forall\\varepsilon>0,\\ \\exists\\delta>0:\\ 0<|x-a|<\\delta \\implies |f(x)-L|<\\varepsilon',
    conditions: [
      '函数在 a 的某个去心邻域 (a - δ, a) ∪ (a, a + δ) 内有定义（0 < |x - a| < δ 明确排除 x = a）。',
      '左极限与右极限都存在且相等（f(a⁻) = f(a⁺) = L）时，双侧极限才存在。',
    ],
    examples: [
      {
        kind: 'example',
        explanation: '观察 x² 在 x 趋近 1 时的变化，其函数值在两侧均趋近 1。',
        plot: {
          expression: 'x^2',
          xMin: -2,
          xMax: 3,
          sourceKnowledgeId: 'limit-square',
        },
      },
      {
        kind: 'counterexample',
        explanation:
          '极限存在但该点无定义：有理函数 (x² - 1)/(x - 1) 在 x = 1 处分母为 0 无定义，但在去心邻域 x ≠ 1 内恒等于 x + 1，故 x → 1 时极限严格等于 2（注意采样图像未必直接标出单点空洞，须先核查定义域）。',
        plot: {
          expression: '(x^2 - 1)/(x - 1)',
          xMin: -1,
          xMax: 3,
          sourceKnowledgeId: 'limit-square',
        },
      },
    ],
    pitfalls: [
      '不能仅凭图像或有限次采样证明极限存在。',
      '极限存在不要求 f(a) 等于该极限，甚至不要求 f(a) 有定义；切勿把“求极限”等同于“直接代入 x = a”。',
    ],
    references: [
      '同济大学数学科学学院《高等数学》（第八版）上册 · 第一章第三节「函数的极限」（ε-δ 定义与单侧极限）',
      '工科数学分析课程讲义：去心邻域与函数极限的局部性质',
    ],
    relatedIds: [
      'limit-infinitesimal-equiv',
      'continuity-reciprocal',
      'continuity-discontinuity-types',
    ],
  },
  {
    id: 'limit-infinitesimal-equiv',
    topic: 'limit',
    title: '重要极限与等价无穷小：乘除可用，加减慎用',
    definition:
      '在同一极限过程中，若 α(x) → 0, β(x) → 0 且 lim α(x)/β(x) = 1，则称 α 与 β 是等价无穷小（记作 α ~ β）。求极限时，整个极限式的乘除因子可以安全做等价无穷小代换，但加减项中若首项相消则会引发阶数误判。',
    formula:
      '\\lim_{x\\to 0}\\frac{\\sin x}{x}=1,\\quad \\sin x - \\tan x \\sim -\\frac{1}{2}x^3 \\ (x\\to 0)',
    conditions: [
      '代换必须在同一无穷小极限过程下进行（如 u → 0 时方有 sin u ~ u，若 x → π 则 sin x 与 x 不等价）。',
      '被替换的无穷小须作为整个待求式的乘积因子或商因子；加减法中仅当两项不等价（主部不抵消）时才可替换，否则应改用泰勒公式展开到首个非零项。',
    ],
    examples: [
      {
        kind: 'example',
        explanation:
          '重要极限观察：sin(x)/x 在 x = 0 处虽无定义，但在 x → 0 两侧对称趋于 1，在 [-10, 10] 区间上可同时看到原点主峰与两侧振荡衰减。',
        plot: {
          expression: 'sin(x)/x',
          xMin: -10,
          xMax: 10,
          yMin: -0.5,
          yMax: 1.2,
          sourceKnowledgeId: 'limit-infinitesimal-equiv',
        },
      },
      {
        kind: 'counterexample',
        explanation:
          '加减相消反例：求 lim_{x→0} (sin x - tan x)/x³ 时，若在加减项中把 sin x 与 tan x 均错换为 x，会得出 (x - x)/x³ = 0 的荒谬结论；正确展开为 (x - x³/6) - (x + x³/3) + o(x³) = -x³/2 + o(x³)，真实极限是 -1/2。',
        plot: {
          expression: '(sin(x) - tan(x)) / x^3',
          xMin: -1,
          xMax: 1,
          yMin: -1.5,
          yMax: 0.5,
          sourceKnowledgeId: 'limit-infinitesimal-equiv',
        },
      },
    ],
    pitfalls: [
      '严禁在分子或分母的加减运算中盲目做一阶等价替换！一旦同阶主部抵消，被忽略的高阶无穷小就会决定真实极限值。',
      '复合函数内部（如指数位置、函数自变量内层）也不能随意直接做等价无穷小替换，须先取对数或提取公因式化为整体乘积因子。',
    ],
    references: [
      '同济大学数学科学学院《高等数学》（第八版）上册 · 第一章第五节「两个重要极限」与第七节「无穷小的比较」',
      '工科数学分析课程讲义：等价无穷小代换定理与主部相消判别',
    ],
    relatedIds: ['limit-square', 'derivative-taylor', 'derivative-lhopital'],
  },
  {
    id: 'continuity-reciprocal',
    topic: 'continuity',
    title: '连续性：先检查定义域',
    definition:
      '函数在定义域内的一点连续，是指该点的函数极限存在且等于该点的函数值。讨论内部点的双侧连续性以及应用闭区间连续函数性质前，必须首先检查定义域是否完整。',
    formula: '\\lim_{x\\to a}f(x)=f(a)',
    conditions: [
      'a 是函数定义域中的点（f(a) 有确定有限值）。',
      '极限按定义域取值趋近 a 且 lim_{x→a} f(x) = f(a)；闭区间端点处分别使用对应的右极限或左极限检验单侧连续。',
    ],
    examples: [
      {
        kind: 'example',
        explanation:
          '1/x 在 (-∞, 0) 与 (0, +∞) 两个定义区间上分别连续，但 0 不在定义域中，不能说它在 0 点连续，也不能在 [-1, 1] 上对 1/x 套用零点定理或介值定理。',
        plot: {
          expression: '1/x',
          xMin: -5,
          xMax: 5,
          sourceKnowledgeId: 'continuity-reciprocal',
        },
      },
    ],
    pitfalls: [
      '图中看起来平滑不代表已证明连续。',
      '绘图不得把 1/x 在 0 两侧的分支直接相连；“初等函数在其定义区间内连续”不等同于跨越无定义奇点仍连续。',
    ],
    references: [
      '同济大学数学科学学院《高等数学》（第八版）上册 · 第一章第八节「函数的连续性与间断点」及第十节「闭区间上连续函数的性质」',
      '工科数学分析课程讲义：连续性定义与闭区间全局性质',
    ],
    relatedIds: [
      'limit-square',
      'continuity-discontinuity-types',
      'derivative-absolute',
    ],
  },
  {
    id: 'continuity-discontinuity-types',
    topic: 'continuity',
    title: '间断点分类：可去、跳跃、无穷与振荡',
    definition:
      '若函数在点 a 的某去心邻域内有定义但在 a 处不连续，则称 a 为间断点。依据左极限 f(a⁻) 与右极限 f(a⁺) 是否同时存在且有限，间断点严格分为第一类间断点与第二类间断点。',
    formula: 'f(a^-)=\\lim_{x\\to a^-}f(x),\\quad f(a^+)=\\lim_{x\\to a^+}f(x)',
    conditions: [
      '第一类间断点（左右极限均存在且有限）：若 f(a⁻) = f(a⁺) ≠ f(a)（或 f(a) 无定义）称为可去间断点，补充定义后可延拓为连续函数；若 f(a⁻) ≠ f(a⁺) 称为跳跃间断点。',
      '第二类间断点（左右极限至少有一侧不存在）：包括至少一侧趋于 ∞ 的无穷间断点（如 1/x 在 x=0），以及单侧无限往复不趋于定值的振荡间断点（如 sin(1/x) 在 x=0）。',
    ],
    examples: [
      {
        kind: 'example',
        explanation:
          '第一类跳跃间断点：函数 |x|/x 在 x = 0 处无定义，左极限为 -1，右极限为 1，左右极限均有限但不相等，在原点发生跃度为 2 的阶跃。',
        plot: {
          expression: 'abs(x)/x',
          xMin: -3,
          xMax: 3,
          yMin: -2,
          yMax: 2,
          sourceKnowledgeId: 'continuity-discontinuity-types',
        },
      },
      {
        kind: 'counterexample',
        explanation:
          '第二类振荡间断点：函数 sin(1/x) 当 x → 0 时频率趋于无穷、函数值在 [-1, 1] 内无限次密集往复振荡，左右极限均不存在，任何单点赋值都无法使其在 x = 0 连续。',
        plot: {
          expression: 'sin(1/x)',
          xMin: -1,
          xMax: 1,
          yMin: -1.5,
          yMax: 1.5,
          sourceKnowledgeId: 'continuity-discontinuity-types',
        },
      },
    ],
    pitfalls: [
      '只要左、右极限中有一侧不存在（例如 x → 0⁻ 趋于 0 而 x → 0⁺ 趋于 +∞），就属于第二类间断点，绝不能误判为第一类跳跃间断点。',
      '可去间断点可以通过补充或修正单点函数值消除间断，而跳跃间断点与第二类间断点无法仅靠修改一点取值变成连续。',
    ],
    references: [
      '同济大学数学科学学院《高等数学》（第八版）上册 · 第一章第八节「函数的连续性与间断点」',
      '工科数学分析课程讲义：单侧极限与两类间断点判别流程',
    ],
    relatedIds: [
      'continuity-reciprocal',
      'sequence-squeeze',
      'derivative-absolute',
    ],
  },
  {
    id: 'derivative-absolute',
    topic: 'derivative',
    title: '可导与连续：逆命题不成立',
    definition:
      '导数是函数差商在增量趋于 0 时的极限。一元函数在内点处可导必在该点连续，但逆命题不成立——连续函数在折角尖点或铅直切线处不可导。',
    formula: "f'(a)=\\lim_{h\\to0}\\frac{f(a+h)-f(a)}{h}",
    conditions: [
      '函数在点 a 的某邻域内有定义（若不连续则必不可导）。',
      '差商的左极限（左导数）与右极限（右导数）均存在、有限且严格相等。',
    ],
    examples: [
      {
        kind: 'counterexample',
        explanation:
          '|x| 在 0 处连续，左导数为 -1，右导数为 1，左右导数不相等，因此在 0 处不可导。',
        plot: {
          expression: 'abs(x)',
          xMin: -3,
          xMax: 3,
          sourceKnowledgeId: 'derivative-absolute',
        },
      },
    ],
    pitfalls: [
      '不能把“可导必连续”倒过来当作“连续必可导”使用；分段函数在分界点求导须回归差商定义分别计算左导数与右导数。',
      '数值差商与局部图像只是观察工具，不能替代差商极限的严格数学论证。',
    ],
    references: [
      '同济大学数学科学学院《高等数学》（第八版）上册 · 第二章第一节「导数概念」（单侧导数与连续性关系）',
      '工科数学分析课程讲义：差商极限与不可导典型反例',
    ],
    relatedIds: [
      'continuity-reciprocal',
      'continuity-discontinuity-types',
      'derivative-mean-value',
    ],
  },
  {
    id: 'derivative-mean-value',
    topic: 'derivative',
    title: '拉格朗日中值定理：闭区间连续，开区间可导',
    definition:
      '若函数 f(x) 在闭区间 [a, b] 上连续，且在开区间 (a, b) 内每一点可导，则在 (a, b) 内至少存在一点 ξ，使得该点切线斜率等于两端点连线的割线斜率。它是连接导数局部符号与函数全局单调性、不等式估计的枢纽。',
    formula: "f(b)-f(a)=f'(\\xi)(b-a),\\quad \\xi\\in(a,b)",
    conditions: [
      '闭区间 [a, b] 上连续：包含两个端点 a 与 b 的单侧连续性，端点处的跳跃间断同样会使定理失效。',
      '开区间 (a, b) 内处处可导：不要求端点 a, b 处可导，但开区间内部绝不能存在任何不可导尖点或间断点。',
    ],
    examples: [
      {
        kind: 'example',
        explanation:
          '三次函数 x³ - 3x 在 [-2, 2] 上满足闭区间连续、开区间可导，两端点割线 y = x 斜率为 1，在 (-2, 2) 内存在两点 ξ = ±√(4/3) 使得切线平行于割线。',
        plot: {
          expression: 'x^3 - 3*x',
          compareExpression: 'x',
          xMin: -2.5,
          xMax: 2.5,
          sourceKnowledgeId: 'derivative-mean-value',
        },
      },
      {
        kind: 'counterexample',
        explanation:
          '内点不可导反例：f(x) = |x| 在 [-1, 1] 上闭区间连续且 f(1) - f(-1) = 0，但因内点 x = 0 不可导，在 (-1, 0) ∪ (0, 1) 上导数仅为 -1 或 1，不存在任何 ξ ∈ (-1, 1) 使 f′(ξ) = 0。',
        plot: {
          expression: 'abs(x)',
          xMin: -1,
          xMax: 1,
          yMin: -0.5,
          yMax: 1.5,
          sourceKnowledgeId: 'derivative-mean-value',
        },
      },
    ],
    pitfalls: [
      '闭区间连续与开区间可导缺一不可：使用罗尔定理、拉格朗日或柯西中值定理前，必须逐项核对区间端点连续性与内部可导性。',
      '柯西中值定理还额外要求分母函数在开区间 (a, b) 内每一点导数 g′(x) ≠ 0，而不仅仅是 g(b) ≠ g(a)。',
    ],
    references: [
      '同济大学数学科学学院《高等数学》（第八版）上册 · 第三章第一节「微分中值定理」',
      '工科数学分析课程讲义：微分中值定理与导数应用',
    ],
    relatedIds: [
      'continuity-reciprocal',
      'derivative-lhopital',
      'derivative-taylor',
    ],
  },
  {
    id: 'derivative-lhopital',
    topic: 'derivative',
    title: '洛必达法则：充分条件而非充要条件',
    definition:
      '当分子与分母同趋于 0 或同趋于 ∞ 构成未定式，且满足可导及导数比存在极限（或为无穷大）时，原分式极限等于导数之比的极限。务必注意：洛必达法则是充分条件而非充要条件！',
    formula:
      "\\lim \\frac{f'(x)}{g'(x)} = L \\implies \\lim \\frac{f(x)}{g(x)} = L",
    conditions: [
      '必须是 0/0 型或 ∞/∞ 型未定式；非未定式不能求导，其他未定式（0·∞、∞ - ∞、1^∞ 等）须先恒等变形转化为 0/0 或 ∞/∞ 型。',
      '在去心邻域（或无穷区间）内 f(x) 与 g(x) 均可导，且分母导数 g′(x) ≠ 0。',
      '关键前提：导数之比 lim f′(x)/g′(x) 必须存在（有限值 L）或趋于无穷大；若导数比振荡不存在，洛必达法则失效，不能反推原极限不存在！',
    ],
    examples: [
      {
        kind: 'counterexample',
        explanation:
          '法则失效经典反例：求 x → +∞ 时 (x + sin x)/x 的极限（∞/∞ 型），直接化简 1 + (sin x)/x 可证极限为 1；若误用洛必达法则求导得 (1 + cos x)/1 = 1 + cos x，因其在 [0, 2] 间无限振荡无极限，法则第三条前提不满足，绝不能误判原极限不存在！',
        plot: {
          expression: '(x + sin(x))/x',
          compareExpression: '1 + 0*x',
          xMin: 0.5,
          xMax: 30,
          yMin: 0,
          yMax: 2.2,
          sourceKnowledgeId: 'derivative-lhopital',
        },
      },
      {
        kind: 'example',
        explanation:
          '合法应用正例：求 x → 0 时 (e^x - 1 - x)/x²（0/0 型），两次核验 0/0 未定式条件后求导得 lim_{x→0} e^x / 2 = 1/2。',
        plot: {
          expression: '(exp(x) - 1 - x)/x^2',
          xMin: -2,
          xMax: 2,
          yMin: 0,
          yMax: 1.5,
          sourceKnowledgeId: 'derivative-lhopital',
        },
      },
    ],
    pitfalls: [
      '多次连续求导时，每一步之前都必须重新检查是否仍为 0/0 或 ∞/∞ 型！一旦某步极限已确定非零却继续求导，结果必然出错。',
      '遇到含振荡因子 sin x, cos x 或根式循环求导时，应及时改用夹逼准则、提取非零因子或泰勒公式，不要死磕求导。',
    ],
    references: [
      '同济大学数学科学学院《高等数学》（第八版）上册 · 第三章第二节「洛必达法则」',
      '工科数学分析课程讲义：未定式极限与洛必达法则适用边界',
    ],
    relatedIds: [
      'limit-infinitesimal-equiv',
      'derivative-mean-value',
      'derivative-taylor',
    ],
  },
  {
    id: 'derivative-taylor',
    topic: 'derivative',
    title: '泰勒公式：多项式局部高阶逼近',
    definition:
      '泰勒公式利用函数在一点 x₀ 处的各阶导数信息构造 n 次多项式，对复杂函数作高阶局部逼近，并通过余项 R_n(x) 刻画逼近阶数或误差界。它是精细分析极限相消与函数凹凸极值的核心工具。',
    formula: 'f(x)=\\sum_{k=0}^{n}\\frac{f^{(k)}(x_0)}{k!}(x-x_0)^k + R_n(x)',
    conditions: [
      '皮亚诺余项 R_n(x) = o((x - x₀)^n)：仅要求 f 在点 x₀ 存在直到 n 阶导数，用于 x → x₀ 时的局部定性极限计算与高阶无穷小分析。',
      '拉格朗日余项 R_n(x) = f^{(n+1)}(ξ)/(n+1)! · (x - x₀)^{n+1}：要求包含 x₀ 与 x 的闭区间上 n 阶导数连续、开区间内 n+1 阶可导，用于区间上的定量截断误差估计与不等式证明。',
    ],
    examples: [
      {
        kind: 'example',
        explanation:
          '麦克劳林展开逼近：sin(x) 在 x₀ = 0 处的三阶泰勒多项式为 x - x³/6；图像对比可见在原点附近两条曲线几乎重合，而当 |x| > 2 后三次多项式迅速偏离有界的正弦曲线。',
        plot: {
          expression: 'sin(x)',
          compareExpression: 'x - x^3/6',
          xMin: -4,
          xMax: 4,
          yMin: -2.5,
          yMax: 2.5,
          sourceKnowledgeId: 'derivative-taylor',
        },
      },
    ],
    pitfalls: [
      '求分式极限时展开阶数必须匹配：加减运算须展开至首项不抵消的最低幂次，且与分母无穷小同阶，不能随意少展漏项。',
      '局部泰勒逼近不等于无穷级数全局收敛：皮亚诺余项仅在 x → x₀ 时有效，远离展开点 x₀ 时高次多项式误差可能非常巨大。',
    ],
    references: [
      '同济大学数学科学学院《高等数学》（第八版）上册 · 第三章第三节「泰勒公式」',
      '工科数学分析课程讲义：皮亚诺余项与拉格朗日余项的对比应用',
    ],
    relatedIds: [
      'limit-infinitesimal-equiv',
      'derivative-mean-value',
      'derivative-lhopital',
    ],
  },
  {
    id: 'integral-newton-leibniz',
    topic: 'integral',
    title: '牛顿-莱布尼茨公式：严禁跨越奇点代端点',
    definition:
      '微积分基本公式将闭区间 [a, b] 上连续（或可积）函数 f(x) 的定积分转化为其连续原函数 F(x) 在两端点的差值 F(b) - F(a)。使用前必须确认积分区间内没有无界奇点，且原函数在全区间连续。',
    formula:
      "\\int_a^b f(x)\\,\\mathrm{d}x = F(b)-F(a) \\quad (f\\in C[a,b],\\ F'=f)",
    conditions: [
      '被积函数 f(x) 在闭区间 [a, b] 上连续（或黎曼可积），区间内部及端点绝不能含有无界瑕点（黎曼可积必有界！）。',
      '原函数 F(x) 在整个闭区间 [a, b] 上连续，并在 (a, b) 内满足 F′(x) = f(x)，不得跨越 F(x) 自身的不连续点直接代值。',
    ],
    examples: [
      {
        kind: 'counterexample',
        explanation:
          '跨越奇点致命误区：对 ∫_{-1}^{1} (1/x²) dx 若直接代入 -1/x|_{-1}^{1} 会算出 (-1) - 1 = -2 < 0，与被积函数恒正严重矛盾！根源在于 x = 0 是无界瑕点，f(x) = 1/x² 在 [-1, 1] 不连续且无界，按瑕积分拆为 ∫_{-1}^0 + ∫_0^1 可证其发散至 +∞。',
        plot: {
          expression: '1/x^2',
          xMin: -3,
          xMax: 3,
          yMin: -1,
          yMax: 20,
          sourceKnowledgeId: 'integral-newton-leibniz',
        },
      },
      {
        kind: 'example',
        explanation:
          '避开奇点的合法区间：在闭区间 [1, 3] 上 1/x² 处处连续有界，原函数 F(x) = -1/x 连续可导，应用牛顿-莱布尼茨公式得 (-1/3) - (-1) = 2/3 > 0。',
        plot: {
          expression: '1/x^2',
          xMin: 1,
          xMax: 3,
          yMin: 0,
          yMax: 1.2,
          sourceKnowledgeId: 'integral-newton-leibniz',
        },
      },
    ],
    pitfalls: [
      '计算任何定积分的第一步都是检查积分区间 [a, b] 内是否存在分母为 0、偶次根号为零分母或对数真数为 0 的瑕点！',
      '使用万能代换 u = tan(x/2) 求三角有理式定积分时，若区间跨越 x = π，代换在 π 处产生无穷间断，直接代上下限会漏掉周期增量。',
    ],
    references: [
      '同济大学数学科学学院《高等数学》（第八版）上册 · 第五章第二节「微积分基本公式」',
      '工科数学分析课程讲义：黎曼可积前提与跨越奇点错例剖析',
    ],
    relatedIds: [
      'continuity-reciprocal',
      'derivative-mean-value',
      'integral-improper-p',
    ],
  },
  {
    id: 'integral-improper-p',
    topic: 'integral',
    title: '反常积分敛散性：无穷区间与瑕积分对偶',
    definition:
      '无穷区间上的反常积分与无界函数的反常积分（瑕积分）统称反常积分，均通过变限积分的极限来定义敛散性。两类基准 p-积分在无穷远处（x → +∞）与零点奇点处（x → 0⁺）具有严格对偶的收敛判别阈值。',
    formula:
      '\\int_1^{+\\infty}\\frac{\\mathrm{d}x}{x^p} < +\\infty \\iff p>1;\\quad \\int_0^1\\frac{\\mathrm{d}x}{x^q} < +\\infty \\iff 0<q<1',
    conditions: [
      '无穷限基准积分 ∫_1^{+∞} dx/x^p：当且仅当 p > 1 时收敛（值为 1/(p - 1)），当 p ≤ 1 时发散（尾部衰减过慢）。',
      '无界瑕积分 ∫_0^1 dx/x^q（x = 0 为瑕点）：当且仅当 q < 1 时收敛（值为 1/(1 - q)），当 q ≥ 1 时发散（奇点附近增长过猛）。',
      '混合反常积分（如 ∫_0^{+∞} f(x) dx 同时含瑕点 0 与无穷上限 +∞）须在内部点拆分为两项独立判别，两项皆收敛才称原反常积分收敛。',
    ],
    examples: [
      {
        kind: 'example',
        explanation:
          '对偶行为直观对比：在 [1, +∞) 右侧尾部，1/x² 比 1/x 更快贴近横轴，故 ∫_1^{+∞} dx/x² = 1 收敛而 ∫_1^{+∞} dx/x 发散；而在靠近 x = 0⁺ 的左侧，1/x 与 1/x² 陡升过快导致 (0, 1] 上的瑕积分均发散（须如 1/√x 即 q = 1/2 < 1 才收敛）。',
        plot: {
          expression: '1/x',
          compareExpression: '1/x^2',
          xMin: 0.2,
          xMax: 8,
          yMin: 0,
          yMax: 6,
          sourceKnowledgeId: 'integral-improper-p',
        },
      },
    ],
    pitfalls: [
      '切勿混淆 p > 1 与 q < 1 的方向！临界函数 1/x（p = q = 1）无论在 [1, +∞) 还是 (0, 1] 上都发散，因而 ∫_0^{+∞} dx/x^p 对一切实数 p 均发散。',
      '双侧无穷反常积分 ∫_{-∞}^{+∞} f(x) dx 收敛要求正负半轴积分各自独立存在有限极限，不能用对称极限 lim_{R→+∞} ∫_{-R}^R f(x) dx（柯西主值）替代。',
    ],
    references: [
      '同济大学数学科学学院《高等数学》（第八版）上册 · 第五章第四节「反常积分」与第五节「反常积分的审敛法」',
      '工科数学分析课程讲义：无穷限反常积分与瑕积分比较判别法',
    ],
    relatedIds: [
      'sequence-monotone-bounded',
      'limit-infinitesimal-equiv',
      'integral-newton-leibniz',
    ],
  },
]);
