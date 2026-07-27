/**
 * LaTeX 符号面板组件
 *
 * 侧边栏 + 6大分类标签页 + 实时 KaTeX 预览 + 搜索过滤
 *
 * 使用方式:
 *   <LatexPanel
 *     onInsert={(latex) => { / * 插入到编辑器 * / }}
 *     isOpen={showPanel}
 *     onClose={() => setShowPanel(false)}
 *   />
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

// ======================= 类型定义 =======================

export interface LatexSymbol {
  /** 显示名称 */
  label: string
  /** 插入的 LaTeX 代码 */
  latex: string
  /** 简短提示 */
  tip?: string
  /** 搜索关键词 */
  keywords?: string[]
}

export interface LatexCategory {
  name: string
  icon: string
  symbols: LatexSymbol[]
}

export interface LatexPanelProps {
  /** 符号插入回调：接收 LaTeX 代码 */
  onInsert: (latex: string) => void
  /** 是否展开面板 */
  isOpen: boolean
  /** 关闭面板回调 */
  onClose: () => void
  /** 可选：自定义 CSS 类名 */
  className?: string
}

// ======================= 6大符号分类 =======================

export const LATEX_CATEGORIES: LatexCategory[] = [
  {
    name: '基本符号',
    icon: '∑',
    symbols: [
      { label: '±', latex: '\\pm', tip: '正负号', keywords: ['+-', 'plus minus'] },
      { label: '∓', latex: '\\mp', tip: '负正号', keywords: ['-+'] },
      { label: '×', latex: '\\times', tip: '乘号' },
      { label: '÷', latex: '\\div', tip: '除号' },
      { label: '·', latex: '\\cdot', tip: '点乘' },
      { label: '∘', latex: '\\circ', tip: '复合/度' },
      { label: '≤', latex: '\\le', tip: '小于等于', keywords: ['<='] },
      { label: '≥', latex: '\\ge', tip: '大于等于', keywords: ['>='] },
      { label: '≠', latex: '\\ne', tip: '不等于', keywords: ['!='] },
      { label: '≈', latex: '\\approx', tip: '约等于' },
      { label: '≡', latex: '\\equiv', tip: '恒等' },
      { label: '∼', latex: '\\sim', tip: '相似' },
      { label: '≅', latex: '\\cong', tip: '全等' },
      { label: '∝', latex: '\\propto', tip: '正比于' },
      { label: '∞', latex: '\\infty', tip: '无穷' },
      { label: '√', latex: '\\sqrt{}', tip: '平方根' },
      { label: '∛', latex: '\\sqrt[3]{}', tip: '立方根' },
      { label: '∥', latex: '\\parallel', tip: '平行' },
      { label: '⊥', latex: '\\perp', tip: '垂直' },
      { label: '∠', latex: '\\angle', tip: '角' },
      { label: '△', latex: '\\triangle', tip: '三角形' },
      { label: '□', latex: '\\square', tip: '方形' },
      { label: '∀', latex: '\\forall', tip: '任意' },
      { label: '∃', latex: '\\exists', tip: '存在' },
      { label: '∅', latex: '\\emptyset', tip: '空集' },
      { label: '∈', latex: '\\in', tip: '属于' },
      { label: '∉', latex: '\\notin', tip: '不属于' },
      { label: '⊂', latex: '\\subset', tip: '子集' },
      { label: '⊆', latex: '\\subseteq', tip: '子集或相等' },
      { label: '∪', latex: '\\cup', tip: '并集' },
      { label: '∩', latex: '\\cap', tip: '交集' },
      { label: '→', latex: '\\to', tip: '趋于/映射' },
      { label: '⇒', latex: '\\Rightarrow', tip: '蕴含' },
      { label: '⇔', latex: '\\Leftrightarrow', tip: '等价' },
      { label: '⋯', latex: '\\cdots', tip: '居中点省略' },
      { label: '⋮', latex: '\\vdots', tip: '竖省略' },
      { label: '⋱', latex: '\\ddots', tip: '斜省略' },
    ],
  },
  {
    name: '希腊字母',
    icon: 'α',
    symbols: [
      { label: 'α', latex: '\\alpha', keywords: ['alpha'] },
      { label: 'β', latex: '\\beta', keywords: ['beta'] },
      { label: 'γ', latex: '\\gamma', keywords: ['gamma'] },
      { label: 'δ', latex: '\\delta', keywords: ['delta'] },
      { label: 'ε', latex: '\\epsilon', keywords: ['epsilon'] },
      { label: 'ζ', latex: '\\zeta', keywords: ['zeta'] },
      { label: 'η', latex: '\\eta', keywords: ['eta'] },
      { label: 'θ', latex: '\\theta', keywords: ['theta'] },
      { label: 'ι', latex: '\\iota', keywords: ['iota'] },
      { label: 'κ', latex: '\\kappa', keywords: ['kappa'] },
      { label: 'λ', latex: '\\lambda', keywords: ['lambda'] },
      { label: 'μ', latex: '\\mu', keywords: ['mu'] },
      { label: 'ν', latex: '\\nu', keywords: ['nu'] },
      { label: 'ξ', latex: '\\xi', keywords: ['xi'] },
      { label: 'π', latex: '\\pi', keywords: ['pi'] },
      { label: 'ρ', latex: '\\rho', keywords: ['rho'] },
      { label: 'σ', latex: '\\sigma', keywords: ['sigma'] },
      { label: 'τ', latex: '\\tau', keywords: ['tau'] },
      { label: 'υ', latex: '\\upsilon', keywords: ['upsilon'] },
      { label: 'φ', latex: '\\phi', keywords: ['phi'] },
      { label: 'χ', latex: '\\chi', keywords: ['chi'] },
      { label: 'ψ', latex: '\\psi', keywords: ['psi'] },
      { label: 'ω', latex: '\\omega', keywords: ['omega'] },
      { label: 'Γ', latex: '\\Gamma', keywords: ['Gamma', '大写gamma'] },
      { label: 'Δ', latex: '\\Delta', keywords: ['Delta', '大写delta'] },
      { label: 'Θ', latex: '\\Theta', keywords: ['Theta', '大写theta'] },
      { label: 'Λ', latex: '\\Lambda', keywords: ['Lambda'] },
      { label: 'Ξ', latex: '\\Xi', keywords: ['Xi'] },
      { label: 'Π', latex: '\\Pi', keywords: ['Pi', '大写pi'] },
      { label: 'Σ', latex: '\\Sigma', keywords: ['Sigma', '大写sigma'] },
      { label: 'Φ', latex: '\\Phi', keywords: ['Phi', '大写phi'] },
      { label: 'Ψ', latex: '\\Psi', keywords: ['Psi', '大写psi'] },
      { label: 'Ω', latex: '\\Omega', keywords: ['Omega', '大写omega'] },
    ],
  },
  {
    name: '运算符',
    icon: '∫',
    symbols: [
      { label: '\\frac{a}{b}', latex: '\\frac{}{}', tip: '分数', keywords: ['frac', 'fraction'] },
      { label: '\\sqrt{x}', latex: '\\sqrt{}', tip: '平方根', keywords: ['sqrt', 'root'] },
      { label: '\\sqrt[n]{x}', latex: '\\sqrt[]{}', tip: 'n次根' },
      { label: 'a^{b}', latex: '^{}', tip: '上标', keywords: ['^'] },
      { label: 'a_{b}', latex: '_{}', tip: '下标', keywords: ['_'] },
      { label: '\\sum', latex: '\\sum_{}^{}', tip: '求和', keywords: ['sum', 'sigma'] },
      { label: '\\prod', latex: '\\prod_{}^{}', tip: '求积', keywords: ['prod', 'product'] },
      { label: '\\int', latex: '\\int_{}^{}', tip: '积分', keywords: ['int', 'integral'] },
      { label: '\\iint', latex: '\\iint_{}^{}', tip: '二重积分' },
      { label: '\\iiint', latex: '\\iiint_{}^{}', tip: '三重积分' },
      { label: '\\oint', latex: '\\oint_{}^{}', tip: '环路积分' },
      { label: '\\lim', latex: '\\lim_{}', tip: '极限', keywords: ['limit'] },
      { label: '\\log', latex: '\\log_{}', tip: '对数', keywords: ['logarithm'] },
      { label: '\\ln', latex: '\\ln{}', tip: '自然对数' },
      { label: '\\sin', latex: '\\sin{}', tip: '正弦' },
      { label: '\\cos', latex: '\\cos{}', tip: '余弦' },
      { label: '\\tan', latex: '\\tan{}', tip: '正切' },
      { label: '\\arcsin', latex: '\\arcsin{}', tip: '反正弦' },
      { label: '\\arccos', latex: '\\arccos{}', tip: '反余弦' },
      { label: '\\arctan', latex: '\\arctan{}', tip: '反正切' },
      { label: '\\overline{x}', latex: '\\overline{}', tip: '上划线', keywords: ['bar', 'overbar'] },
      { label: '\\overline{AB}', latex: '\\overline{}', tip: '线段' },
      { label: '\\vec{a}', latex: '\\vec{}', tip: '向量', keywords: ['vector'] },
      { label: '\\hat{a}', latex: '\\hat{}', tip: '帽子/估计', keywords: ['hat'] },
      { label: '\\dot{x}', latex: '\\dot{}', tip: '一阶导（点）' },
      { label: '\\ddot{x}', latex: '\\ddot{}', tip: '二阶导' },
      { label: '|x|', latex: '|x|', tip: '绝对值/模' },
      { label: '\\lVert x\\rVert', latex: '\\lVert \\rVert', tip: '范数', keywords: ['norm'] },
    ],
  },
  {
    name: '矩阵',
    icon: '▦',
    symbols: [
      {
        label: 'matrix',
        latex: '\\begin{matrix}\na & b \\\\\nc & d\n\\end{matrix}',
        tip: '无括号矩阵',
        keywords: ['matrix'],
      },
      {
        label: 'pmatrix',
        latex: '\\begin{pmatrix}\na & b \\\\\nc & d\n\\end{pmatrix}',
        tip: '圆括号矩阵',
        keywords: ['pmatrix', '括号矩阵'],
      },
      {
        label: 'bmatrix',
        latex: '\\begin{bmatrix}\na & b \\\\\nc & d\n\\end{bmatrix}',
        tip: '方括号矩阵',
        keywords: ['bmatrix'],
      },
      {
        label: 'vmatrix',
        latex: '\\begin{vmatrix}\na & b \\\\\nc & d\n\\end{vmatrix}',
        tip: '行列式',
        keywords: ['vmatrix', 'determinant'],
      },
      {
        label: 'cases',
        latex: '\\begin{cases}\nx, & x \\ge 0 \\\\\n-x, & x < 0\n\\end{cases}',
        tip: '分段函数',
        keywords: ['cases', 'piecewise'],
      },
      {
        label: 'aligned',
        latex: '\\begin{aligned}\nx &= a + b \\\\\ny &= c + d\n\\end{aligned}',
        tip: '多行对齐',
        keywords: ['aligned', 'align'],
      },
    ],
  },
  {
    name: '微积分',
    icon: '∂',
    symbols: [
      { label: 'f\'(x)', latex: "f'(x)", tip: '一阶导数', keywords: ['derivative'] },
      { label: 'f\'\'(x)', latex: "f''(x)", tip: '二阶导数' },
      { label: '\\frac{dy}{dx}', latex: '\\frac{dy}{dx}', tip: '导数' },
      { label: '\\frac{\\partial}{\\partial x}', latex: '\\frac{\\partial}{\\partial x}', tip: '偏导' },
      { label: '\\nabla', latex: '\\nabla', tip: '梯度/散度', keywords: ['nabla', 'gradient'] },
      { label: '\\int_a^b', latex: '\\int_{a}^{b}', tip: '定积分', keywords: ['integral'] },
      { label: '\\int', latex: '\\int', tip: '不定积分' },
      { label: '\\iint', latex: '\\iint', tip: '二重积分' },
      { label: '\\iiint', latex: '\\iiint', tip: '三重积分' },
      { label: '\\oint', latex: '\\oint', tip: '环路积分' },
      { label: '\\lim_{x\\to 0}', latex: '\\lim_{x \\to 0}', tip: '极限' },
      { label: '\\lim_{x\\to\\infty}', latex: '\\lim_{x \\to \\infty}', tip: '趋无穷极限' },
      { label: '\\infty', latex: '\\infty', tip: '无穷大' },
      { label: '\\partial', latex: '\\partial', tip: '偏导符号' },
      { label: '\\Delta x', latex: '\\Delta x', tip: '增量' },
      { label: '\\mathrm{d}x', latex: '\\mathrm{d}x', tip: '微分dx' },
      { label: '∑', latex: '\\sum_{n=1}^{\\infty}', tip: '无穷级数' },
      { label: '∏', latex: '\\prod_{n=1}^{\\infty}', tip: '无穷乘积' },
      { label: 'f \\circ g', latex: '\\circ', tip: '复合函数' },
    ],
  },
  {
    name: '几何',
    icon: '△',
    symbols: [
      { label: '△ABC', latex: '\\triangle ABC', tip: '三角形' },
      { label: '∠A', latex: '\\angle A', tip: '角' },
      { label: '90°', latex: '90^\\circ', tip: '度' },
      { label: 'AB∥CD', latex: 'AB \\parallel CD', tip: '平行' },
      { label: 'AB⊥CD', latex: 'AB \\perp CD', tip: '垂直' },
      { label: 'AB≅CD', latex: 'AB \\cong CD', tip: '全等' },
      { label: '△ABC∼△DEF', latex: '\\triangle ABC \\sim \\triangle DEF', tip: '相似' },
      { label: '⊙O', latex: '\\odot O', tip: '圆', keywords: ['circle'] },
      { label: '\\overgroup{AB}', latex: '\\widehat{AB}', tip: '弧', keywords: ['arc'] },
      { label: '\\overrightarrow{AB}', latex: '\\overrightarrow{AB}', tip: '向量' },
      { label: '\\bar{AB}', latex: '\\overline{AB}', tip: '线段' },
      { label: 'S_{△ABC}', latex: 'S_{\\triangle ABC}', tip: '面积' },
      { label: 'π', latex: '\\pi', tip: '圆周率' },
      { label: 'A(x₁,y₁)', latex: 'A(x_1, y_1)', tip: '点坐标' },
      { label: '\\sin\\theta', latex: '\\sin\\theta', tip: '正弦' },
      { label: '\\cos\\theta', latex: '\\cos\\theta', tip: '余弦' },
      { label: '\\tan\\theta', latex: '\\tan\\theta', tip: '正切' },
    ],
  },
]

