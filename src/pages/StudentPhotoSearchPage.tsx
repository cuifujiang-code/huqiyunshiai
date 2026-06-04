import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardHeader from '../components/layout/DashboardHeader'
import PhotoSearchResultView from '../components/photoSearch/PhotoSearchResultView'
import { useAuth } from '../context/AuthContext'
import { compressAnswerSheetForUpload, formatFileSize } from '../lib/answerSheetCompress'
import { fileToBase64 } from '../lib/fileBase64'
import { fetchPhotoSearchHistory, submitPhotoSearch } from '../lib/fetchPhotoSearch'
import {
  isClientOcrTextUsable,
  recognizePhotoImageClient,
  shouldRetryWithClientOcr,
} from '../lib/photoClientOcr'
import type { PhotoSearchHistoryItem, PhotoSearchResult, SearchStatus } from '../types/photoSearch'
import { historyItemToResult } from '../types/photoSearch'

type Tab = 'search' | 'history'

/** 三阶段加载文字 */
const LOADING_STAGES = [
  { label: 'OCR 识别中…', icon: '🔍', duration: 0 },
  { label: '匹配题库中…', icon: '📚', duration: 6000 },
  { label: '生成解题思路中…', icon: '🧠', duration: 18000 },
] as const

export default function StudentPhotoSearchPage() {
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const userId = user?.id ?? profile?.id ?? ''

  const cameraRef = useRef<HTMLInputElement>(null)
  const albumRef = useRef<HTMLInputElement>(null)

  // ---- Tab ----
  const [tab, setTab] = useState<Tab>('search')

  // ---- 图片预览 ----
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [fileSize, setFileSize] = useState(0)
  const [pendingBase64, setPendingBase64] = useState<string | null>(null)

  // ---- 搜题状态 ----
  const [searching, setSearching] = useState(false)
  const [searchStatus, setSearchStatus] = useState<SearchStatus | null>(null)
  const [result, setResult] = useState<PhotoSearchResult | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // ---- no_match 编辑 ----
  const [editedOcrText, setEditedOcrText] = useState('')

  // ---- 三阶段加载动画 ----
  const [loadingStage, setLoadingStage] = useState(0)

  // ---- 历史 ----
  const [history, setHistory] = useState<PhotoSearchHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const clearPreview = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setPendingBase64(null)
    setFileName('')
    setFileSize(0)
  }, [previewUrl])

  /** 重置搜题状态 */
  const resetSearchState = useCallback(() => {
    setSearchStatus(null)
    setResult(null)
    setEditedOcrText('')
    setNotice(null)
  }, [])

  // ---- 三阶段加载轮播 ----
  useEffect(() => {
    if (!searching) {
      setLoadingStage(0)
      return
    }
    const startTime = Date.now()
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime
      for (let i = LOADING_STAGES.length - 1; i >= 0; i--) {
        if (elapsed >= LOADING_STAGES[i].duration) {
          setLoadingStage(i)
          break
        }
      }
    }, 800)
    return () => clearInterval(timer)
  }, [searching])

  // ---- 加载历史 ----
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

  // ---- 处理图片 ----
  const handleImageFile = async (raw: File | undefined) => {
    if (!raw || !raw.type.startsWith('image/')) {
      setNotice('请选择图片文件')
      return
    }
    resetSearchState()
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

  // ---- 执行搜题 ----
  const handleSearch = async () => {
    if (!pendingBase64) {
      setNotice('请先拍照或选择相册图片')
      return
    }
    setSearching(true)
    setNotice(null)
    resetSearchState()

    let res = await submitPhotoSearch({
      userId: userId || undefined,
      imageBase64: pendingBase64,
      imageName: fileName || 'photo.jpg',
    })

    if (!res.success && shouldRetryWithClientOcr(res) && previewUrl) {
      setNotice('服务端识别失败，正在使用本机 OCR 识别…')
      try {
        const clientText = await recognizePhotoImageClient(previewUrl, (msg) => setNotice(msg))
        if (isClientOcrTextUsable(clientText)) {
          res = await submitPhotoSearch({
            userId: userId || undefined,
            imageBase64: pendingBase64,
            imageName: fileName || 'photo.jpg',
            clientOcrText: clientText,
          })
        } else {
          setNotice('本机 OCR 未能识别足够文字，请换一张更清晰的图片')
        }
      } catch (ocrErr) {
        console.warn('[photoSearch] 本机 OCR 失败', ocrErr)
        setNotice('本机 OCR 失败，请换一张更清晰的图片重试')
      }
    }

    setSearching(false)

    if (res.success && res.result) {
      const status = res.result.searchStatus || 'success'
      setSearchStatus(status)
      setResult(res.result)
      if (status === 'no_match') {
        setEditedOcrText(res.result.ocrText || '')
        setNotice('OCR 识别成功，但未在题库中找到匹配题目')
      } else {
        setNotice(res.message ?? '搜题完成')
      }
      void loadHistory()
    } else {
      // API 返回失败
      const status = res.searchStatus || (res.message?.includes('模糊') ? 'blurry' : 'network_error')
      setSearchStatus(status)

      // blurry 状态需要保留预览图以便重试
      if (status === 'network_error') {
        // 保留图片预览
        setNotice(res.message)
      } else if (status === 'blurry') {
        setNotice(res.message || '图片字迹模糊无法识别')
      } else {
        setNotice(res.message || '搜题失败，请稍后重试')
      }
    }
  }

  // ---- no_match 状态下用编辑后文本重新搜索 ----
  const handleReSearch = async () => {
    if (!editedOcrText.trim()) return
    setSearching(true)
    setNotice(null)

    // 用编辑后的 OCR 文本重新提交
    const res = await submitPhotoSearch({
      userId: userId || undefined,
      imageBase64: pendingBase64!,
      imageName: fileName || 'photo.jpg',
      editedOcrText: editedOcrText.trim(),
    })

    setSearching(false)

    if (res.success && res.result) {
      const status = res.result.searchStatus || 'success'
      setSearchStatus(status)
      setResult(res.result)
      if (status === 'no_match') {
        setNotice('仍未匹配到题目，请尝试修改题干关键词后重试')
      } else {
        setNotice(res.message ?? '搜题完成')
      }
      void loadHistory()
    } else {
      setNotice(res.message || '重新搜索失败')
    }
  }

  // ---- 打开历史记录 ----
  const openHistoryItem = (item: PhotoSearchHistoryItem) => {
    setTab('search')
    const r = historyItemToResult(item)
    setResult(r)
    setSearchStatus('success')
    setNotice(`历史记录 · ${new Date(item.created_at).toLocaleString('zh-CN')}`)
  }

  // ---- 加入错题本 ----
  const handleAddToMistakeBook = () => {
    setNotice('错题本功能开发中，敬请期待')
  }

  // ---- 同类题练习 ----
  const handleSimilarQuestions = () => {
    setNotice('同类题练习功能开发中，敬请期待')
  }

  // ---- blurry: 重新拍照 ----
  const handleRetake = () => {
    resetSearchState()
    cameraRef.current?.click()
  }

  // ---- blurry: 从相册重选 ----
  const handleReselect = () => {
    resetSearchState()
    albumRef.current?.click()
  }

  // ---- network_error: 重试 ----
  const handleRetry = () => {
    void handleSearch()
  }

  // ---- network_error: 取消 ----
  const handleCancelNetworkError = () => {
    setSearchStatus(null)
    setNotice(null)
  }

  // ---- 当前阶段对应的 UI ----
  const showPreviewImage = previewUrl && (searchStatus !== 'blurry' || searching)
  const showCropHint = previewUrl && !searching && searchStatus === null
  const showResult = searchStatus && searchStatus !== 'network_error'

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <DashboardHeader
        title="拍照搜题"
        backTo="/student/dashboard"
        backLabel="返回学习中心"
        featureNavRole="student"
      />

      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        {/* Tab 切换 */}
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

        {/* ============ 搜题 Tab ============ */}
        {tab === 'search' && (
          <div className="space-y-6">
            {/* 功能说明 */}
            <p className="text-sm text-slate-400">
              拍摄或上传题目照片，系统将使用阿里云 OCR 识别文字，并结合题库与 DeepSeek 给出答案与解析。
            </p>

            {/* 相机 / 相册按钮 */}
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
                📷 拍照
              </button>
              <button
                type="button"
                onClick={() => albumRef.current?.click()}
                className="rounded-xl border border-slate-600 px-5 py-2.5 text-sm text-slate-200 hover:border-blue-500/50"
              >
                🖼️ 从相册选择
              </button>
              {previewUrl && !searching && searchStatus !== 'blurry' && (
                <button
                  type="button"
                  onClick={() => {
                    clearPreview()
                    resetSearchState()
                  }}
                  className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-400"
                >
                  清除图片
                </button>
              )}
            </div>

            {/* 相机取景框提示 */}
            {!previewUrl && (
              <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 p-4 text-center">
                <p className="text-sm text-cyan-300/80">
                  📐 对准整道题目，不要多题混拍
                </p>
              </div>
            )}

            {/* 图片预览 */}
            {previewUrl && !searching && (searchStatus === null || searchStatus === 'blurry' || searchStatus === 'network_error') && (
              <div className="overflow-hidden rounded-xl border border-slate-700">
                <img src={previewUrl} alt="题目预览" className="max-h-72 w-full object-contain bg-black/40" />
                {fileSize > 0 && (
                  <p className="border-t border-slate-800 px-3 py-2 text-xs text-slate-500">
                    {fileName} · {formatFileSize(fileSize)}
                  </p>
                )}
              </div>
            )}

            {/* 裁剪提示 — 仅在选了图但未搜索时显示 */}
            {showCropHint && (
              <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2 text-sm text-amber-300/90">
                ⚠️ 只保留 1 道题目，多题会降低识别成功率
              </p>
            )}

            {/* 开始搜题按钮 */}
            {!searching && searchStatus === null && (
              <button
                type="button"
                disabled={!pendingBase64}
                onClick={() => void handleSearch()}
                className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 py-3 text-sm font-semibold disabled:opacity-50 shadow-lg shadow-blue-600/25"
              >
                开始搜题
              </button>
            )}

            {/* ============ 搜题中 — 三阶段加载动画 ============ */}
            {searching && (
              <div className="space-y-4 rounded-2xl border border-blue-500/20 bg-slate-900/60 p-6">
                {/* 进度条 */}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-700 ease-out"
                    style={{ width: `${((loadingStage + 0.5) / LOADING_STAGES.length) * 100}%` }}
                  />
                </div>

                {/* 阶段文字轮播 */}
                <div className="flex items-center justify-center gap-2">
                  <span className="text-lg">{LOADING_STAGES[loadingStage].icon}</span>
                  <span className="text-sm font-medium text-cyan-200 animate-pulse">
                    {LOADING_STAGES[loadingStage].label}
                  </span>
                </div>

                {/* 阶段指示器 */}
                <div className="flex items-center justify-center gap-1.5">
                  {LOADING_STAGES.map((stage, idx) => (
                    <div
                      key={stage.label}
                      className={`h-1.5 rounded-full transition-all duration-500 ${
                        idx < loadingStage
                          ? 'w-6 bg-cyan-400'
                          : idx === loadingStage
                          ? 'w-10 bg-cyan-300 animate-pulse'
                          : 'w-3 bg-slate-700'
                      }`}
                    />
                  ))}
                </div>

                <p className="text-center text-xs text-slate-500">正在处理图片，请耐心等待…</p>
              </div>
            )}

            {/* 通知 */}
            {notice && !searchStatus && (
              <p className="rounded-lg bg-amber-500/10 px-4 py-2 text-sm text-amber-200">{notice}</p>
            )}

            {/* ============ 结果展示 ============ */}
            {showResult && (
              <PhotoSearchResultView
                result={result}
                searchStatus={searchStatus!}
                notice={notice}
                onAddToMistakeBook={handleAddToMistakeBook}
                onSimilarQuestions={handleSimilarQuestions}
                editedOcrText={editedOcrText}
                onEditOcrText={setEditedOcrText}
                onReSearch={handleReSearch}
                onRetake={handleRetake}
                onReselect={handleReselect}
                onRetry={handleRetry}
                onCancelNetworkError={handleCancelNetworkError}
              />
            )}

            {/* 网络错误弹窗在 PhotoSearchResultView 内部 */}
            {searchStatus === 'network_error' && (
              <PhotoSearchResultView
                result={result}
                searchStatus="network_error"
                notice={notice}
                onAddToMistakeBook={handleAddToMistakeBook}
                onSimilarQuestions={handleSimilarQuestions}
                editedOcrText={editedOcrText}
                onEditOcrText={setEditedOcrText}
                onReSearch={handleReSearch}
                onRetake={handleRetake}
                onReselect={handleReselect}
                onRetry={handleRetry}
                onCancelNetworkError={handleCancelNetworkError}
              />
            )}
          </div>
        )}

        {/* ============ 历史 Tab ============ */}
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
                      {item.source === 'ai' && (
                        <span className="shrink-0 rounded bg-cyan-500/15 px-2 py-0.5 text-xs text-cyan-300">
                          AI
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
