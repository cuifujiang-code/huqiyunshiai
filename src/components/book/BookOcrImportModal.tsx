import { useState } from 'react'

import { btnSecondary, inputClass } from '../../types/teacher'

import type { BookChapter } from '../../types/teacher'

import { buildTeacherRootApiUrl } from '../../lib/apiBase'

import type { BookDocxCleanStats } from '../../lib/bookDocxClean'

import BookDocxCleanResultModal from './BookDocxCleanResultModal'



interface Props {

  open: boolean

  onClose: () => void

  onImportJson: (json: Record<string, unknown>) => void

  onImportPdf: (file: File) => Promise<void>

  onImportImages: (files: File[]) => Promise<void>

  onImportDocx?: (

    chapters: BookChapter[],

    meta: { formulaCount?: number; message: string; cleanStats?: BookDocxCleanStats },

  ) => void

  loading?: boolean

}



async function fileToBase64(file: File): Promise<string> {

  const buf = await file.arrayBuffer()

  const bytes = new Uint8Array(buf)

  let binary = ''

  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)

  return btoa(binary)

}



export default function BookOcrImportModal({

  open,

  onClose,

  onImportJson,

  onImportPdf,

  onImportImages,

  onImportDocx,

  loading,

}: Props) {

  const [docxLoading, setDocxLoading] = useState(false)

  const [status, setStatus] = useState<string | null>(null)

  const [cleanResult, setCleanResult] = useState<{

    stats: BookDocxCleanStats

    summary: string

    chapters: BookChapter[]

    formulaCount?: number

  } | null>(null)



  if (!open) return null



  const busy = loading || docxLoading



  const handleJsonFile = async (file: File) => {

    const text = await file.text()

    const json = JSON.parse(text) as Record<string, unknown>

    onImportJson(json)

  }



  async function handleDocxUpload(file: File) {

    setDocxLoading(true)

    setStatus('正在上传并解析 DOCX（含水印过滤与公式转译），大文件可能需要 1–2 分钟…')

    try {

      const docxBase64 = await fileToBase64(file)

      const controller = new AbortController()

      const timer = setTimeout(() => controller.abort(), 180000)

      const res = await fetch(buildTeacherRootApiUrl('teacher/book/docx-import'), {

        method: 'POST',

        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },

        body: JSON.stringify({ docxBase64, fileName: file.name }),

        signal: controller.signal,

      })

      clearTimeout(timer)

      const data = (await res.json()) as {

        success?: boolean

        chapters?: BookChapter[]

        formulaCount?: number

        cleanStats?: BookDocxCleanStats

        cleanSummary?: string

        error?: string

        message?: string

      }



      if (!res.ok) {

        setStatus(`❌ 导入失败：${data.error || data.message || `HTTP ${res.status}`}`)

        return

      }



      if (data.success && data.chapters?.length) {

        setStatus(null)

        setCleanResult({

          stats: data.cleanStats || {},

          summary: data.cleanSummary || `已导入 ${data.chapters.length} 章`,

          chapters: data.chapters,

          formulaCount: data.formulaCount,

        })

      } else {

        setStatus(`❌ 导入失败：${data.error || data.message || '解析结果为空'}`)

      }

    } catch (err) {

      const msg = err instanceof Error && err.name === 'AbortError'

        ? '上传超时（超过3分钟），请尝试拆分文档或稍后重试'

        : err instanceof Error ? err.message : String(err)

      setStatus(`❌ 上传失败：${msg}`)

    } finally {

      setDocxLoading(false)

    }

  }



  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {

    const file = e.target.files?.[0]

    e.target.value = ''

    if (!file) return



    const lower = file.name.toLowerCase()

    if (lower.endsWith('.docx')) {

      void handleDocxUpload(file)

      return

    }

    if (lower.endsWith('.doc')) {

      setStatus('❌ 暂不支持旧版 .doc，请用 Word 另存为 .docx 后导入')

      return

    }

    if (lower.endsWith('.pdf')) {

      void onImportPdf(file)

      return

    }

    if (/\.(png|jpe?g|webp|gif)$/i.test(lower)) {

      void onImportImages([file])

    }

  }



  const finishImport = () => {

    if (!cleanResult) return

    onImportDocx?.(cleanResult.chapters, {

      formulaCount: cleanResult.formulaCount,

      message: cleanResult.summary,

      cleanStats: cleanResult.stats,

    })

    setCleanResult(null)

  }



  return (

    <>

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">

        <div className="w-full max-w-md rounded-xl border border-slate-600 bg-slate-900 p-5 shadow-xl">

          <h3 className="text-lg font-semibold text-white">辅导书 · 视觉识别导入</h3>

          <p className="mt-2 text-xs text-slate-400">

            支持 Word(.docx)、手写 PDF、拍照图片或 WorkBuddy JSON。导入后自动过滤水印、转译公式、规整段落。

          </p>



          {status && (

            <p className="mt-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200">

              {status}

            </p>

          )}



          <div className="mt-4 space-y-3">

            <label className="block">

              <span className="mb-1 block text-xs text-slate-400">Word 文档 / PDF / 图片</span>

              <input

                type="file"

                accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.DOCX,image/*,application/pdf"

                className={`${inputClass} text-sm`}

                disabled={busy}

                onChange={handleFileChange}

              />

            </label>



            <label className="block">

              <span className="mb-1 block text-xs text-slate-400">拍照 / 扫描图片（可多选）</span>

              <input

                type="file"

                accept="image/*,.jpg,.jpeg,.png,.webp"

                multiple

                className={`${inputClass} text-sm`}

                disabled={busy}

                onChange={(e) => {

                  const files = Array.from(e.target.files ?? [])

                  if (files.length) void onImportImages(files)

                }}

              />

            </label>



            <label className="block">

              <span className="mb-1 block text-xs text-slate-400">手写 PDF（最多 8 页）</span>

              <input

                type="file"

                accept=".pdf,application/pdf"

                className={`${inputClass} text-sm`}

                disabled={busy}

                onChange={(e) => {

                  const f = e.target.files?.[0]

                  if (f) void onImportPdf(f)

                }}

              />

            </label>



            <label className="block">

              <span className="mb-1 block text-xs text-slate-400">WorkBuddy / OCR JSON 文件</span>

              <input

                type="file"

                accept=".json,application/json"

                className={`${inputClass} text-sm`}

                disabled={busy}

                onChange={(e) => {

                  const f = e.target.files?.[0]

                  if (f) void handleJsonFile(f).catch(() => alert('JSON 解析失败'))

                }}

              />

            </label>

          </div>



          <div className="mt-5 flex justify-end gap-2">

            <button type="button" className={btnSecondary} onClick={onClose} disabled={busy}>

              关闭

            </button>

            {busy && (

              <span className="self-center text-xs text-cyan-400">

                {docxLoading ? 'DOCX 解析与清洗中…' : '豆包视觉识别中…'}

              </span>

            )}

          </div>

        </div>

      </div>



      {cleanResult && (

        <BookDocxCleanResultModal

          open

          stats={cleanResult.stats}

          summary={cleanResult.summary}

          onClose={finishImport}

        />

      )}

    </>

  )

}


