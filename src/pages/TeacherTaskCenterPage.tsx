import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import DashboardHeader from '../components/layout/DashboardHeader'
import { useAuth } from '../context/AuthContext'
import {
  batchImportQuestions,
  fetchDecomposeStatus,
  fetchDecomposeTasks,
  retryDecomposeTask,
  type DecomposeTaskSummary,
} from '../lib/teacherApi'
import SplitQuestionEditor from '../components/SplitQuestionEditor'
import type { BankQuestion } from '../types/teacher'
import { btnPrimary, btnSecondary, inputClass } from '../types/teacher'

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('zh-CN')
  } catch {
    return iso
  }
}

function statusLabel(status: DecomposeTaskSummary['status'], batchProgress?: DecomposeTaskSummary['batchProgress']) {
  switch (status) {
    case 'processing':
      return '处理中'
    case 'parsed':
      return '解析完成，AI拆题中'
    case 'splitting':
      return batchProgress
        ? `AI拆题中（${batchProgress.completed}/${batchProgress.total}批）`
        : 'AI拆题中'
    case 'completed':
      return '已完成'
    case 'failed':
      return '失败'
    default:
      return status
  }
}

function statusColor(status: DecomposeTaskSummary['status']) {
  if (status === 'completed') return 'text-emerald-400'
  if (status === 'failed') return 'text-red-400'
  return 'text-amber-300'
}

