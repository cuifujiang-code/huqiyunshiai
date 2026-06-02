import MathRenderer from '../common/MathRenderer'
import { alignToCss, layoutToPaperStyle } from '../../lib/examLayoutStyles'
import type { ExamLayoutConfig, LayoutExamData } from '../../types/examLayout'
import { formatQuestionNumber } from '../../types/examLayout'

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F']

export interface ExamLayoutPreviewProps {
  exam: LayoutExamData
  layout: ExamLayoutConfig
  className?: string
  paperClassName?: string
}

function renderOptions(options: string[], layout: ExamLayoutConfig) {
  const cleaned = options.filter((o) => o.trim())
  if (!cleaned.length) return null

  const gridClass = layout.optionsLayout === 'horizontal'
    ? 'grid grid-cols-2 gap-x-4 gap-y-1'
    : 'flex flex-col gap-1'

  return (
    <div className={`mt-2 ${gridClass}`}>
      {cleaned.map((opt, idx) => {
        const label = OPTION_LABELS[idx] || String.fromCharCode(65 + idx)
        const text = /^[A-F][.、)\s]/.test(opt.trim()) ? opt : `${label}. ${opt}`
        return (
          <div key={idx} className="text-[length:inherit]">
            <MathRenderer text={text} className="text-[length:inherit]" />
          </div>
        )
      })}
    </div>
  )
}

function renderAnswerBlock(answer: string, analysis: string) {
  return (
    <div className="mt-2 rounded border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-[0.92em]">
      <div className="font-semibold text-emerald-700">答案</div>
      <MathRenderer text={answer || '暂无'} className="text-[length:inherit]" />
      {analysis && analysis !== '暂无' && (
        <>
          <div className="mt-1 font-semibold text-slate-600">解析</div>
          <MathRenderer text={analysis} className="text-[length:inherit]" />
        </>
      )}
    </div>
  )
}

export default function ExamLayoutPreview({
  exam,
  layout,
  className = '',
  paperClassName = '',
}: ExamLayoutPreviewProps) {
  const paperStyle = layoutToPaperStyle(layout)
  const showInlineAnswer = layout.answerMode === 'lecture'
  const showEndAnswers = layout.answerMode === 'homework'

  const allQuestions = exam.sections.flatMap((sec) =>
    sec.questions.map((q) => ({ ...q, sectionType: sec.question_type })),
  )

  return (
    <div className={`overflow-auto ${className}`}>
      <div
        id="exam-layout-preview-paper"
        className={`mx-auto min-h-[1123px] w-full max-w-[794px] shadow-lg ${paperClassName}`}
        style={paperStyle}
      >
        {layout.header.visible && layout.header.text.trim() && (
          <div
            className="mb-4 border-b border-slate-200 pb-2 text-[0.9em] text-slate-600"
            style={{ textAlign: alignToCss(layout.header.align) }}
          >
            {layout.header.text}
          </div>
        )}

        <h1 className="text-center text-[1.25em] font-bold">{exam.title}</h1>
        <p className="mt-2 text-center text-[0.85em] text-slate-500">
          {exam.grade}{exam.subject} · 满分 {exam.totalScore} 分
        </p>

        {exam.sections.map((sec) => (
          <div key={sec.question_type} className="mt-5 break-inside-avoid">
            <h2 className="mb-2 border-b border-slate-300 pb-1 text-[1em] font-semibold">
              {sec.question_type}
              <span className="ml-2 text-[0.85em] font-normal text-slate-500">
                （共 {sec.questions.length} 题）
              </span>
            </h2>

            {sec.questions.map((q) => (
              <div key={`${sec.question_type}-${q.number}`} className="mb-4 break-inside-avoid">
                <div className="flex items-start gap-1">
                  <span className="shrink-0 font-semibold">
                    {formatQuestionNumber(q.number, layout.numberStyle)}
                  </span>
                  <div className="min-w-0 flex-1">
                    {q.score != null && (
                      <span className="mr-1 text-[0.85em] text-slate-500">（{q.score}分）</span>
                    )}
                    <MathRenderer text={q.content} className="inline text-[length:inherit]" />
                    {renderOptions(q.options, layout)}
                    {showInlineAnswer && renderAnswerBlock(q.answer, q.analysis)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}

        {showEndAnswers && allQuestions.length > 0 && (
          <div className="mt-8 break-before-page border-t-2 border-slate-400 pt-4">
            <h2 className="mb-4 text-center text-[1.1em] font-bold">参考答案</h2>
            {allQuestions.map((q) => (
              <div key={`ans-${q.number}`} className="mb-3">
                <span className="font-semibold">
                  {formatQuestionNumber(q.number, layout.numberStyle)}
                </span>
                <span className="ml-2">
                  <MathRenderer text={q.answer || '暂无'} className="inline text-[length:inherit]" />
                </span>
                {q.analysis && q.analysis !== '暂无' && (
                  <div className="ml-6 mt-1 text-[0.92em] text-slate-600">
                    <span className="font-medium">解析：</span>
                    <MathRenderer text={q.analysis} className="inline text-[length:inherit]" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {layout.footer.visible && layout.footer.text.trim() && (
          <div
            className="mt-8 border-t border-slate-200 pt-2 text-[0.85em] text-slate-500"
            style={{ textAlign: alignToCss(layout.footer.align) }}
          >
            {layout.footer.text}
          </div>
        )}
      </div>
    </div>
  )
}
