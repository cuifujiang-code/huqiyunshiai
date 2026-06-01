import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import DashboardHeader from '../components/layout/DashboardHeader'
import { useAuth } from '../context/AuthContext'
import { useQuestionBasket } from '../context/QuestionBasketContext'
import { fileToBase64 } from '../lib/fileBase64'
import {
  diagnoseEmptyQuestions,
  fetchBatchHealth,
  fetchBatchProgress,
  isTaskStuck,
  listBatchTasks,
  startBatchTask,
  triggerBatchAutoRetry,
  uploadBatchTask,
  type BatchProgress,
  type BatchQuestion,
} from '../lib/batchApi'
import BatchQuestionPreview from '../components/batch/BatchQuestionPreview'
import QuestionBasket from '../components/batch/QuestionBasket'
import { TEACHER_GRADES, TEACHER_SUBJECTS, btnPrimary, btnSecondary, inputClass } from '../types/teacher'

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('zh-CN')
  } catch {
    return iso
  }
}

function statusLabel(status: BatchProgress['status']) {
  switch (status) {
    case 'pending':
      return '待启动'
    case 'running':
      return '处理中'
    case 'completed':
      return '已完成'
    case 'partial':
      return '部分完成'
    case 'failed':
      return '失败'
    default:
      return status
  }
}

function statusColor(status: BatchProgress['status']) {
  if (status === 'completed') return 'text-emerald-400'
  if (status === 'failed') return 'text-red-400'
  if (status === 'partial') return 'text-amber-400'
  return 'text-cyan-300'
}

