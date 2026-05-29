import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import DashboardHeader from '../components/layout/DashboardHeader'
import { useAuth } from '../context/AuthContext'
import { fileToBase64 } from '../lib/fileBase64'
import {
  fetchBatchProgress,
  listBatchTasks,
  startBatchTask,
  uploadBatchTask,
  type BatchProgress,
  type BatchQuestion,
} from '../lib/batchApi'
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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
    const hasRunning = tasks.some((t) => t.status === 'running' || t.status === 'pending')
    if (hasRunning && !pollRef.current) {
      pollRef.current = setInterval(() => {
        loadTasks()
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
      await startBatchTask(teacherId, uploaded.batchId)
      setMessage(`已提交大批量拆题：${uploaded.totalItems} 个分块，后台正在处理`)
      await loadTasks()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '提交失败')
    } finally {
      setUploading(false)
    }
  }

  const viewResult = async (batchId: string) => {
    if (!teacherId) return
    setMessage(null)
    try {
      const res = await fetchBatchProgress(teacherId, batchId, true)
      if (!res.questions?.length) {
        setMessage('暂无题目结果')
        return
      }
      setPreview(res.questions)
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
                      {(task.status === 'completed' || task.status === 'partial') && (
                        <button type="button" className={btnPrimary} onClick={() => viewResult(task.batchId)}>
                          查看题目
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <h3 className="mb-4 text-lg font-semibold">拆题结果（{preview.length} 道，已自动入库）</h3>
            <div className="space-y-3">
              {preview.map((q) => (
                <div key={q.id} className="rounded-lg border border-slate-700 p-3">
                  <p className="text-xs text-slate-500">
                    {q.question_type} · {q.difficulty} · {q.knowledge_point}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{q.content}</p>
                  {q.geometry_desc && (
                    <p className="mt-2 text-xs text-amber-200/80">图形：{q.geometry_desc}</p>
                  )}
                  {q.latex_blocks && q.latex_blocks.length > 0 && (
                    <p className="mt-1 text-xs text-cyan-200/70">
                      LaTeX：{q.latex_blocks.join(' · ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" className={btnSecondary} onClick={() => setPreview(null)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