// ======================= KaTeX 预览辅助 =======================

const KATEX_OPTS: katex.KatexOptions = {
  throwOnError: false,
  trust: true,
  strict: false,
}

function renderLatexPreview(latex: string): string {
  try {
    return katex.renderToString(latex, { ...KATEX_OPTS, displayMode: true })
  } catch {
    return `<span class="text-red-500 text-xs">${escapeHtml(latex)}</span>`
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// ======================= 组件 =======================

export default function LatexPanel({
  onInsert,
  isOpen,
  onClose,
  className = '',
}: LatexPanelProps) {
  const [activeTab, setActiveTab] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [previewLatex, setPreviewLatex] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // 关闭 ESC 键
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  // 过滤符号（当前分类 或 全局搜索）
  const filteredSymbols = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()

    if (!q) {
      return LATEX_CATEGORIES[activeTab]?.symbols ?? []
    }

    // 全局搜索：遍历所有分类
    return LATEX_CATEGORIES.flatMap((cat) =>
      cat.symbols.filter(
        (sym) =>
          sym.label.toLowerCase().includes(q) ||
          sym.latex.toLowerCase().includes(q) ||
          sym.tip?.toLowerCase().includes(q) ||
          sym.keywords?.some((kw) => kw.toLowerCase().includes(q)),
      ),
    )
  }, [activeTab, searchQuery])

  // 插入符号
  const handleInsert = useCallback(
    (latex: string) => {
      onInsert(latex)
      setPreviewLatex(null)
    },
    [onInsert],
  )

  // 悬停预览
  const handleHover = useCallback((latex: string | null) => {
    setPreviewLatex(latex)
  }, [])

  if (!isOpen) return null

  return (
    <div
      ref={panelRef}
      className={`fixed right-0 top-0 z-50 flex h-full flex-col border-l border-slate-700/50 bg-slate-900/95 shadow-2xl backdrop-blur-xl transition-all duration-300 ${className}`}
      style={{ width: '360px' }}
    >
      {/* ===== 头部 ===== */}
      <div className="flex items-center justify-between border-b border-slate-700/50 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-200">LaTeX 符号面板</h3>
        <button
          onClick={onClose}
          className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          title="关闭 (Esc)"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* ===== 搜索框 ===== */}
      <div className="border-b border-slate-700/50 px-3 py-2">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索符号... (例: alpha, 分数, 积分)"
            className="w-full rounded-lg border border-slate-700 bg-slate-800/50 py-1.5 pl-8 pr-3 text-xs text-slate-200 placeholder-slate-500 outline-none transition-colors focus:border-blue-500/50 focus:bg-slate-800"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ===== 分类标签页 ===== */}
      {!searchQuery && (
        <div className="flex shrink-0 overflow-x-auto border-b border-slate-700/50">
          {LATEX_CATEGORIES.map((cat, idx) => (
            <button
              key={cat.name}
              onClick={() => setActiveTab(idx)}
              className={`flex shrink-0 items-center gap-1 px-3 py-2 text-xs font-medium transition-colors ${
                idx === activeTab
                  ? 'border-b-2 border-blue-500 text-blue-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="text-sm">{cat.icon}</span>
              <span>{cat.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* ===== 符号网格 ===== */}
      <div className="flex-1 overflow-y-auto p-2">
        {filteredSymbols.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            没有匹配的符号
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-1">
            {filteredSymbols.map((sym, idx) => (
              <button
                key={`${sym.latex}-${idx}`}
                onClick={() => handleInsert(sym.latex)}
                onMouseEnter={() => handleHover(sym.latex)}
                onMouseLeave={() => handleHover(null)}
                className="group flex flex-col items-center justify-center rounded-lg border border-transparent p-2 text-center transition-all hover:border-blue-500/30 hover:bg-blue-500/10 active:scale-95"
                title={sym.tip || sym.label}
              >
                {sym.latex.length <= 8 ? (
                  <span className="text-xs text-slate-300 group-hover:text-blue-300">
                    {sym.label}
                  </span>
                ) : (
                  <span className="text-[10px] leading-tight text-slate-400 group-hover:text-blue-300">
                    {sym.label}
                  </span>
                )}
                <span className="mt-0.5 text-[10px] text-slate-600 group-hover:text-slate-400">
                  {sym.tip || sym.latex.replace(/[{}]/g, '').slice(0, 8)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ===== 实时预览区域 ===== */}
      {previewLatex && (
        <div className="shrink-0 border-t border-slate-700/50 bg-slate-800/80 px-4 py-3">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">预览</div>
          <div className="flex min-h-[48px] items-center justify-center overflow-x-auto rounded-lg bg-slate-900/60 px-3 py-2">
            <div
              className="text-slate-200"
              dangerouslySetInnerHTML={{ __html: renderLatexPreview(previewLatex) }}
            />
          </div>
          <code className="mt-1 block text-center text-[10px] text-slate-500">
            {previewLatex}
          </code>
        </div>
      )}
    </div>
  )
}
