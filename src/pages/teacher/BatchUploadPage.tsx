import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import DashboardHeader from '../../components/layout/DashboardHeader'
import { useAuth } from '../../context/AuthContext'
import { fileToBase64 } from '../../lib/fileBase64'
import {
  fetchBatchProgress,
  isTaskStuck,
  listBatchTasks,
  startBatchTask,
  uploadBatchTask,
  type BatchProgress,
} from '../../lib/batchApi'
import { TEACHER_GRADES, TEACHER_SUBJECTS, btnPrimary, btnSecondary, inputClass } from '../../types/teacher'

const ACCEPT = '.pdf,.docx'
const ACCEPT_MIME = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('zh-CN')
  } catch {
    return iso
  }
}

function statusLabel(status: BatchProgress['status']) {
  switch (status) {
    case 'pending': return '待启动'
    case 'running': return '处理中'
    case 'completed': return '已完成'
    case 'partial': return '部分完成'
    case 'failed': return '失败'
    default: return status
  }
}

function statusColor(status: BatchProgress['status']) {
  if (status === 'completed') return 'text-emerald-400'
  if (status === 'failed') return 'text-red-400'
  if (status === 'partial') return 'text-amber-400'
  return 'text-cyan-300'
}

function isAcceptedFile(file: File) {
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.pdf') || lower.endsWith('.docx')) return true
  return ACCEPT_MIME.includes(file.type)
}

