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
      await batchImportQuestions(teacherId, splitPreview)
      setSplitPreview(null)
      setMessage('批量入库成功')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '入库失败')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <DashboardHeader title="拆题任务中心" backTo="/teacher/question-bank" backLabel="返回题库" featureNavRole="teacher" />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-400">后台异步处理试卷拆题，可随时刷新查看进度</p>
          <button type="button" className={btnSecondary} onClick={loadTasks} disabled={loading}>
            {loading ? '加载中...' : '刷新列表'}
          </button>
        </div>

        {message && (
          <p className="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-200">{message}</p>
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-800/80 text-slate-400">
              <tr>
                <th className="p-3">文件名</th>
                <th className="p-3">提交时间</th>
                <th className="p-3">状态</th>
                <th className="p-3">题目数</th>
                <th className="p-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && tasks.length === 0 ? (
                <tr><td colSpan={5} className="p-6 text-center text-slate-500">加载中...</td></tr>
              ) : tasks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-500">
                    暂无拆题任务，请前往
                    {' '}
                    <Link to="/teacher/question-bank" className="text-cyan-400 hover:underline">我的题库</Link>
                    {' '}
                    上传试卷
                  </td>
                </tr>
              ) : (
                tasks.map((task) => (
                  <tr key={task.taskId} className="border-t border-slate-800 hover:bg-slate-900/50">
                    <td className="p-3">
                      <div className="font-medium">{task.fileName}</div>
                      <div className="text-xs text-slate-500">{task.subject} · {task.grade}</div>
                    </td>
                    <td className="p-3 text-slate-400">{formatTime(task.created_at)}</td>
                    <td className={`p-3 ${statusColor(task.status)}`}>
                      {statusLabel(task.status, task.batchProgress ?? undefined)}
                      {task.status === 'failed' && task.error_message && (
                        <div className="mt-1 text-xs text-red-300/80">{task.error_message}</div>
                      )}
                    </td>
                    <td className="p-3">{task.questionCount || '—'}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        {(task.status === 'processing' || task.status === 'parsed' || task.status === 'splitting') && (
                          <button
                            type="button"
                            className={btnSecondary}
                            disabled={refreshingId === task.taskId}
                            onClick={() => refreshTask(task.taskId)}
                          >
                            {refreshingId === task.taskId ? '刷新中...' : '刷新'}
                          </button>
                        )}
                        {task.status === 'completed' && (
                          <button type="button" className={btnPrimary} onClick={() => viewResult(task.taskId)}>
                            查看结果
                          </button>
                        )}
                        {task.status === 'failed' && (
                          <button
                            type="button"
                            className={btnSecondary}
                            disabled={retryingId === task.taskId}
                            onClick={() => handleRetry(task.taskId)}
                          >
                            {retryingId === task.taskId ? '提交中...' : '重新拆题'}
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
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <h3 className="mb-4 text-lg font-semibold">拆题结果确认（{splitPreview.length} 道）</h3>
            <div className="space-y-3">
              {splitPreview.map((q, i) => (
                <div key={i} className="rounded-lg border border-slate-700 p-3">
                  <p className="text-xs text-slate-500">{q.question_type} · {q.difficulty} · {q.knowledge_point}</p>
                  <textarea
                    className={`${inputClass} mt-2`}
                    rows={2}
                    value={q.content}
                    onChange={(e) => {
                      const next = [...splitPreview]
                      next[i] = { ...q, content: e.target.value }
                      setSplitPreview(next)
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={btnSecondary} onClick={() => setSplitPreview(null)} disabled={importing}>
                取消
              </button>
              <button type="button" className={btnPrimary} onClick={confirmImport} disabled={importing}>
                {importing ? '入库中...' : '确认入库'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