export default function TeacherTaskCenterPage() {
  const { profile } = useAuth()
  const teacherId = profile?.id ?? ''

  const [tasks, setTasks] = useState<DecomposeTaskSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [splitPreview, setSplitPreview] = useState<Partial<BankQuestion>[] | null>(null)
  const [importing, setImporting] = useState(false)

  const loadTasks = useCallback(async () => {
    if (!teacherId) return
    setLoading(true)
    try {
      const list = await fetchDecomposeTasks(teacherId)
      setTasks(list)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '加载任务失败')
    } finally {
      setLoading(false)
    }
  }, [teacherId])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  const refreshTask = async (taskId: string) => {
    setRefreshingId(taskId)
    setMessage(null)
    try {
      const status = await fetchDecomposeStatus(taskId)
      setTasks((prev) =>
        prev.map((t) =>
          t.taskId === taskId
            ? {
                ...t,
                status: status.status === 'not_found' ? t.status : status.status,
                questionCount: status.questionCount ?? (status.questions?.length ?? t.questionCount),
                batchProgress: status.batchProgress ?? t.batchProgress,
                error_message: status.error_message ?? t.error_message,
                updated_at: status.updated_at ?? t.updated_at,
              }
            : t,
        ),
      )
      if (status.status === 'completed') {
        await loadTasks()
      }
      setMessage(status.message || '已刷新')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '刷新失败')
    } finally {
      setRefreshingId(null)
    }
  }

  const viewResult = async (taskId: string) => {
    setMessage(null)
    try {
      const status = await fetchDecomposeStatus(taskId)
      if (status.status !== 'completed' || !status.questions?.length) {
        setMessage(status.message || '任务尚未完成或无题目结果')
        return
      }
      setSplitPreview(status.questions)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '获取结果失败')
    }
  }

  const handleRetry = async (taskId: string) => {
    if (!teacherId) return
    setRetryingId(taskId)
    setMessage(null)
    try {
      await retryDecomposeTask(teacherId, taskId)
      setMessage('已重新提交拆题，请稍后刷新查看')
      await loadTasks()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '重新拆题失败')
    } finally {
      setRetryingId(null)
    }
  }

  const confirmImport = async () => {
    if (!splitPreview || !teacherId) return
    setImporting(true)
    try {
      const { questions, topicTagging } = await batchImportQuestions(teacherId, splitPreview)
      setSplitPreview(null)
      const tagMsg = topicTagging
        ? `；专题自动归类：成功 ${topicTagging.matched}，归入综合题型 ${topicTagging.fallback}`
        : ''
      setMessage(`批量入库成功 ${questions.length} 题${tagMsg}`)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '入库失败')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="min-h-screen text-[#E8ECF3]" style={{ backgroundColor: '#121722' }}>
      <DashboardHeader title="拆题任务中心" backTo="/teacher/question-bank" backLabel="返回题库" featureNavRole="teacher" />
      <main className="mx-auto max-w-5xl px-5 py-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[#8A94A9]">上传 PDF/Word 自动异步拆卷，解析完成自动存入个人题库</p>
          <Link to="/teacher/batch-upload" className="btn-brand text-sm px-4 py-2">
            上传试卷拆题
          </Link>
        </div>

        {/* 右上角刷新按钮 */}
        <div className="flex justify-end mb-4">
          <button type="button" className="btn-secondary text-xs px-3 py-2" onClick={loadTasks} disabled={loading}>
            {loading ? '加载中…' : '🔄 刷新列表'}
          </button>
        </div>

        {message && (
          <p className="mb-4 rounded-[8px] border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-200">{message}</p>
        )}

        <div className="overflow-x-auto rounded-[12px] border border-white/[0.06]" style={{ backgroundColor: '#1C2332' }}>
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-[#8A94A9] text-xs" style={{ backgroundColor: '#1C2332' }}>
              <tr>
                <th className="p-3">文件名</th>
                <th className="p-3">提交时间</th>
                <th className="p-3">状态</th>
                <th className="p-3">题目数</th>
                <th className="p-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {loading && tasks.length === 0 ? (
                <tr><td colSpan={5} className="p-6 text-center text-[#8A94A9]">加载中...</td></tr>
              ) : tasks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center">
                    <p className="text-[#8A94A9] mb-5">暂无拆题任务</p>
                    <Link to="/teacher/batch-upload" className="btn-brand text-base px-6 py-3">
                      上传试卷拆题
                    </Link>
                  </td>
                </tr>
              ) : (
                tasks.map((task) => (
                  <tr key={task.taskId} className="transition hover:bg-white/[0.03]">
                    <td className="p-3">
                      <div className="font-medium">{task.fileName}</div>
                      <div className="text-xs text-[#8A94A9]">{task.subject} · {task.grade}</div>
                    </td>
                    <td className="p-3 text-[#8A94A9]">{formatTime(task.created_at)}</td>
                    <td className={`p-3 ${statusColor(task.status)}`}>
                      {statusLabel(task.status, task.batchProgress ?? undefined)}
                      {task.status === 'failed' && task.error_message && (
                        <div className="mt-1 text-xs text-red-300/80">
                          {task.error_message}
                          {/扫描版\s*PDF/i.test(task.error_message) && (
                            <div className="mt-1 text-amber-200/90">
                              请从
                              <Link to="/teacher/question-bank" className="mx-1 underline">题库</Link>
                              重新上传该 PDF（系统会自动转为图片 OCR）
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="p-3">{task.questionCount || '—'}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        {(task.status === 'processing' || task.status === 'parsed' || task.status === 'splitting') && (
                          <>
                          <button type="button" className="btn-secondary text-xs px-3 py-1.5" disabled={refreshingId === task.taskId} onClick={() => refreshTask(task.taskId)}>
                            {refreshingId === task.taskId ? '刷新中…' : '刷新进度'}
                          </button>
                          <button type="button" className="btn-secondary text-xs px-3 py-1.5 text-amber-300" disabled={retryingId === task.taskId} onClick={() => handleRetry(task.taskId)}>
                            {retryingId === task.taskId ? '提交中…' : '重新拆题'}
                          </button>
                          </>
                        )}
                        {task.status === 'completed' && (
                          <button type="button" className="btn-brand text-xs px-3 py-1.5" onClick={() => viewResult(task.taskId)}>
                            查看结果
                          </button>
                        )}
                        {task.status === 'failed' && (
                          <button type="button" className="btn-secondary text-xs px-3 py-1.5" disabled={retryingId === task.taskId} onClick={() => handleRetry(task.taskId)}>
                            {retryingId === task.taskId ? '提交中…' : '重新拆题'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {splitPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[12px] border border-white/[0.06] p-6" style={{ backgroundColor: '#1C2332' }}>
            <h3 className="mb-4 text-lg font-semibold">拆题结果确认（{splitPreview.length} 道）</h3>
            <div className="space-y-3">
              {splitPreview.map((q, i) => (
                <div key={i} className="rounded-[8px] border border-white/[0.06] p-3">
                  <p className="text-xs text-[#8A94A9] mb-2">{q.question_type} · {q.difficulty} · {q.knowledge_point}</p>
                  <SplitQuestionEditor
                    question={q}
                    teacherId={teacherId}
                    onChange={(updated) => {
                      const next = [...splitPreview]
                      next[i] = updated
                      setSplitPreview(next)
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setSplitPreview(null)} disabled={importing}>取消</button>
              <button type="button" className="btn-brand" onClick={confirmImport} disabled={importing}>{importing ? '入库中…' : '确认入库'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