export default function BatchUploadPage() {
  const { profile } = useAuth()
  const teacherId = profile?.id ?? ''

  const [subject, setSubject] = useState('数学')
  const [grade, setGrade] = useState('八年级')
  const [knowledgeTags, setKnowledgeTags] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [tasks, setTasks] = useState<BatchProgress[]>([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [startingId, setStartingId] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadTasks = useCallback(async () => {
    if (!teacherId) return
    setLoadingTasks(true)
    try {
      const res = await listBatchTasks(teacherId)
      setTasks(res.tasks ?? [])
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '加载任务列表失败')
    } finally {
      setLoadingTasks(false)
    }
  }, [teacherId])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  useEffect(() => {
    const hasActive = tasks.some(
      (t) => t.status === 'running' || t.status === 'pending'
        || (t.status === 'partial' && (t.pendingItems > 0 || t.processingItems > 0)),
    )
    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(loadTasks, 5000)
    }
    if (!hasActive && pollRef.current) {
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

  const pickFile = (file: File | null | undefined) => {
    if (!file) return
    if (!isAcceptedFile(file)) {
      setMessage('仅支持 .pdf 和 .docx 格式')
      return
    }
    setMessage(null)
    setSelectedFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    pickFile(e.dataTransfer.files?.[0])
  }

  const handleSubmit = async () => {
    if (!teacherId) {
      setMessage('请先登录教师账号')
      return
    }
    if (!selectedFile) {
      setMessage('请先选择试卷文件')
      return
    }
    setSubmitting(true)
    setMessage(null)
    try {
      const base64 = await fileToBase64(selectedFile)
      const knowledgeCoverage = knowledgeTags
        .split(/[,，;；\s]+/)
        .map((t) => t.trim())
        .filter(Boolean)
        .join('、')

      const uploaded = await uploadBatchTask(
        teacherId,
        base64,
        selectedFile.name,
        subject,
        grade,
        { autoStart: false, ...(knowledgeCoverage ? { knowledgeCoverage } : {}) },
      )

      if (!uploaded.batchId) {
        throw new Error('上传成功但未返回 batchId')
      }

      const startRes = await startBatchTask(teacherId, uploaded.batchId)
      const chunkCount = uploaded.totalItems || uploaded.chunkCount || 0
      setMessage(
        startRes.message
        || `已提交批量拆题：${chunkCount} 个分块，任务 ID ${uploaded.batchId.slice(0, 8)}…`,
      )
      setSelectedFile(null)
      await loadTasks()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleStart = async (batchId: string, options?: { rerun?: boolean }) => {
    if (!teacherId) return
    setStartingId(batchId)
    try {
      const res = await startBatchTask(teacherId, batchId, options)
      setMessage(res.message || '已启动批量拆题')
      await loadTasks()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '启动失败')
    } finally {
      setStartingId(null)
    }
  }

  const handleRefreshProgress = async (batchId: string) => {
    if (!teacherId) return
    try {
      const res = await fetchBatchProgress(teacherId, batchId)
      if (res.progress) {
        setTasks((prev) => prev.map((t) => (t.batchId === batchId ? res.progress! : t)))
      }
      setMessage(`已刷新任务进度：${res.progress?.importedQuestions ?? 0} 题入库`)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '获取进度失败')
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <DashboardHeader title="批量录题" backTo="/teacher/dashboard" backLabel="返回工作台" featureNavRole="teacher" />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <header className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-blue-100 sm:text-3xl">批量录题</h1>
          <p className="mt-2 text-sm text-slate-400">上传 PDF/Word 试卷，AI 自动拆题入库</p>
          <p className="mt-2 text-xs text-slate-500">
            查看历史 PDF 异步拆题任务请前往
            <Link to="/teacher/task-center" className="mx-1 text-cyan-400 hover:underline">拆题任务中心</Link>
          </p>
        </header>

        {/* 上传区域 */}
        <section className="mb-6 rounded-2xl border border-slate-700 bg-slate-900/50 p-6">
          <div
            role="button"
            tabIndex={0}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
            className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition ${
              dragOver
                ? 'border-cyan-400 bg-cyan-500/10'
                : 'border-slate-600 bg-slate-800/30 hover:border-slate-500 hover:bg-slate-800/50'
            }`}
          >
            <div className="text-4xl mb-3">📄</div>
            <p className="text-base font-medium text-slate-200">
              {selectedFile ? selectedFile.name : '拖拽文件到此处，或点击选择'}
            </p>
            {selectedFile ? (
              <p className="mt-2 text-sm text-cyan-300">
                {formatFileSize(selectedFile.size)}
              </p>
            ) : (
              <p className="mt-2 text-xs text-slate-500">支持 .pdf、.docx，最大 8MB</p>
            )}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept={ACCEPT}
              onChange={(e) => {
                pickFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>

          {/* 参数设置 */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-slate-400">学科</span>
              <select className={`${inputClass} w-full`} value={subject} onChange={(e) => setSubject(e.target.value)}>
                {TEACHER_SUBJECTS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-400">年级</span>
              <select className={`${inputClass} w-full`} value={grade} onChange={(e) => setGrade(e.target.value)}>
                {TEACHER_GRADES.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs text-slate-400">知识点标签（选填，逗号分隔）</span>
              <input
                className={`${inputClass} w-full`}
                placeholder="例如：一元二次方程, 函数图像, 几何证明"
                value={knowledgeTags}
                onChange={(e) => setKnowledgeTags(e.target.value)}
              />
            </label>
          </div>

          <button
            type="button"
            className={`${btnPrimary} mt-6 w-full sm:w-auto`}
            disabled={submitting || !selectedFile}
            onClick={handleSubmit}
          >
            {submitting ? '提交中...' : '开始批量拆题'}
          </button>
        </section>

        {message && (
          <p className="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-200">
            {message}
          </p>
        )}

        {/* 任务列表 */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-blue-100">拆题任务</h2>
            <button type="button" className={btnSecondary} onClick={loadTasks} disabled={loadingTasks}>
              {loadingTasks ? '刷新中...' : '刷新列表'}
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-700">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-800/80 text-slate-400">
                <tr>
                  <th className="p-3">文件名</th>
                  <th className="p-3">状态</th>
                  <th className="p-3">题目数</th>
                  <th className="p-3">进度</th>
                  <th className="p-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {loadingTasks && tasks.length === 0 ? (
                  <tr><td colSpan={5} className="p-6 text-center text-slate-500">加载中...</td></tr>
                ) : tasks.length === 0 ? (
                  <tr><td colSpan={5} className="p-6 text-center text-slate-500">暂无任务，请上传试卷开始拆题</td></tr>
                ) : (
                  tasks.map((task) => (
                    <tr key={task.batchId} className="border-t border-slate-800 hover:bg-slate-900/50">
                      <td className="p-3">
                        <div className="font-medium">{task.fileName}</div>
                        <div className="text-xs text-slate-500">{task.subject} · {task.grade}</div>
                        <div className="text-xs text-slate-600">{formatTime(task.createdAt)}</div>
                      </td>
                      <td className={`p-3 ${statusColor(task.status)}`}>
                        {statusLabel(task.status)}
                        {task.errorMessage && (
                          <div className="mt-1 max-w-xs text-xs text-red-300/80">{task.errorMessage}</div>
                        )}
                      </td>
                      <td className="p-3">
                        {task.importedQuestions > 0 ? task.importedQuestions : '—'}
                      </td>
                      <td className="p-3">
                        <div className="mb-1 h-2 w-28 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full bg-cyan-500 transition-all"
                            style={{ width: `${task.progressPercent}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-400">{task.progressPercent}%</span>
                      </td>
                      <td className="p-3 space-x-2 whitespace-nowrap">
                        {(task.status === 'pending' || task.status === 'failed') && (
                          <button
                            type="button"
                            className={btnPrimary}
                            disabled={startingId === task.batchId}
                            onClick={() => handleStart(
                              task.batchId,
                              task.status === 'failed' ? { rerun: true } : undefined,
                            )}
                          >
                            {startingId === task.batchId ? '启动中...' : task.status === 'failed' ? '重新拆题' : '启动'}
                          </button>
                        )}
                        {(task.status === 'running' || task.status === 'partial') && (
                          <button
                            type="button"
                            className={btnSecondary}
                            disabled={startingId === task.batchId}
                            onClick={() => handleStart(task.batchId)}
                          >
                            {startingId === task.batchId ? '处理中...' : isTaskStuck(task) ? '恢复' : '重试'}
                          </button>
                        )}
                        <button
                          type="button"
                          className={btnSecondary}
                          onClick={() => handleRefreshProgress(task.batchId)}
                        >
                          刷新进度
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  )
}
