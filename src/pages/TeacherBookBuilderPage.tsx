import { useEffect, useRef, useState } from 'react'
import DashboardHeader from '../components/layout/DashboardHeader'
import BookCanvasEditor, { type BookBlockRef } from '../components/book/BookCanvasEditor'
import BookOcrImportModal from '../components/book/BookOcrImportModal'
import BookDocxCleanResultModal from '../components/book/BookDocxCleanResultModal'
import BookOcrComparePanel from '../components/book/BookOcrComparePanel'
import BookQuestionPicker from '../components/book/BookQuestionPicker'
import KnowledgeGraphView from '../components/book/KnowledgeGraphView'
import EmbeddedFigureTextarea from '../components/common/EmbeddedFigureTextarea'
import { useAuth } from '../context/AuthContext'
import { groupQuestionsIntoChapters } from '../lib/bookGrouping'
import { imageFilesToPageImages, parseBookOcrJson, pdfFileToPageImages, countBookBlocks } from '../lib/bookImportUtils'
import { embedFiguresInChapters, replaceFigureMarkersInText, type SourcePageImage } from '../lib/figureExtract'
import { extractEmbeddedFigures } from '../lib/embeddedImages'
import { assignBlocksToSourcePages, splitOcrTextByPage } from '../lib/bookOcrPages'
import { cleanBookChaptersRemote, type BookDocxCleanStats, buildCleanResultMessage } from '../lib/bookDocxClean'
import { bookToExportHtml, bookBookmarkOutline, exportBookDualVersion, bookToExportBodyHtml, bookToDualExportBodyHtml } from '../lib/bookExport'
import { BOOK_LAYOUT_TEMPLATES, applyBookLayoutSettings } from '../lib/bookLayoutTemplates'
import { exportHtmlAsWord } from '../lib/exportDoc'
import { exportToPdf, waitForImagesInElement, exportToServerPdf, exportDualToServerPdf } from '../lib/exportPdf'
import { incrementFeatureUsage } from '../lib/featureUsage'
import {
  generateBookForewordEpilogue,
  generateBookKnowledgeGraph,
  formatBookLayout,
  handwritingToBook,
  saveBook,
} from '../lib/teacherApi'
import BookSmartGenerateModal from '../components/book/BookSmartGenerateModal'
import type {
  BankQuestion,
  BookChapter,
  BookCoverStyle,
  BookLayoutTemplateId,
  BookRecord,
  BookSection,
  ExportMode,
} from '../types/teacher'
import { btnPrimary, btnSecondary, inputClass } from '../types/teacher'

const COVER_OPTIONS: { id: BookCoverStyle; label: string; desc: string }[] = [
  { id: 'minimal', label: '简约', desc: '黑白经典' },
  { id: 'academic', label: '学术', desc: '深蓝专业' },
  { id: 'fresh', label: '清新', desc: '绿色活力' },
]

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

function countBlocks(chs: BookChapter[]) {
  return countBookBlocks(chs)
}

