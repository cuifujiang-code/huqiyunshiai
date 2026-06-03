import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardHeader from '../components/layout/DashboardHeader'
import PhotoSearchResultView from '../components/photoSearch/PhotoSearchResultView'
import { useAuth } from '../context/AuthContext'
import { compressAnswerSheetForUpload, formatFileSize } from '../lib/answerSheetCompress'
import { fileToBase64 } from '../lib/fileBase64'
import { fetchPhotoSearchHistory, submitPhotoSearch } from '../lib/fetchPhotoSearch'
import type { PhotoSearchHistoryItem, PhotoSearchResult } from '../types/photoSearch'
import { historyItemToResult } from '../types/photoSearch'

type Tab = 'search' | 'history'

export default function StudentPhotoSearchPage() {
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const userId = user?.id ?? profile?.id ?? ''

  const cameraRef = useRef<HTMLInputElement>(null)
  const albumRef = useRef<HTMLInputElement>(null)

  const [tab, setTab] = useState<Tab>('search')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [fileSize, setFileSize] = useState(0)
  const [pendingBase64, setPendingBase64] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [result, setResult] = useState<PhotoSearchResult | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [history, setHistory] = useState<PhotoSearchHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const clearPreview = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setPendingBase64(null)
    setFileName('')
    setFileSize(0)
  }, [previewUrl])

  const loadHistory = useCallback(async () => {
    if (!userId) return
    setHistoryLoading(true)
    const res = await fetchPhotoSearchHistory(userId)
    if (res.success && res.items) setHistory(res.items)
    else if (res.message) setNotice(res.message)
    setHistoryLoading(false)
  }, [userId])

  useEffect(() => {
    if (tab === 'history') loadHistory()
  }, [tab, loadHistory])

  const handleImageFile = async (raw: File | undefined) => {
    if (!raw || !raw.type.startsWith('image/')) {
      setNotice('请选择图片文件')
      return
    }
    setNotice(null)
    setResult(null)
    try {
      const compressed = await compressAnswerSheetForUpload(raw)
      const base64 = await fileToBase64(compressed)
      clearPreview()
      setPreviewUrl(URL.createObjectURL(compressed))
      setFileName(compressed.name)
      setFileSize(compressed.size)
      setPendingBase64(base64)
    } catch {
      setNotice('图片处理失败，请换一张重试')
    }
  }

  const handleSearch = async () => {
    if (!pendingBase64) {
      setNotice('请先拍照或选择相册图片')
      return
    }
    setSearching(true)
    setNotice(null)
    setResult(null)

    const res = await submitPhotoSearch({
      userId: userId || undefined,
      imageBase64: pendingBase64,
      imageName: fileName || 'photo.jpg',
    })

    setSearching(false)

    if (res.success && res.result) {
      setResult(res.result)
      setNotice(res.message ?? '搜题完成')
      void loadHistory()
    } else {
      setNotice(res.message || '搜题失败，请稍后重试')
    }
  }

  const openHistoryItem = (item: PhotoSearchHistoryItem) => {
    setTab('search')
    setResult(historyItemToResult(item))
    setNotice(`历史记录 · ${new Date(item.created_at).toLocaleString('zh-CN')}`)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <DashboardHeader
        title="拍照搜题"
        backTo="/student/dashboard"
        backLabel="返回学习中心"
        featureNavRole="student"
      />

      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex gap-2 rounded-xl border border-slate-800 bg-slate-900/50 p-1">
          <button
            type="button"
            onClick={() => setTab('search')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
              tab === 'search' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            拍照搜题
          </button>
          <button
            type="button"
            onClick={() => setTab('history')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
              tab === 'history' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            搜索历史
          </button>
        </div>

        {tab === 'search' && (
          <div className="space-y-6">
            <p className="text-sm text-slate-400">
              拍摄或上传题目照片，系统将使用阿里云 OCR 识别文字，并结合题库与 DeepSeek 给出答案与解析。
            </p>

            <div className="flex flex-wrap gap-3">
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  void handleImageFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
              <input
                ref={albumRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  void handleImageFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-2.5 text-sm font-semibold shadow-lg shadow-blue-600/25"
              >
                拍照
              </button>
              <button
                type="button"
                onClick={() => albumRef.current?.click()}
                className="rounded-xl border border-slate-600 px-5 py-2.5 text-sm text-slate-200 hover:border-blue-500/50"
              >
                从相册选择
              </button>
              {previewUrl && (
                <button
                  type="button"
                  onClick={clearPreview}
                  className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-400"
                >
                  清除图片
                </button>
              )}
            </div>

            {previewUrl && (
              <div className="overflow-hidden rounded-xl border border-slate-700">
                <img src={previewUrl} alt="题目预览" className="max-h-72 w-full object-contain bg-black/40" />
                {fileSize > 0 && (
                  <p className="border-t border-slate-800 px-3 py-2 text-xs text-slate-500">
                    {fileName} · {formatFileSize(fileSize)}
                  </p>
                )}
              </div>
            )}

            <button
              type="button"
              disabled={searching || !pendingBase64}
              onClick={() => void handleSearch()}
              className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 py-3 text-sm font-semibold disabled:opacity-50"
            >
              {searching ? '识别与搜题中…' : '开始搜题'}
            </button>

            {searching && (
              <p className="text-center text-sm text-cyan-300/90 animate-pulse">
                正在 OCR 识别并检索题库 / AI 解答，请稍候…
              </p>
            )}

            {notice && (
              <p
                className={`rounded-lg px-4 py-2 text-sm ${
                  result ? 'bg-emerald-500/10 text-emerald-200' : 'bg-amber-500/10 text-amber-200'
                }`}
              >
                {notice}
              </p>
            )}

            {result && <PhotoSearchResultView result={result} />}
          </div>
        )}

        {tab === 'history' && (
          <div className="space-y-4">
            {!userId && (
              <p className="text-sm text-amber-300">请登录后查看搜索历史；本地演示账号可能无法同步云端记录。</p>
            )}
            <button
              type="button"
              onClick={() => void loadHistory()}
              disabled={historyLoading}
              className="text-sm text-blue-300 hover:text-cyan-200 disabled:opacity-50"
            >
              {historyLoading ? '加载中…' : '刷新列表'}
            </button>

            {history.length === 0 && !historyLoading && (
              <p className="text-center text-sm text-slate-500 py-8">暂无搜索记录</p>
            )}

            <ul className="space-y-3">
              {history.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => openHistoryItem(item)}
                    className="w-full rounded-xl border border-slate-700/80 bg-slate-900/60 p-4 text-left transition hover:border-blue-500/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-500">
                        {new Date(item.created_at).toLocaleString('zh-CN')}
                      </span>
                      {item.source === 'bank' && (
                        <span className="shrink-0 rounded bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">
                          题库
                        </span>
                      )}
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-200">{item.question || item.ocr_text}</p>
                  </button>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => navigate('/student/dashboard')}
              className="mt-4 w-full rounded-xl border border-slate-700 py-2.5 text-sm text-slate-400"
            >
              返回学习中心
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
