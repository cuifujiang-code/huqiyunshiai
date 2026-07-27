import type { BookChapter, BookRecord } from '../../types/teacher'
import { useState, useEffect } from 'react'
import { btnPrimary, btnSecondary, inputClass } from '../../types/teacher'

interface SmartGenResult {
  coreIdea: { coreIdea: string; learningObjectives: string[]; targetAudience: string }
  reorganizationPlan: { reorganizationPlan: unknown[]; newSectionsSuggested: unknown[]; pedagogicallNotes: string[] }
  augmentationResult: { augmentionPlan: unknown[]; executions: unknown[] }
  previewChapters: BookChapter[]
  studentVersionId: string | null
  teacherVersionId: string | null
  adjustmentReport: string
  report: { stages: { stage: string; status: string; message: string }[] }
}

interface Props {
  open: boolean
  onClose: () => void
  teacherId: string
  bookRecord: BookRecord
  onComplete: (result: SmartGenResult) => void
}

export default function BookSmartGenerateModal({ open, onClose, teacherId, bookRecord, onComplete }: Props) {
  if (!open) return null

  const [stage, setStage] = useState<'config' | 'running' | 'done' | 'report'>('config')
  const [options, setOptions] = useState({
    preserveAllQuestions: true,
    generateDualVersion: true,
    augmentFromBank: true,
  })
  const [result, setResult] = useState<SmartGenResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeStage, setActiveStage] = useState(0)

  const chapterCount = (bookRecord.chapters || []).length
  const blockCount = (bookRecord.chapters || []).reduce(
    (n, ch) => n + (ch.sections || []).reduce((m, s) => m + (s.blocks || []).length, 0),
    0,
  )

  const handleStart = async () => {
    if (!teacherId) {
      setError('请先登录')
      return
    }
    if (chapterCount === 0) {
      setError('请先导入或创建教辅书内容')
      return
    }

    setStage('running')
    setLoading(true)
    setError(null)
    setActiveStage(0)

    try {
      const resp = await fetch('/api/teacher/book/smart-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherId,
          title: bookRecord.title,
          subject: '数学', // 可从 bookRecord 扩展
          grade: bookRecord.grade,
          level: bookRecord.level,
          chapters: bookRecord.chapters,
          options,
        }),
      })

      const data = await resp.json()
      if (!resp.ok || !data.success) {
        throw new Error(data.message || '智能生成失败')
      }

      setResult(data.result)
      setStage('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : '请求失败')
      setStage('config')
    } finally {
      setLoading(false)
    }
  }

  const renderConfig = () => (
    <div className="space-y-4">
      <div className="rounded-[8px] border border-blue-500/20 bg-blue-500/5 p-4">
        <p className="mb-2 text-sm font-semibold text-blue-300">📊 原稿分析</p>
        <p className="text-sm text-blue-200">
          共 <span className="font-bold">{chapterCount}</span> 章、<span className="font-bold">{blockCount}</span> 个内容块
        </p>
        <p className="mt-1 text-xs text-blue-200/70">系统将完整保留所有题目，并对内容结构进行智能优化</p>
      </div>

      <div className="space-y-3">
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={options.preserveAllQuestions}
            onChange={e => setOptions({ ...options, preserveAllQuestions: e.target.checked })}
            className="h-4 w-4 rounded border-white/20 bg-[#1C2332] text-[#2584FF]"
          />
          <span>✅ 保留全部原有题目（不删除、不合并）</span>
        </label>

        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={options.generateDualVersion}
            onChange={e => setOptions({ ...options, generateDualVersion: e.target.checked })}
            className="h-4 w-4 rounded border-white/20 bg-[#1C2332] text-[#2584FF]"
          />
          <span>📚 生成双版本（学生版无解析 / 教师版含解析）</span>
        </label>

        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={options.augmentFromBank}
            onChange={e => setOptions({ ...options, augmentFromBank: e.target.checked })}
            className="h-4 w-4 rounded border-white/20 bg-[#1C2332] text-[#2584FF]"
          />
          <span>🤖 从题库智能增补合适题目</span>
        </label>
      </div>

      {error && (
        <p className="rounded-[8px] border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button type="button" className={btnPrimary} onClick={handleStart} disabled={loading}>
          🚀 开始智能生成
        </button>
        <button type="button" className={btnSecondary} onClick={onClose}>
          取消
        </button>
      </div>
    </div>
  )

  const renderRunning = () => (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-[#5C9DFF]">⏳ 智能生成进行中，预计需要 1-3 分钟...</p>
      <div className="space-y-2">
        {[
          { key: 'extractCore', label: '🔍 分析原稿核心思想' },
          { key: 'reorganize', label: '📐 生成内容重组方案' },
          { key: 'augment', label: '📦 从题库智能增补题目' },
          { key: 'apply', label: '🔧 应用调整方案' },
          { key: 'export', label: '📄 生成学生版/教师版' },
        ].map((s, i) => {
          const stg = result?.report?.stages?.[i]
          const isActive = i === activeStage
          const isDone = stg?.status === 'done'
          const isPending = !stg
          return (
            <div
              key={s.key}
              className={`flex items-center gap-3 rounded-[8px] px-3 py-2 text-sm ${
                isDone ? 'border border-emerald-500/20 bg-emerald-500/5 text-emerald-300'
                : isActive ? 'border border-blue-500/30 bg-blue-500/10 text-blue-200 animate-pulse'
                : 'border border-white/5 bg-white/[0.02] text-[#8A94A9]'
              }`}
            >
              <span className="w-5 text-center">{isDone ? '✅' : isActive ? '⏳' : '⏸️'}</span>
              <span>{s.label}</span>
              {stg?.message && <span className="ml-auto text-xs opacity-60">{stg.message}</span>}
            </div>
          )
        })}
      </div>
      <p className="text-xs text-[#8A94A9]">请勿关闭此窗口，生成完成后会自动跳转...</p>
    </div>
  )

  const renderDone = () => (
    <div className="space-y-4">
      <div className="rounded-[8px] border border-emerald-500/20 bg-emerald-500/5 p-4">
        <p className="mb-2 text-lg font-bold text-emerald-300">✅ 智能生成完成！</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[#8A94A9]">核心思想</p>
            <p className="mt-1 text-emerald-200">{result?.coreIdea?.coreIdea?.slice(0, 60)}...</p>
          </div>
          <div>
            <p className="text-[#8A94A9]">章节调整</p>
            <p className="mt-1 text-emerald-200">{(result?.reorganizationPlan?.reorganizationPlan || []).length} 处</p>
          </div>
          <div>
            <p className="text-[#8A94A9]">题目增补</p>
            <p className="mt-1 text-emerald-200">{(result?.augmentationResult?.executions || []).length} 处</p>
          </div>
          <div>
            <p className="text-[#8A94A9]">双版本</p>
            <p className="mt-1 text-emerald-200">
              {result?.studentVersionId ? '✅ 学生版' : '❌'} / {result?.teacherVersionId ? '✅ 教师版' : '❌'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={btnPrimary}
          onClick={() => {
            onComplete(result!)
            onClose()
          }}
        >
          ✅ 应用生成结果
        </button>
        <button type="button" className={btnSecondary} onClick={() => setStage('report')}>
          📋 查看调整报告
        </button>
        <button type="button" className={btnSecondary} onClick={onClose}>
          关闭
        </button>
      </div>
    </div>
  )

  const renderReport = () => (
    <div className="max-h-[60vh] overflow-y-auto">
      <pre className="whitespace-pre-wrap rounded-[8px] bg-[#0D1117] p-4 text-xs leading-relaxed text-[#E8ECF3]">
        {result?.adjustmentReport || '（暂无报告）'}
      </pre>
      <div className="mt-4 flex gap-3">
        <button type="button" className={btnSecondary} onClick={() => setStage('done')}>
          ← 返回
        </button>
        <button
          type="button"
          className={btnPrimary}
          onClick={() => {
            // 下载报告
            const blob = new Blob([result?.adjustmentReport || ''], { type: 'text/markdown;charset=utf-8' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${bookRecord.title}-调整报告.md`
            a.click()
            URL.revokeObjectURL(url)
          }}
        >
          📥 下载报告
        </button>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-[700px] rounded-[16px] border border-white/10 bg-[#1C2332] p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-[#E8ECF3]">🧠 教辅书智能生成（最强版）</h3>
          <button type="button" onClick={onClose} className="text-[#8A94A9] hover:text-white">✕</button>
        </div>

        {stage === 'config' && renderConfig()}
        {stage === 'running' && renderRunning()}
        {stage === 'done' && renderDone()}
        {stage === 'report' && renderReport()}
      </div>
    </div>
  )
}
