import { useMemo, useState } from 'react'
import type { ExamPaper as ExamPaperType, ExamQuestion, QuestionType } from '../../types/exam'
import { QUESTION_TYPE_ORDER } from '../../types/exam'

interface ExamPaperProps {
  exam: ExamPaperType
  paperRef?: React.RefObject<HTMLDivElement | null>
  showActions?: boolean
  onExportPdf?: () => void
  onSave?: () => void
  exporting?: boolean
  saving?: boolean
  saved?: boolean
}

const SECTION_TYPE_LABELS: Record<string, string> = {
  选择题: '选择题',
  填空题: '填空题',
  计算题: '计算题',
  简答题: '简答题',
  实验题: '实验探究题',
}

const SECTION_NUMERALS = ['一', '二', '三', '四', '五', '六']

function groupQuestions(questions: ExamQuestion[]) {
  const groups = new Map<QuestionType, ExamQuestion[]>()
  for (const q of questions) {
    const list = groups.get(q.type) ?? []
    list.push(q)
    groups.set(q.type, list)
  }
  return QUESTION_TYPE_ORDER.filter((t) => groups.has(t)).map((type) => ({
    type,
    questions: groups.get(type)!,
  }))
}

function QuestionItem({ question, index }: { question: ExamQuestion; index: number }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="mb-5 border-b border-slate-200 pb-4 last:border-0">
      <p className="text-base leading-relaxed text-slate-800">
        <span className="mr-1 font-medium">{index}.</span>
        {question.content}
        {question.score != null && (
          <span className="ml-2 text-sm text-slate-500">（{question.score}分）</span>
        )}
      </p>
      {question.options && question.options.length > 0 && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {question.options.map((opt) => (
            <p key={opt} className="text-sm text-slate-700">
              {opt}
            </p>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700"
      >
        {expanded ? '收起答案与解析 ▲' : '查看答案与解析 ▼'}
      </button>
      {expanded && (
        <div className="mt-2 rounded-lg bg-blue-50 p-3 text-sm text-slate-700">
          <p>
            <span className="font-medium text-slate-900">正确答案：</span>
            {question.answer}
          </p>
          <p className="mt-2 whitespace-pre-wrap">
            <span className="font-medium text-slate-900">解析：</span>
            {question.analysis}
          </p>
          {question.knowledgeTags.length > 0 && (
            <p className="mt-2">
              <span className="font-medium text-slate-900">知识点：</span>
              {question.knowledgeTags.join('、')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function ExamPaper({
  exam,
  paperRef,
  showActions = true,
  onExportPdf,
  onSave,
  exporting,
  saving,
  saved,
}: ExamPaperProps) {
  const sections = useMemo(() => groupQuestions(exam.questions), [exam.questions])
  let questionIndex = 0

  return (
    <div className="flex flex-col">
      <div
        ref={paperRef}
        className="rounded-xl bg-white p-6 text-slate-900 shadow-inner sm:p-8"
        id="exam-paper-content"
      >
        <h1 className="text-center text-xl font-bold sm:text-2xl">{exam.title}</h1>
        <div className="mt-4 flex flex-wrap justify-between gap-2 border-b border-slate-300 pb-4 text-sm text-slate-600">
          <span>考试时间：{exam.duration} 分钟</span>
          <span>满分：{exam.totalScore} 分</span>
          <span>姓名：__________</span>
          <span>得分：__________</span>
        </div>

        {sections.map((section, sectionIdx) => {
          const typeLabel = SECTION_TYPE_LABELS[section.type] ?? section.type
          const sectionLabel = `${SECTION_NUMERALS[sectionIdx] ?? sectionIdx + 1}、${typeLabel}`

          return (
            <div key={section.type} className="mt-6">
              <h2 className="mb-4 text-base font-bold text-slate-900">{sectionLabel}</h2>
              {section.questions.map((q) => {
                questionIndex += 1
                return <QuestionItem key={q.id} question={q} index={questionIndex} />
              })}
            </div>
          )
        })}
      </div>

      {showActions && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onExportPdf}
            disabled={exporting}
            className="flex-1 rounded-xl border border-blue-500/40 bg-blue-500/10 px-4 py-2.5 text-sm font-medium text-blue-200 transition hover:bg-blue-500/20 disabled:opacity-60"
          >
            {exporting ? '正在导出...' : '导出为 PDF'}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || saved}
            className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-600/30 transition hover:from-blue-500 hover:to-cyan-400 disabled:opacity-60"
          >
            {saved ? '已保存到我的题库' : saving ? '保存中...' : '保存到我的题库'}
          </button>
        </div>
      )}
    </div>
  )
}