export default function TeacherBatchDecomposePage() {
  const { profile } = useAuth()
  const teacherId = profile?.id ?? ''

  const [subject, setSubject] = useState('数学')
  const [grade, setGrade] = useState('八年级')
  const [uploading, setUploading] = useState(false)
  const [tasks, setTasks] = useState<BatchProgress[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [preview, setPreview] = useState<BatchQuestion[] | null>(null)
  const [previewEmpty, setPreviewEmpty] = useState(false)
  const [previewEmptyHint, setPreviewEmptyHint] = useState('')
  const [startingId, setStartingId] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoRetryRef = useRef(false)
  const tasksRef = useRef<BatchProgress[]>([])
  tasksRef.current = tasks
  const { count: basketCount } = useQuestionBasket()

  const loadTasks = useCallback(async () => {
    if (!teacherId) return
    setLoading(true)
    try {
      const res = await listBatchTasks(teacherId)
      setTasks(res.tasks ?? [])
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '加载任务失败')
    } finally {
      setLoading(false)
    }
  }, [teacherId])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  useEffect(() => {
    if (!teacherId || autoRetryRef.current) return
    autoRetryRef.current = true
    triggerBatchAutoRetry()
      .then((report) => {
        if (report.processed > 0) {
          setMessage(`已自动恢复 ${report.processed} 个卡住的批量任务`)
          loadTasks()
        }
      })
      .catch(() => {})
  }, [teacherId, loadTasks])

  useEffect(() => {
    const hasRunning = tasks.some(
      (t) =>
        t.status === 'running'
        || t.status === 'pending'
        || (t.status === 'partial' && (t.pendingItems > 0 || t.processingItems > 0)),
    )
    const hasStuck = tasks.some((t) => isTaskStuck(t))
    if ((hasRunning || hasStuck) && !pollRef.current) {
      pollRef.current = setInterval(() => {
        loadTasks()
        if (tasksRef.current.some((t) => isTaskStuck(t))) {
          triggerBatchAutoRetry().catch(() => {})
        }
      }, 5000)
    }
    if (!hasRunning && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [tasks, loadTasks])

  const handleUpload = async (file: File) => {
    if (!teacherId) return
    setUploading(true)
    setMessage(null)
    try {
      const base64 = await fileToBase64(file)
      const uploaded = await uploadBatchTask(teacherId, base64, file.name, subject, grade)

      if (!uploaded.batchId) {
        throw new Error('上传成功但未返回 batchId，请检查 API 部署与环境变量')
      }

      const chunkCount = uploaded.totalItems || uploaded.chunkCount || uploaded.total_chunks
      if (!uploaded.autoStarted && uploaded.status === 'pending' && !uploaded.startFailed) {
        console.log('[BatchDecompose] upload 未自动启动，手动调用 start', uploaded.batchId)
        await startBatchTask(teacherId, uploaded.batchId)
      } else if (uploaded.startFailed) {
        console.warn('[BatchDecompose] Worker 启动失败，任务已创建', uploaded)
      }

      setMessage(
        uploaded.message
        || `已提交大批量拆题：${chunkCount} 个分块，后台正在处理（任务 ID: ${uploaded.batchId.slice(0, 8)}…）`,
      )
      await loadTasks()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '提交失败')
    } finally {
      setUploading(false)
    }
  }

  const handleStart = async (batchId: string, rerun = false) => {
    if (!teacherId) return
    setStartingId(batchId)
    setMessage(null)
    try {
      const res = await startBatchTask(teacherId, batchId, rerun ? { rerun: true } : undefined)
      setMessage(res.message || (rerun ? '已重新开始拆题' : '已启动批量拆题'))
      await loadTasks()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '启动失败')
      await loadTasks()
    } finally {
      setStartingId(null)
    }
  }

  const viewResult = async (batchId: string) => {
    if (!teacherId) return
    setMessage(null)
    setPreviewEmpty(false)
    setPreviewEmptyHint('')
    try {
      const taskSnapshot = tasks.find((t) => t.batchId === batchId)
      let res
      try {
        res = await fetchBatchProgress(teacherId, batchId, true)
      } catch (progressErr) {
        const progressMsg = progressErr instanceof Error ? progressErr.message : '获取进度失败'
        let health = null
        try {
          health = await fetchBatchHealth()
        } catch {
          /* ignore */
        }
        setPreview(null)
        setPreviewEmptyHint(diagnoseEmptyQuestions(health, taskSnapshot, progressMsg))
        setPreviewEmpty(true)
        return
      }

      const questions = Array.isArray(res.questions) ? res.questions : []
      if (questions.length === 0) {
        let health = null
        try {
          health = await fetchBatchHealth()
        } catch {
          /* ignore */
        }
        const hint = diagnoseEmptyQuestions(
          health,
          res.progress ?? taskSnapshot,
          res.error,
        )
        setPreview(null)
        setPreviewEmptyHint(hint)
        setPreviewEmpty(true)
        return
      }
      setPreview(questions)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '获取结果失败')
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <DashboardHeader title="大批量拆题" backTo="/teacher/question-bank" backLabel="返回题库" featureNavRole="teacher" />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-6 rounded-xl border border-slate-700 bg-slate-900/50 p-4">
          <p className="mb-3 text-sm text-slate-400">
            支持 100～1000 题级试卷批量拆题，LaTeX 公式与几何/空间图形描述，后台异步并发处理并自动入库。
          </p>
          <div className="mb-3 flex flex-wrap gap-3">
            <select className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)}>
              {TEACHER_SUBJECTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select className={inputClass} value={grade} onChange={(e) => setGrade(e.target.value)}>
              {TEACHER_GRADES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <label className={`${btnPrimary} cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
              {uploading ? '上传中...' : '上传试卷（PDF/Word/TXT）'}
              <input
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.txt"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleUpload(f)
                  e.target.value = ''
                }}
              />
            </label>
          </div>
          <p className="text-xs text-slate-500">
            也可前往
            {' '}
            <Link to="/teacher/task-center" className="text-cyan-400 hover:underline">拆题任务中心</Link>
            {' '}
            查看单卷拆题任务
            {basketCount > 0 && (
              <>
                {' '}
                | 试题篮已有 <Link to="/teacher/exam-builder" className="text-cyan-400 hover:underline font-medium">{basketCount} 题</Link>，可前往组卷
              </>
            )}
          </p>
        </div>

        {message && (
          <p className="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-200">{message}</p>
        )}

        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">批量任务列表</h2>
          <button type="button" className={btnSecondary} onClick={loadTasks} disabled={loading}>
            {loading ? '刷新中...' : '手动刷新'}
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="bg-slate-800/80 text-slate-400">
              <tr>
                <th className="p-3">文件名</th>
                <th className="p-3">进度</th>
                <th className="p-3">状态</th>
                <th className="p-3">题目数</th>
                <th className="p-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && tasks.length === 0 ? (
                <tr><td colSpan={5} className="p-6 text-center text-slate-500">加载中...</td></tr>
              ) : tasks.length === 0 ? (
                <tr><td colSpan={5} className="p-6 text-center text-slate-500">暂无批量任务，请上传试卷</td></tr>
              ) : (
                tasks.map((task) => (
                  <tr key={task.batchId} className="border-t border-slate-800 hover:bg-slate-900/50">
                    <td className="p-3">
                      <div className="font-medium">{task.fileName}</div>
                      <div className="text-xs text-slate-500">{task.subject} · {task.grade}</div>
                      <div className="text-xs text-slate-600">{formatTime(task.createdAt)}</div>
                    </td>
                    <td className="p-3">
                      <div className="mb-1 h-2 w-32 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full bg-cyan-500 transition-all"
                          style={{ width: `${task.progressPercent}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-400">
                        {task.progressPercent}% · {task.completedItems + task.failedItems}/{task.totalItems} 块
                      </span>
                    </td>
                    <td className={`p-3 ${statusColor(task.status)}`}>
                      {statusLabel(task.status)}
                      {task.errorMessage && (
                        <div className="mt-1 text-xs text-red-300/80">{task.errorMessage}</div>
                      )}
                    </td>
                    <td className="p-3">
                      {task.importedQuestions > 0 ? task.importedQuestions : '—'}
                    </td>
                    <td className="p-3">
                      {(task.status === 'pending' || task.status === 'failed') && (
                        <button
                          type="button"
                          className={btnPrimary}
                          disabled={startingId === task.batchId}
                          onClick={() => handleStart(task.batchId)}
                        >
                          {startingId === task.batchId ? '启动中...' : '启动'}
                        </button>
                      )}
                      {task.status === 'running' && (task.pendingItems > 0 || task.processingItems > 0) && (
                        <button
                          type="button"
                          className={btnSecondary}
                          disabled={startingId === task.batchId}
                          onClick={() => handleStart(task.batchId)}
                        >
                          {startingId === task.batchId ? '重试中...' : isTaskStuck(task) ? '恢复处理' : '重新触发'}
                        </button>
                      )}
                      {task.status === 'partial' && (task.pendingItems > 0 || task.processingItems > 0) && (
                        <button
                          type="button"
                          className={btnSecondary}
                          disabled={startingId === task.batchId}
                          onClick={() => handleStart(task.batchId)}
                        >
                          {startingId === task.batchId ? '恢复中...' : '继续处理'}
                        </button>
                      )}
                      {(task.status === 'completed' || task.status === 'partial') && (
                        <>
                          <button type="button" className={btnPrimary} onClick={() => viewResult(task.batchId)}>
                            查看题目
                          </button>
                          <button
                            type="button"
                            className={`${btnSecondary} ml-2`}
                            disabled={startingId === task.batchId}
                            onClick={() => handleStart(task.batchId, true)}
                          >
                            {startingId === task.batchId ? '重置中...' : '重新拆题'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {previewEmpty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 text-center">
            <h3 className="mb-3 text-lg font-semibold text-amber-300">无法显示题目</h3>
            <p className="mb-6 text-sm leading-relaxed text-slate-300">
              {previewEmptyHint || '暂无题目记录，请稍后重试或重新上传试卷'}
            </p>
            <button type="button" className={btnSecondary} onClick={() => setPreviewEmpty(false)}>
              关闭
            </button>
          </div>
        </div>
      )}

      {preview && (
        <BatchQuestionPreview
          questions={preview}
          onClose={() => setPreview(null)}
        />
      )}

      {/* 试题篮悬浮组件 */}
      <QuestionBasket />
    </div>
  )
}