export default function TeacherBookBuilderPage() {
  const { profile } = useAuth()
  const teacherId = profile?.id ?? profile?.phone ?? ''
  const previewRef = useRef<HTMLDivElement>(null)
  const [activeBlock, setActiveBlock] = useState<BookBlockRef | null>(null)

  const [title, setTitle] = useState('辅导书')
  const [subject, setSubject] = useState('物理')
  const [grade, setGrade] = useState('八年级')
  const [level, setLevel] = useState('基础')
  const [coverStyle, setCoverStyle] = useState<BookCoverStyle>('academic')
  const [layoutTemplate, setLayoutTemplate] = useState<BookLayoutTemplateId>('classic')
  const [layoutSettings, setLayoutSettings] = useState(applyBookLayoutSettings('classic'))
  const [foreword, setForeword] = useState('')
  const [epilogue, setEpilogue] = useState('')
  const [exportMode, setExportMode] = useState<ExportMode>('print')
  const [forewordLoading, setForewordLoading] = useState(false)
  const [chapters, setChapters] = useState<BookChapter[]>([
    { id: newId('ch'), title: '第一章', sections: [{ id: newId('sec'), title: '第一节', blocks: [] }] },
  ])
  const [selectedChapter, setSelectedChapter] = useState(0)
  const [pickedQuestions, setPickedQuestions] = useState<BankQuestion[]>([])
  const [knowledgeGraph, setKnowledgeGraph] = useState<BookRecord['knowledgeGraph']>(null)
  const [graphLoading, setGraphLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [centerView, setCenterView] = useState<'edit' | 'preview'>('edit')
  const [ocrModalOpen, setOcrModalOpen] = useState(false)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [formatLoading, setFormatLoading] = useState(false)
  const [bookId, setBookId] = useState<string | null>(null)
  const [sourcePages, setSourcePages] = useState<SourcePageImage[]>([])
  const [ocrPageTexts, setOcrPageTexts] = useState<string[]>([])
  const [showCompare, setShowCompare] = useState(false)
  const [comparePageIndex, setComparePageIndex] = useState(0)
  const [smartGenOpen, setSmartGenOpen] = useState(false)
  const [cleanModalOpen, setCleanModalOpen] = useState(false)
  const [cleanStats, setCleanStats] = useState<BookDocxCleanStats | null>(null)
  const [cleanSummary, setCleanSummary] = useState('')
  const [manualCleanLoading, setManualCleanLoading] = useState(false)

  const chapter = chapters[selectedChapter]

  const blockCount = chapters.reduce(
    (n, ch) => n + ch.sections.reduce((m, sec) => m + sec.blocks.length, 0),
    0,
  )

  useEffect(() => {
    if (centerView === 'preview' && activeBlock) {
      document
        .getElementById(`book-block-${activeBlock.chapterIndex}-${activeBlock.sectionIndex}-${activeBlock.blockIndex}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    } else if (centerView === 'preview') {
      previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [centerView, activeBlock, chapters, title, foreword, epilogue, exportMode])

  const handleBookChange = (patch: Partial<Pick<BookRecord, 'title' | 'grade' | 'level' | 'chapters' | 'foreword' | 'epilogue'>>) => {
    if (patch.title !== undefined) setTitle(patch.title)
    if (patch.grade !== undefined) setGrade(patch.grade)
    if (patch.level !== undefined) setLevel(patch.level)
    if (patch.chapters !== undefined) setChapters(patch.chapters)
    if (patch.foreword !== undefined) setForeword(patch.foreword)
    if (patch.epilogue !== undefined) setEpilogue(patch.epilogue)
  }

  const handleExportPdf = async () => {
    const el = document.createElement('div')
    el.className = 'book-pdf-export bg-white text-black'
    el.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;padding:32px;background:#fff'
    el.innerHTML = bookToExportHtml(bookRecord(), { mode: exportMode })
    document.body.appendChild(el)
    try {
      await waitForImagesInElement(el)
      await exportToPdf(el, `${title}.pdf`, {
        mode: exportMode,
        bookmarks: bookBookmarkOutline(bookRecord()),
      })
    } finally {
      document.body.removeChild(el)
    }
  }

  /** 服务端 PDF 导出（Puppeteer → 真实文本 PDF + 矢量公式） */
  const handleServerExportPdf = async (studentVersion: boolean) => {
    setMessage(`正在通过服务端引擎生成${studentVersion ? '学生版' : '教师版'} PDF…（预计 5-15 秒）`)
    try {
      const book = bookRecord()
      const html = bookToExportBodyHtml(book, { mode: 'print' })
      const suffix = studentVersion ? '学生版' : '教师版'
      await exportToServerPdf(html, `${book.title}_${suffix}`, {
        title: book.title,
        coverStyle: book.coverStyle || 'academic',
        outline: bookBookmarkOutline(book),
      })
      setMessage(`✅ ${suffix} PDF 已导出（服务端高清矢量版）`)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '服务端 PDF 导出失败')
    }
  }

  /** 服务端双版本 PDF 导出（一次请求生成学生版+教师版） */
  const handleServerDualExportPdf = async () => {
    setMessage('正在通过服务端引擎生成双版本 PDF…（预计 10-25 秒）')
    try {
      const book = bookRecord()
      const { studentHtml, teacherHtml } = bookToDualExportBodyHtml(book, { mode: 'print' })
      await exportDualToServerPdf(studentHtml, teacherHtml, book.title, {
        title: book.title,
        coverStyle: book.coverStyle || 'academic',
        outline: bookBookmarkOutline(book),
      })
      setMessage('✅ 学生版 + 教师版 PDF 已导出（服务端高清矢量版）')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '服务端双版本 PDF 导出失败')
    }
  }

  const createExportElement = (html: string) => {
    const el = document.createElement('div')
    el.className = 'book-pdf-export bg-white text-black'
    el.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;padding:32px;background:#fff'
    el.innerHTML = html
    document.body.appendChild(el)
    return el
  }

  const runDualExport = (studentVersion: boolean, format: 'pdf' | 'word') => {
    void exportBookDualVersion(bookRecord(), { studentVersion, format }, {
      exportPdf: exportToPdf,
      exportWord: exportHtmlAsWord,
      waitForImages: waitForImagesInElement,
      createExportElement,
    }).catch((e) => setMessage(e instanceof Error ? e.message : '导出失败'))
  }

  const firstBlockRef = (chs: BookChapter[]): BookBlockRef | null => {
    for (let ci = 0; ci < chs.length; ci++) {
      for (let si = 0; si < chs[ci].sections.length; si++) {
        if (chs[ci].sections[si].blocks.length > 0) {
          return { chapterIndex: ci, sectionIndex: si, blockIndex: 0 }
        }
      }
    }
    return null
  }
  const bookRecord = (): BookRecord => ({
    title,
    grade,
    level,
    chapters,
    coverStyle,
    knowledgeGraph,
    layoutTemplate,
    layoutSettings,
    foreword,
    epilogue,
    exportMode,
  })

  const applyTemplate = (id: BookLayoutTemplateId) => {
    setLayoutTemplate(id)
    setLayoutSettings(applyBookLayoutSettings(id))
    setMessage(`已应用排版模板：${BOOK_LAYOUT_TEMPLATES.find((t) => t.id === id)?.name}`)
  }

  const handleAutoFormat = () => {
    const settings = applyBookLayoutSettings(layoutTemplate, layoutSettings)
    setLayoutSettings(settings)
    const styled = chapters.map((ch) => ({
      ...ch,
      sections: ch.sections.map((sec) => ({
        ...sec,
        blocks: sec.blocks.map((b) => ({
          ...b,
          style: {
            fontSize: settings.fontSize,
            color: settings.bodyColor,
            fontFamily: settings.fontFamily?.split(',')[0]?.trim(),
          },
        })),
      })),
    }))
    setChapters(styled)
    setMessage('已统一全书字体、字号与颜色')
  }

  const handleFormatLayout = async () => {
    if (blockCount === 0) {
      setMessage('暂无内容可排版')
      return
    }
    setFormatLoading(true)
    setMessage('AI 排版校准中（修正公式与题目格式）…')
    try {
      const formatted = await formatBookLayout({
        ...bookRecord(),
        subject,
      })
      setChapters(formatted)
      setCenterView('preview')
      setMessage(`AI 排版完成 · ${countBlocks(formatted)} 个内容块已优化`)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '排版校准失败')
    } finally {
      setFormatLoading(false)
    }
  }

  const handleGenerateForewordEpilogue = async () => {
    setForewordLoading(true)
    setMessage(null)
    try {
      const { foreword: fw, epilogue: ep } = await generateBookForewordEpilogue(bookRecord())
      setForeword(fw)
      setEpilogue(ep)
      setMessage('前言与后记已生成')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '生成失败')
    } finally {
      setForewordLoading(false)
    }
  }

  const addChapter = () => {
    setChapters([...chapters, { id: newId('ch'), title: `第${chapters.length + 1}章`, sections: [] }])
  }

  const addSection = () => {
    const next = [...chapters]
    next[selectedChapter].sections.push({ id: newId('sec'), title: '新小节', blocks: [] })
    setChapters(next)
  }

  const addBlock = (type: 'knowledge' | 'example' | 'exercise' | 'summary') => {
    const next = [...chapters]
    const ch = next[selectedChapter]
    if (!ch.sections.length) ch.sections = [{ id: newId('sec'), title: '默认小节', blocks: [] }]
    const sec = ch.sections[0]
    const labels = { knowledge: '知识讲解', example: '例题', exercise: '练习', summary: '本章总结' }
    sec.blocks.push({
      id: newId('blk'),
      type,
      title: labels[type],
      content: '',
    })
    setChapters(next)
  }

  const applyQuestionsToChapters = () => {
    if (!pickedQuestions.length) {
      setMessage('请先从题库选择题目')
      return
    }
    const auto = groupQuestionsIntoChapters(pickedQuestions)
    setChapters(auto)
    setSelectedChapter(0)
    setMessage(`已按知识点归类 ${pickedQuestions.length} 道题，共 ${auto.length} 章`)
  }

  const handleGenerateGraph = async () => {
    if (!pickedQuestions.length) {
      setMessage('请先选择题库题目')
      return
    }
    setGraphLoading(true)
    setMessage(null)
    try {
      const graph = await generateBookKnowledgeGraph(pickedQuestions)
      setKnowledgeGraph(graph)
      setMessage('知识网络图已生成')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '生成失败')
    } finally {
      setGraphLoading(false)
    }
  }

  const handleSmartGenComplete = (result: {
    previewChapters: BookChapter[]
    studentVersionId: string | null
    teacherVersionId: string | null
    adjustmentReport: string
  }) => {
    setChapters(result.previewChapters)
    setSelectedChapter(0)
    setMessage(`智能生成完成！已应用调整后的 ${result.previewChapters.length} 章结构。调整报告已生成。`)
    // 保存调整报告到 foreword 供查看
    setForeword(`【智能生成调整报告】\n\n${result.adjustmentReport.slice(0, 2000)}`)
  }

  const handleSave = async () => {
    if (!teacherId) {
      setMessage('请先登录后再保存辅导书')
      return
    }
    try {
      const saved = await saveBook(teacherId, { ...bookRecord(), id: bookId ?? undefined })
      setBookId(saved.id ?? null)
      incrementFeatureUsage(teacherId, 'book')
      setMessage('辅导书已保存')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '保存失败')
    }
  }

  const handleImportDocx = async (
    importedChapters: BookChapter[],
    meta: { message: string; cleanStats?: BookDocxCleanStats },
  ) => {
    if (importedChapters.length > 0) {
      setChapters(importedChapters)
      setActiveBlock(null)
      setSelectedChapter(0)
      setCenterView('preview')
      setShowCompare(false)
      setSourcePages([])
      requestAnimationFrame(() => {
        previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
    setOcrModalOpen(false)
    setMessage(meta.message)
  }

  const handleManualCleanChapters = async () => {
    if (blockCount === 0) return
    setManualCleanLoading(true)
    try {
      const { chapters: cleaned, cleanStats: stats, cleanSummary: summary } =
        await cleanBookChaptersRemote(chapters)
      setChapters(cleaned)
      setCleanStats(stats)
      setCleanSummary(summary)
      setCleanModalOpen(true)
      setMessage(summary)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '手动清洗失败')
    } finally {
      setManualCleanLoading(false)
    }
  }

  const applyOcrResult = async (
    result: {
      title: string
      grade: string
      level: string
      chapters: BookChapter[]
      foreword?: string
      epilogue?: string
      book?: { id?: string }
      ocrText?: string
    },
    pages: SourcePageImage[] = [],
  ) => {
    let importedChapters = result.chapters ?? []
    let ocrTextForParse = result.ocrText

    if (pages.length > 0) {
      setSourcePages(pages)
      if (ocrTextForParse && (ocrTextForParse.includes('[FIGURE') || ocrTextForParse.includes('[图形'))) {
        ocrTextForParse = await replaceFigureMarkersInText(ocrTextForParse, pages)
      }
    }

    if (countBlocks(importedChapters) === 0 && ocrTextForParse?.trim()) {
      importedChapters = parseBookOcrJson(
        { rawText: ocrTextForParse, title: result.title },
        { grade: result.grade, level: result.level },
      ).chapters
    }

    if (pages.length > 0 && importedChapters.length > 0) {
      importedChapters = await embedFiguresInChapters(importedChapters, pages)
      importedChapters = assignBlocksToSourcePages(importedChapters, pages.length)
    }
    if (result.ocrText?.trim()) {
      setOcrPageTexts(splitOcrTextByPage(result.ocrText))
      setShowCompare(true)
    }
    if (importedChapters.length > 0) {
      setChapters(importedChapters)
      setActiveBlock(firstBlockRef(importedChapters))
    }
    if (result.title?.trim()) setTitle(result.title)
    setGrade(result.grade || grade)
    setLevel(result.level || level)
    setSelectedChapter(0)
    if (result.foreword) setForeword(result.foreword)
    if (result.epilogue) setEpilogue(result.epilogue)
    if (result.book?.id) setBookId(result.book.id)
    setOcrModalOpen(false)
    setCenterView('preview')
  }

  const runBookOcr = async (pageImages: { name: string; base64: string }[]) => {
    if (!teacherId) {
      setMessage('请先登录后再使用视觉识别')
      setOcrLoading(false)
      return
    }
    setOcrLoading(true)
    setMessage(`豆包视觉识别中（${pageImages.length} 页）→ AI 排版校准…`)
    try {
      const result = await handwritingToBook({
        teacherId,
        pageImages,
        title,
        subject,
        grade,
        level,
        saveToDb: true,
      })
      await applyOcrResult(result, pageImages)
      if ('cleanStats' in result && result.cleanStats) {
        setCleanStats(result.cleanStats as BookDocxCleanStats)
        setCleanSummary(buildCleanResultMessage(result.cleanStats as BookDocxCleanStats))
        setCleanModalOpen(true)
      }
      if ('saveError' in result && result.saveError) {
        setMessage(`识别完成，但云端保存失败：${result.saveError}（内容已载入编辑器，可手动保存）`)
      } else {
        incrementFeatureUsage(teacherId, 'book')
        setMessage(`已识别并导入 ${result.chapters.length} 章、${countBlocks(result.chapters)} 个内容块 · 图形已尝试从原图提取 · 已切换至「全书预览」`)
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'OCR 识别失败')
    } finally {
      setOcrLoading(false)
    }
  }

  const handleImportPdf = async (file: File) => {
    setOcrLoading(true)
    setMessage('正在转换 PDF 页面…')
    try {
      const pageImages = await pdfFileToPageImages(file)
      await runBookOcr(pageImages)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'PDF 处理失败')
      setOcrLoading(false)
    }
  }

  const handleImportImages = async (files: File[]) => {
    setOcrLoading(true)
    setMessage(`正在读取 ${files.length} 张图片…`)
    try {
      const pageImages = await imageFilesToPageImages(files)
      await runBookOcr(pageImages)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '图片读取失败')
      setOcrLoading(false)
    }
  }

  const handleImportJson = async (json: Record<string, unknown>) => {
    if (teacherId) {
      setOcrLoading(true)
      setMessage(null)
      try {
        const result = await handwritingToBook({
          teacherId,
          workbuddyJson: json,
          title,
          subject,
          grade,
          level,
          saveToDb: true,
        })
        await applyOcrResult(result)
        if ('saveError' in result && result.saveError) {
          setMessage(`已从 JSON 导入，但云端保存失败：${result.saveError}`)
        } else {
          incrementFeatureUsage(teacherId, 'book')
          setMessage(`已从 JSON 导入 · 已切换至「全书预览」`)
        }
      } catch (e) {
        setMessage(e instanceof Error ? e.message : 'JSON 导入失败')
      } finally {
        setOcrLoading(false)
      }
      return
    }
    const parsed = parseBookOcrJson(json, { title, grade, level })
    await applyOcrResult(parsed)
    setMessage('已从 JSON 导入（未登录）· 已切换至「全书预览」')
  }

  return (
    <div className="min-h-screen bg-[#121722] text-[#E8ECF3]">
      <DashboardHeader title="教辅书制作" backTo="/teacher/dashboard" backLabel="返回工作台" featureNavRole="teacher" />

      <BookOcrImportModal
        open={ocrModalOpen}
        onClose={() => setOcrModalOpen(false)}
        onImportJson={(json) => void handleImportJson(json)}
        onImportPdf={handleImportPdf}
        onImportImages={handleImportImages}
        onImportDocx={(chapters, meta) => void handleImportDocx(chapters, meta)}
        loading={ocrLoading}
      />

      {cleanStats && (
        <BookDocxCleanResultModal
          open={cleanModalOpen}
          stats={cleanStats}
          summary={cleanSummary}
          onClose={() => setCleanModalOpen(false)}
          onManualClean={() => void handleManualCleanChapters()}
          manualCleanLoading={manualCleanLoading}
        />
      )}

      <main className="mx-auto flex max-w-[1600px] gap-3 px-4 py-4" style={{ height: 'calc(100vh - 140px)' }}>
        {/* 左栏：封面设置 + 选题筛选 */}
        <aside
          className={`flex shrink-0 flex-col gap-3 overflow-y-auto rounded-[12px] border border-white/[0.06] bg-[#1C2332] p-3 transition-all ${
            leftCollapsed ? 'w-10 p-2' : 'w-64'
          }`}
        >
          <div className="flex items-center justify-between">
            {!leftCollapsed && <span className="text-xs font-semibold uppercase tracking-wider text-[#8A94A9]">封面设置</span>}
            <button
              type="button"
              onClick={() => setLeftCollapsed(!leftCollapsed)}
              className="rounded p-1 text-xs text-[#8A94A9] hover:text-[#E8ECF3]"
            >
              {leftCollapsed ? '▶' : '◀'}
            </button>
          </div>

          {!leftCollapsed && (
            <>
              <input
                className={`${inputClass} text-sm`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="书名"
              />
              <input
                className={`${inputClass} text-sm`}
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                placeholder="年级"
              />
              <input
                className={`${inputClass} text-sm`}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="学科（OCR 识别用）"
              />
              <select
                className={`${inputClass} text-sm`}
                value={level}
                onChange={(e) => setLevel(e.target.value)}
              >
                <option>基础</option>
                <option>提高</option>
                <option>竞赛</option>
              </select>

              <div className="space-y-1">
                <p className="text-[11px] text-[#8A94A9]">封面风格</p>
                {COVER_OPTIONS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCoverStyle(c.id)}
                    className={`w-full rounded-[8px] px-2 py-1.5 text-left text-xs transition ${
                      coverStyle === c.id
                        ? 'bg-[#2584FF]/15 text-[#5C9DFF] ring-1 ring-[#2584FF]/30'
                        : 'text-[#8A94A9] hover:bg-[#222B3E]'
                    }`}
                  >
                    {c.label} · {c.desc}
                  </button>
                ))}
              </div>

              <div className="h-px bg-white/[0.06]" />

              <div className="space-y-1">
                <p className="text-[11px] text-[#8A94A9]">排版模板</p>
                {BOOK_LAYOUT_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => applyTemplate(t.id)}
                    className={`w-full rounded-[8px] px-2 py-1.5 text-left text-xs transition ${
                      layoutTemplate === t.id
                        ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                        : 'text-[#8A94A9] hover:bg-[#222B3E]'
                    }`}
                  >
                    {t.name} · {t.desc}
                  </button>
                ))}
              </div>

              <button type="button" className={`${btnSecondary} w-full text-xs`} onClick={handleAutoFormat}>
                一键统一全书排版
              </button>
              <button
                type="button"
                className={`${btnPrimary} w-full text-xs`}
                disabled={ocrLoading}
                onClick={() => setOcrModalOpen(true)}
              >
                {ocrLoading ? '识别中…' : '📥 视觉识别导入'}
              </button>
              <button
                type="button"
                className={`${btnSecondary} w-full text-xs`}
                disabled={manualCleanLoading || blockCount === 0}
                onClick={() => void handleManualCleanChapters()}
              >
                {manualCleanLoading ? '清洗中…' : '🧹 手动清洗全文'}
              </button>
              <button
                type="button"
                className={`${btnSecondary} w-full text-xs`}
                disabled={formatLoading || blockCount === 0}
                onClick={() => void handleFormatLayout()}
              >
                {formatLoading ? '排版中…' : '✨ AI 排版校准'}
              </button>
              <button
                type="button"
                className={`${btnSecondary} w-full text-xs`}
                disabled={forewordLoading}
                onClick={() => void handleGenerateForewordEpilogue()}
              >
                {forewordLoading ? '生成中…' : 'AI 生成前言/后记'}
              </button>

              <div className="h-px bg-white/[0.06]" />

              <BookQuestionPicker teacherId={teacherId} selected={pickedQuestions} onChange={setPickedQuestions} />

              <button type="button" className={`${btnSecondary} w-full text-xs`} onClick={applyQuestionsToChapters}>
                按章节自动归类
              </button>
              <button
                type="button"
                className={`${btnSecondary} w-full text-xs`}
                onClick={() => void handleGenerateGraph()}
                disabled={graphLoading}
              >
                {graphLoading ? '生成中…' : 'AI 生成知识网络图'}
              </button>

              <div className="h-px bg-white/[0.06]" />
              <button
                type="button"
                className="w-full rounded-[8px] border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/10"
                onClick={() => setSmartGenOpen(true)}
                disabled={blockCount === 0}
              >
                🧠 智能生成（最强版）
              </button>
            </>
          )}
        </aside>

        {/* 中栏：编辑 / 全书预览 */}
        <section className="flex flex-1 flex-col min-w-0 overflow-hidden rounded-[12px] border border-white/[0.06] bg-[#1C2332]">
          {/* 视图切换 + 章节 Tab */}
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/[0.06] px-3 py-2">
            <div className="flex rounded-[6px] border border-white/10 p-0.5">
              <button
                type="button"
                onClick={() => setCenterView('edit')}
                className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                  centerView === 'edit' ? 'bg-[#2584FF] text-white' : 'text-[#8A94A9] hover:text-[#E8ECF3]'
                }`}
              >
                章节编辑
              </button>
              <button
                type="button"
                onClick={() => setCenterView('preview')}
                className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                  centerView === 'preview' ? 'bg-[#2584FF] text-white' : 'text-[#8A94A9] hover:text-[#E8ECF3]'
                }`}
              >
                全书预览 · 可编辑
                {blockCount > 0 && (
                  <span className="ml-1 rounded bg-white/20 px-1.5 py-0.5 text-[10px]">{blockCount}</span>
                )}
              </button>
            </div>

            {sourcePages.length > 0 && centerView === 'preview' && (
              <button
                type="button"
                className={`rounded px-2.5 py-1 text-xs ${
                  showCompare ? 'bg-cyan-600 text-white' : 'border border-white/10 text-[#8A94A9] hover:text-white'
                }`}
                onClick={() => setShowCompare((v) => !v)}
              >
                {showCompare ? '隐藏原件对比' : '原件对比'}
              </button>
            )}

            {centerView === 'edit' && (
              <>
                <span className="hidden h-4 w-px bg-white/10 sm:block" />
                {chapters.map((ch, i) => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => setSelectedChapter(i)}
                    className={`shrink-0 rounded-[6px] px-3 py-1.5 text-xs font-medium transition ${
                      i === selectedChapter
                        ? 'bg-[#2584FF]/80 text-white'
                        : 'text-[#8A94A9] hover:bg-[#222B3E] hover:text-[#E8ECF3]'
                    }`}
                  >
                    {ch.title}
                  </button>
                ))}
                <button type="button" onClick={addChapter} className="shrink-0 rounded-[6px] px-2 py-1.5 text-xs text-[#2584FF] hover:bg-[#2584FF]/10">
                  + 章节
                </button>
              </>
            )}
          </div>

          {centerView === 'edit' && (
          <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-white/[0.06] px-3 py-2">
            <button type="button" className={btnSecondary} onClick={addSection}>+ 小节</button>
            <button type="button" className={btnSecondary} onClick={() => addBlock('knowledge')}>+ 知识</button>
            <button type="button" className={btnSecondary} onClick={() => addBlock('example')}>+ 例题</button>
            <button type="button" className={btnSecondary} onClick={() => addBlock('exercise')}>+ 练习</button>
            <button type="button" className={btnSecondary} onClick={() => addBlock('summary')}>+ 总结</button>
          </div>
          )}

          <div className="flex-1 overflow-y-auto p-4">
            {message && (
              <p className="mb-3 rounded-[8px] border border-[#2584FF]/20 bg-[#2584FF]/10 px-3 py-2 text-sm text-[#5C9DFF]">
                {message}
                {centerView === 'edit' && blockCount > 0 && (
                  <button
                    type="button"
                    className="ml-2 underline hover:text-white"
                    onClick={() => setCenterView('preview')}
                  >
                    查看全书预览 →
                  </button>
                )}
              </p>
            )}

            {centerView === 'preview' ? (
              <div ref={previewRef} className={`mx-auto ${showCompare && sourcePages.length ? 'max-w-[1600px]' : 'max-w-4xl'}`}>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <p className="text-xs text-[#8A94A9]">
                    点击编辑 · 拖拽 ⋮⋮ 调序 · MathType 粘贴 · {chapters.length} 章 · {blockCount} 块
                  </p>
                  {sourcePages.length > 0 && (
                    <button
                      type="button"
                      className={`ml-auto rounded px-2.5 py-1 text-xs ${
                        showCompare ? 'bg-[#2584FF] text-white' : 'border border-white/10 text-[#8A94A9] hover:text-white'
                      }`}
                      onClick={() => setShowCompare((v) => !v)}
                    >
                      {showCompare ? '隐藏原件对比' : '显示原件对比'}
                    </button>
                  )}
                </div>
                {blockCount === 0 ? (
                  <div className="rounded-[12px] border border-amber-500/30 bg-amber-500/10 p-6 text-sm text-amber-100">
                    暂无正文。请「视觉识别导入」或在「章节编辑」中添加内容。
                  </div>
                ) : (
                  <div
                    className={
                      showCompare && sourcePages.length
                        ? 'flex min-h-[70vh] flex-col gap-3 lg:flex-row'
                        : ''
                    }
                  >
                    {showCompare && sourcePages.length > 0 && (
                      <div className="min-h-[320px] shrink-0 lg:w-[42%] lg:sticky lg:top-0 lg:self-start lg:max-h-[calc(100vh-12rem)]">
                        <BookOcrComparePanel
                          sourcePages={sourcePages}
                          pageOcrTexts={ocrPageTexts}
                          chapters={chapters}
                          pageIndex={comparePageIndex}
                          onPageIndexChange={setComparePageIndex}
                          activeBlock={activeBlock}
                          onActiveBlockChange={setActiveBlock}
                        />
                      </div>
                    )}
                    <div className={showCompare && sourcePages.length ? 'min-w-0 flex-1' : ''}>
                      <BookCanvasEditor
                        book={bookRecord()}
                        onBookChange={handleBookChange}
                        activeBlock={activeBlock}
                        onActiveBlockChange={setActiveBlock}
                        exportMode={exportMode}
                        sourcePages={sourcePages}
                        comparePageIndex={comparePageIndex}
                      />
                    </div>
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className={btnPrimary} onClick={() => void handleSave()}>
                    保存辅导书
                  </button>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={`${btnPrimary} text-xs`} onClick={() => void handleServerExportPdf(true)}>
                      📕 学生版 PDF（高清矢量）
                    </button>
                    <button type="button" className={`${btnPrimary} text-xs`} onClick={() => void handleServerExportPdf(false)}>
                      📗 教师版 PDF（高清矢量）
                    </button>
                    <button type="button" className={`${btnPrimary} text-xs`} onClick={() => void handleServerDualExportPdf()}>
                      📚 双版本一起导出
                    </button>
                    <button type="button" className={`${btnSecondary} text-xs`} onClick={() => runDualExport(true, 'word')}>
                      📄 导出学生版 Word
                    </button>
                    <button type="button" className={`${btnSecondary} text-xs`} onClick={() => runDualExport(false, 'word')}>
                      📄 导出教师版 Word
                    </button>
                    <button type="button" className={`${btnSecondary} text-xs`} onClick={() => void handleExportPdf()}>
                      🖼 图片版 PDF（备用）
                    </button>
                  </div>
                  <button
                    type="button"
                    className={btnSecondary}
                    disabled={formatLoading}
                    onClick={() => void handleFormatLayout()}
                  >
                    {formatLoading ? '排版中…' : '✨ AI 排版校准'}
                  </button>
                  <button type="button" className={btnSecondary} onClick={() => setCenterView('edit')}>
                    章节编辑
                  </button>
                  <button type="button" className={btnSecondary} onClick={() => void handleExportPdf()}>
                    导出 PDF
                  </button>
                </div>
              </div>
            ) : (
              <>
            <KnowledgeGraphView graph={knowledgeGraph ?? null} loading={graphLoading} />

            {(foreword || epilogue) && (
              <div className="mb-4 space-y-2 rounded-[8px] border border-white/[0.06] bg-[#222B3E] p-3">
                {foreword && (
                  <div>
                    <p className="text-[11px] text-[#8A94A9]">前言</p>
                    <textarea className={`${inputClass} mt-1 text-sm`} rows={3} value={foreword} onChange={(e) => setForeword(e.target.value)} />
                  </div>
                )}
                {epilogue && (
                  <div>
                    <p className="text-[11px] text-[#8A94A9]">后记</p>
                    <textarea className={`${inputClass} mt-1 text-sm`} rows={3} value={epilogue} onChange={(e) => setEpilogue(e.target.value)} />
                  </div>
                )}
              </div>
            )}

            {chapter?.sections.map((sec: BookSection) => (
              <div key={sec.id} className="mb-4">
                <input
                  className={`${inputClass} mb-2 font-semibold text-sm`}
                  value={sec.title}
                  onChange={(e) => {
                    const next = [...chapters]
                    const s = next[selectedChapter].sections.find((x) => x.id === sec.id)
                    if (s) s.title = e.target.value
                    setChapters(next)
                  }}
                />
                {sec.blocks.map((b) => (
                  <div key={b.id} className="mb-2 rounded-[8px] border border-white/[0.06] bg-[#222B3E] p-2">
                    <p className="text-[11px] text-[#8A94A9]">{b.title}</p>
                    <EmbeddedFigureTextarea
                      className={`${inputClass} mt-1 text-sm`}
                      variant="dark"
                      rows={Math.min(
                        16,
                        Math.max(4, Math.ceil(extractEmbeddedFigures(b.content).text.length / 60)),
                      )}
                      value={b.content}
                      onChange={(content) => {
                        setChapters(
                          chapters.map((ch, ci) =>
                            ci !== selectedChapter
                              ? ch
                              : {
                                  ...ch,
                                  sections: ch.sections.map((s) =>
                                    s.id !== sec.id
                                      ? s
                                      : {
                                          ...s,
                                          blocks: s.blocks.map((blk) =>
                                            blk.id === b.id ? { ...blk, content } : blk,
                                          ),
                                        },
                                  ),
                                },
                          ),
                        )
                      }}
                    />
                  </div>
                ))}
              </div>
            ))}

            {/* 底部操作按钮 */}
            <div className="flex flex-wrap gap-2 border-t border-white/[0.06] pt-3">
              <button type="button" className={btnPrimary} onClick={() => void handleSave()}>
                保存辅导书
              </button>
              <button type="button" className={`${btnPrimary} text-xs`} onClick={() => void handleServerExportPdf(true)}>
                📕 学生版 PDF（矢量）
              </button>
              <button type="button" className={`${btnPrimary} text-xs`} onClick={() => void handleServerExportPdf(false)}>
                📗 教师版 PDF（矢量）
              </button>
              <button type="button" className={`${btnPrimary} text-xs`} onClick={() => void handleServerDualExportPdf()}>
                📚 双版本导出
              </button>
              <button type="button" className={`${btnSecondary} text-xs`} onClick={() => runDualExport(true, 'word')}>
                📄 学生版 Word
              </button>
              <button type="button" className={`${btnSecondary} text-xs`} onClick={() => runDualExport(false, 'word')}>
                📄 教师版 Word
              </button>
              <button
                type="button"
                className={btnSecondary}
                onClick={() => setCenterView('preview')}
              >
                全书预览
              </button>
              <button
                type="button"
                className={`rounded px-3 py-1.5 text-xs ${exportMode === 'print' ? 'bg-[#2584FF] text-white' : 'bg-slate-700 text-slate-300'}`}
                onClick={() => setExportMode('print')}
              >
                可打印版
              </button>
              <button
                type="button"
                className={`rounded px-3 py-1.5 text-xs ${exportMode === 'digital' ? 'bg-[#2584FF] text-white' : 'bg-slate-700 text-slate-300'}`}
                onClick={() => setExportMode('digital')}
              >
                电子阅读版
              </button>
              <button
                type="button"
                className={btnSecondary}
                onClick={() =>
                  exportHtmlAsWord(bookToExportHtml(bookRecord(), { mode: exportMode }), title, {
                    mode: exportMode,
                    title,
                  })
                }
              >
                导出 Word
              </button>
              <button
                type="button"
                className={btnSecondary}
                onClick={() => void handleExportPdf()}
              >
                导出 PDF
              </button>
            </div>
            <p className="mt-2 text-[11px] text-[#8A94A9]">5 种排版模板 · 服务端矢量 PDF（可选中文字） · Word 保留分栏样式</p>
              </>
            )}
          </div>
        </section>
      </main>

      <BookSmartGenerateModal
        open={smartGenOpen}
        onClose={() => setSmartGenOpen(false)}
        teacherId={teacherId}
        bookRecord={bookRecord()}
        onComplete={handleSmartGenComplete}
      />
    </div>
  )
}
