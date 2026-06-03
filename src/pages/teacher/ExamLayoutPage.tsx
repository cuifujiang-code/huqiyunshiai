import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import DashboardHeader from '../../components/layout/DashboardHeader'
import ExamLayoutPreview from '../../components/exam/ExamLayoutPreview'
import { useQuestionBasket } from '../../context/QuestionBasketContext'
import { exportExamLayoutWord } from '../../lib/examLayoutExport'
import { exportToPdf } from '../../lib/exportPdf'
import type { BuiltExam } from '../../types/teacher'
import { btnPrimary, btnSecondary, inputClass } from '../../types/teacher'
import {
  DEFAULT_EXAM_LAYOUT,
  EXAM_FONT_FAMILIES,
  EXAM_FONT_SIZES,
  EXAM_LINE_HEIGHTS,
  basketToLayoutData,
  builtExamToLayoutData,
  loadLayoutExamData,
  saveLayoutExamData,
  type ExamAnswerMode,
  type ExamColumnMode,
  type ExamLayoutConfig,
  type ExamNumberStyle,
  type ExamOptionsLayout,
  type ExamTextAlign,
  type LayoutExamData,
} from '../../types/examLayout'

type LocationState = { exam?: BuiltExam }

/* ---------- 子组件 ---------- */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#8A94A9]">{children}</h3>
}

function ToggleGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { id: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-[#8A94A9]">{label}</label>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`rounded-lg px-2.5 py-1.5 text-xs transition ${
              value === opt.id
                ? 'bg-[#2584FF]/20 text-[#5C9DFF] ring-1 ring-[#2584FF]/40'
                : 'bg-[#1C2332] text-[#8A94A9] hover:bg-[#222B3E] hover:text-[#E8ECF3]'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function MarginSlider({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-[#8A94A9]">
        <span>{label}</span>
        <span className="text-[#E8ECF3]">{value}px</span>
      </div>
      <input
        type="range"
        min={24}
        max={120}
        step={4}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#2584FF]"
      />
    </div>
  )
}

function HeaderFooterControl({
  title,
  config,
  onChange,
}: {
  title: string
  config: ExamLayoutConfig['header']
  onChange: (next: ExamLayoutConfig['header']) => void
}) {
  return (
    <div className="rounded-[12px] border border-white/[0.06] bg-[#1C2332] p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-[#E8ECF3]">{title}</span>
        <label className="flex items-center gap-1.5 text-xs text-[#8A94A9]">
          <input
            type="checkbox"
            checked={config.visible}
            onChange={(e) => onChange({ ...config, visible: e.target.checked })}
            className="accent-[#2584FF]"
          />
          显示
        </label>
      </div>
      <input
        className={`${inputClass} mb-2 py-2 text-sm`}
        placeholder={`${title}文字`}
        value={config.text}
        disabled={!config.visible}
        onChange={(e) => onChange({ ...config, text: e.target.value })}
      />
      <div className="flex gap-1">
        {(['left', 'center', 'right'] as ExamTextAlign[]).map((align) => (
          <button
            key={align}
            type="button"
            disabled={!config.visible}
            onClick={() => onChange({ ...config, align })}
            className={`flex-1 rounded py-1 text-xs transition ${
              config.align === align
                ? 'bg-[#2584FF]/20 text-[#5C9DFF]'
                : 'bg-[#222B3E] text-[#8A94A9]'
            } disabled:opacity-40`}
          >
            {align === 'left' ? '居左' : align === 'center' ? '居中' : '居右'}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ---------- 主组件 ---------- */

export default function ExamLayoutPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const previewRef = useRef<HTMLDivElement>(null)
  const { items: basketItems } = useQuestionBasket()

  const [layout, setLayout] = useState<ExamLayoutConfig>(DEFAULT_EXAM_LAYOUT)
  const [exam, setExam] = useState<LayoutExamData | null>(null)
  const [exporting, setExporting] = useState<'pdf' | 'word' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [showExportMenu, setShowExportMenu] = useState(false)

  const resolveExamData = useCallback((): LayoutExamData | null => {
    const state = (location.state as LocationState | null)?.exam
    if (state) {
      const data = builtExamToLayoutData(state)
      saveLayoutExamData(data)
      return data
    }
    const stored = loadLayoutExamData()
    if (stored) return stored
    if (basketItems.length > 0) return basketToLayoutData(basketItems)
    return null
  }, [location.state, basketItems])

  useEffect(() => {
    setExam(resolveExamData())
  }, [resolveExamData])

  const patchLayout = useCallback((patch: Partial<ExamLayoutConfig>) => {
    setLayout((prev) => ({ ...prev, ...patch }))
  }, [])

  const patchMargins = useCallback((key: keyof ExamLayoutConfig['margins'], value: number) => {
    setLayout((prev) => ({
      ...prev,
      margins: { ...prev.margins, [key]: value },
    }))
  }, [])

  const answerModeOptions = useMemo(
    () => [
      { id: 'practice' as ExamAnswerMode, label: '纯练习卷' },
      { id: 'lecture' as ExamAnswerMode, label: '随堂讲解卷' },
      { id: 'homework' as ExamAnswerMode, label: '课后作业卷' },
    ],
    [],
  )

  const confirmExport = () => {
    return window.confirm('请确认右侧预览效果无误，导出文件将与预览 1:1 还原。是否继续？')
  }

  const handleExportPdf = async () => {
    if (!exam || !previewRef.current) return
    const paper = previewRef.current.querySelector('#exam-layout-preview-paper') as HTMLElement | null
    if (!paper) {
      setMessage('未找到预览区域')
      return
    }
    if (!confirmExport()) return

    setExporting('pdf')
    setMessage(null)
    setShowExportMenu(false)
    try {
      await exportToPdf(paper, `${exam.title}.pdf`)
      setMessage('PDF 导出成功')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'PDF 导出失败')
    } finally {
      setExporting(null)
    }
  }

  const handleExportWord = () => {
    if (!exam) return
    if (!confirmExport()) return

    setExporting('word')
    setMessage(null)
    setShowExportMenu(false)
    try {
      exportExamLayoutWord(exam, layout)
      setMessage('Word 导出成功')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Word 导出失败')
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#121722] text-[#E8ECF3]">
      <DashboardHeader title="组卷排版" backTo="/teacher/exam-builder" backLabel="返回组卷" featureNavRole="teacher" />

      {message && (
        <p className="mx-4 mt-3 shrink-0 rounded-[8px] border border-[#2584FF]/30 bg-[#2584FF]/10 px-3 py-2 text-sm text-[#5C9DFF]">
          {message}
        </p>
      )}

      <main className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 gap-0 px-4 py-4">
        {/* 左侧参数面板 35% */}
        <aside className="flex w-[35%] min-w-[300px] flex-col rounded-[12px] border border-white/[0.06] bg-[#1C2332]">
          <div className="border-b border-white/[0.06] px-4 py-3">
            <h2 className="font-semibold text-[#E8ECF3]">排版参数</h2>
            <p className="mt-1 text-xs text-[#8A94A9]">修改后右侧实时刷新</p>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {/* 分组1：字体&字号设置 */}
            <section>
              <SectionTitle>字体 & 字号设置</SectionTitle>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[#8A94A9]">字体类型</label>
                  <select
                    className={`${inputClass} py-2 text-sm`}
                    value={layout.fontFamily}
                    onChange={(e) => patchLayout({ fontFamily: e.target.value as ExamLayoutConfig['fontFamily'] })}
                  >
                    {EXAM_FONT_FAMILIES.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[#8A94A9]">字体大小</label>
                  <select
                    className={`${inputClass} py-2 text-sm`}
                    value={layout.fontSize}
                    onChange={(e) => patchLayout({ fontSize: e.target.value as ExamLayoutConfig['fontSize'] })}
                  >
                    {EXAM_FONT_SIZES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            {/* 分组2：页边距 & 行距 */}
            <section>
              <SectionTitle>页边距 & 行距</SectionTitle>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-[#8A94A9]">
                  <span>全局行距</span>
                  <span className="text-[#E8ECF3]">{layout.lineHeight} 倍</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={EXAM_LINE_HEIGHTS.length - 1}
                  step={1}
                  value={Math.max(0, EXAM_LINE_HEIGHTS.findIndex((lh) => lh === layout.lineHeight))}
                  onChange={(e) => patchLayout({ lineHeight: EXAM_LINE_HEIGHTS[Number(e.target.value)] })}
                  className="w-full accent-[#2584FF]"
                />
                <div className="mt-1 flex justify-between text-[10px] text-[#8A94A9]">
                  {EXAM_LINE_HEIGHTS.map((lh) => (
                    <span key={lh}>{lh}</span>
                  ))}
                </div>
              </div>

              <label className="mb-2 mt-4 block text-xs font-medium text-[#8A94A9]">页边距（像素）</label>
              <div className="grid grid-cols-2 gap-3">
                <MarginSlider label="上" value={layout.margins.top} onChange={(v) => patchMargins('top', v)} />
                <MarginSlider label="下" value={layout.margins.bottom} onChange={(v) => patchMargins('bottom', v)} />
                <MarginSlider label="左" value={layout.margins.left} onChange={(v) => patchMargins('left', v)} />
                <MarginSlider label="右" value={layout.margins.right} onChange={(v) => patchMargins('right', v)} />
              </div>
            </section>

            <ToggleGroup<ExamColumnMode>
              label="分栏模式"
              value={layout.columnMode}
              options={[
                { id: 'single', label: '单栏' },
                { id: 'double', label: '双栏' },
              ]}
              onChange={(v) => patchLayout({ columnMode: v })}
            />

            {/* 分组3：题目格式 & 选项排列 */}
            <section>
              <SectionTitle>题目格式 & 选项</SectionTitle>
              <ToggleGroup<ExamNumberStyle>
                label="题目序号样式"
                value={layout.numberStyle}
                options={[
                  { id: 'dot', label: '1.' },
                  { id: 'paren', label: '(1)' },
                  { id: 'bracket', label: '【1】' },
                ]}
                onChange={(v) => patchLayout({ numberStyle: v })}
              />

              <div className="mt-3">
                <ToggleGroup<ExamOptionsLayout>
                  label="选项排列"
                  value={layout.optionsLayout}
                  options={[
                    { id: 'horizontal', label: '横向' },
                    { id: 'vertical', label: '竖向' },
                  ]}
                  onChange={(v) => patchLayout({ optionsLayout: v })}
                />
              </div>

              <div className="mt-3">
                <ToggleGroup<ExamAnswerMode>
                  label="答案展示模式"
                  value={layout.answerMode}
                  options={answerModeOptions}
                  onChange={(v) => patchLayout({ answerMode: v })}
                />
              </div>
            </section>

            {/* 分组4：页眉 & 页脚 */}
            <section>
              <SectionTitle>页眉 & 页脚</SectionTitle>
              <div className="space-y-3">
                <HeaderFooterControl
                  title="页眉"
                  config={layout.header}
                  onChange={(header) => patchLayout({ header })}
                />
                <HeaderFooterControl
                  title="页脚"
                  config={layout.footer}
                  onChange={(footer) => patchLayout({ footer })}
                />
              </div>
            </section>
          </div>
        </aside>

        {/* 右侧预览 65% */}
        <section className="relative flex w-[65%] flex-col pl-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium text-[#E8ECF3]">实时预览</h2>
            {exam && (
              <span className="text-xs text-[#8A94A9]">
                {exam.sections.reduce((n, s) => n + s.questions.length, 0)} 题 · {exam.title}
              </span>
            )}
          </div>

          <div ref={previewRef} className="min-h-0 flex-1 rounded-[12px] border border-white/[0.06] bg-[#1C2332] p-4">
            {!exam ? (
              <div className="flex h-full min-h-[400px] flex-col items-center justify-center text-center">
                <p className="text-[#8A94A9]">暂无试卷数据</p>
                <p className="mt-2 text-sm text-[#8A94A9]">
                  请先在
                  <Link to="/teacher/exam-builder" className="mx-1 text-[#2584FF] hover:underline">智能组卷</Link>
                  生成试卷，或将题目加入试题篮
                </p>
                <button
                  type="button"
                  className={`${btnSecondary} mt-4`}
                  onClick={() => navigate('/teacher/exam-builder')}
                >
                  前往组卷
                </button>
              </div>
            ) : (
              <ExamLayoutPreview exam={exam} layout={layout} className="h-full" />
            )}
          </div>

          {/* 悬浮导出按钮（右下角） */}
          {exam && (
            <div className="absolute bottom-5 right-5">
              {showExportMenu && (
                <div className="mb-2 flex flex-col gap-2 rounded-[12px] border border-white/[0.06] bg-[#1C2332] p-3 shadow-lg shadow-black/40">
                  <button
                    type="button"
                    className={`${btnSecondary} w-full text-xs`}
                    disabled={exporting !== null}
                    onClick={() => void handleExportPdf()}
                  >
                    {exporting === 'pdf' ? '导出中…' : '导出 PDF'}
                  </button>
                  <button
                    type="button"
                    className={`${btnPrimary} w-full text-xs`}
                    disabled={exporting !== null}
                    onClick={handleExportWord}
                  >
                    {exporting === 'word' ? '导出中…' : '导出 Word'}
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[#2584FF] text-lg text-white shadow-lg shadow-[#2584FF]/30 transition hover:bg-[#0F70E8] hover:scale-110"
                title="导出"
              >
                {showExportMenu ? '✕' : '⬇'}
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
