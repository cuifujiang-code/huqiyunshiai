import { useMemo, useState } from 'react'
import type { BookBlockRef } from './BookCanvasEditor'
import type { BookChapter } from '../../types/teacher'
import type { SourcePageImage } from '../../lib/figureExtract'
import MathRenderer from '../common/MathRenderer'

interface Props {
  sourcePages: SourcePageImage[]
  pageOcrTexts: string[]
  chapters: BookChapter[]
  pageIndex: number
  onPageIndexChange: (idx: number) => void
  activeBlock: BookBlockRef | null
  onActiveBlockChange: (ref: BookBlockRef | null) => void
}

function pageSrc(page: SourcePageImage): string {
  const mime = page.mimeType || 'image/png'
  const raw = page.base64.replace(/^data:[^;]+;base64,/, '')
  return `data:${mime};base64,${raw}`
}

/** 原件 vs 识别结果 — 左右对照（识别页内嵌于中栏左侧） */
export default function BookOcrComparePanel({
  sourcePages,
  pageOcrTexts,
  chapters,
  pageIndex,
  onPageIndexChange,
  activeBlock,
  onActiveBlockChange,
}: Props) {
  const [rightTab, setRightTab] = useState<'raw' | 'blocks'>('raw')
  const [zoom, setZoom] = useState(100)

  const page = sourcePages[pageIndex]
  const rawText = pageOcrTexts[pageIndex] ?? pageOcrTexts[0] ?? ''

  const pageBlocks = useMemo(() => {
    const items: { ref: BookBlockRef; block: (typeof chapters)[0]['sections'][0]['blocks'][0] }[] = []
    chapters.forEach((ch, ci) =>
      ch.sections.forEach((sec, si) =>
        sec.blocks.forEach((block, bi) => {
          const linked = block.style?.sourcePageIndex
          if (linked === undefined || linked === pageIndex) {
            items.push({ ref: { chapterIndex: ci, sectionIndex: si, blockIndex: bi }, block })
          }
        }),
      ),
    )
    return items
  }, [chapters, pageIndex])

  if (!sourcePages.length) return null

  return (
    <div className="flex h-full min-h-0 flex-col rounded-[10px] border border-white/10 bg-[#151b28]">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/[0.06] px-3 py-2">
        <span className="text-xs font-medium text-[#5C9DFF]">原件对比</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded px-2 py-0.5 text-xs text-[#8A94A9] hover:bg-white/5 hover:text-white disabled:opacity-40"
            disabled={pageIndex <= 0}
            onClick={() => onPageIndexChange(pageIndex - 1)}
          >
            ←
          </button>
          <span className="min-w-[4.5rem] text-center text-xs text-[#E8ECF3]">
            第 {pageIndex + 1} / {sourcePages.length} 页
          </span>
          <button
            type="button"
            className="rounded px-2 py-0.5 text-xs text-[#8A94A9] hover:bg-white/5 hover:text-white disabled:opacity-40"
            disabled={pageIndex >= sourcePages.length - 1}
            onClick={() => onPageIndexChange(pageIndex + 1)}
          >
            →
          </button>
        </div>
        <label className="ml-auto flex items-center gap-1 text-[10px] text-[#8A94A9]">
          缩放
          <input
            type="range"
            min={60}
            max={160}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-16"
          />
          {zoom}%
        </label>
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-2 gap-0 lg:grid-rows-1 lg:grid-cols-2">
        {/* 原件 */}
        <div className="flex min-h-0 flex-col border-b border-white/[0.06] lg:border-b-0 lg:border-r">
          <div className="shrink-0 px-3 py-1.5 text-[10px] font-medium text-[#8A94A9]">扫描原件</div>
          <div className="min-h-0 flex-1 overflow-auto bg-[#0d1117] p-2">
            {page ? (
              <img
                src={pageSrc(page)}
                alt={`原图第 ${pageIndex + 1} 页`}
                className="mx-auto block shadow-lg"
                style={{ width: `${zoom}%`, maxWidth: 'none' }}
              />
            ) : (
              <p className="p-4 text-xs text-[#8A94A9]">无原图</p>
            )}
          </div>
        </div>

        {/* 识别结果 */}
        <div className="flex min-h-0 flex-col">
          <div className="flex shrink-0 items-center gap-1 border-b border-white/[0.06] px-2 py-1">
            <button
              type="button"
              className={`rounded px-2 py-0.5 text-[10px] ${
                rightTab === 'raw' ? 'bg-[#2584FF]/30 text-[#5C9DFF]' : 'text-[#8A94A9] hover:text-white'
              }`}
              onClick={() => setRightTab('raw')}
            >
              识别原文
            </button>
            <button
              type="button"
              className={`rounded px-2 py-0.5 text-[10px] ${
                rightTab === 'blocks' ? 'bg-[#2584FF]/30 text-[#5C9DFF]' : 'text-[#8A94A9] hover:text-white'
              }`}
              onClick={() => setRightTab('blocks')}
            >
              结构化块 ({pageBlocks.length})
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-3">
            {rightTab === 'raw' ? (
              rawText.trim() ? (
                <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-[#C5CDD9]">
                  {rawText}
                </pre>
              ) : (
                <p className="text-xs italic text-[#8A94A9]">本页暂无 OCR 原文（可切换页码查看）</p>
              )
            ) : pageBlocks.length > 0 ? (
              <ul className="space-y-2">
                {pageBlocks.map(({ ref, block }) => {
                  const active =
                    activeBlock?.chapterIndex === ref.chapterIndex &&
                    activeBlock?.sectionIndex === ref.sectionIndex &&
                    activeBlock?.blockIndex === ref.blockIndex
                  return (
                    <li key={block.id}>
                      <button
                        type="button"
                        className={`w-full rounded-lg border px-2 py-2 text-left transition ${
                          active
                            ? 'border-[#2584FF] bg-[#2584FF]/15'
                            : 'border-white/10 bg-[#1C2332] hover:border-[#2584FF]/40'
                        }`}
                        onClick={() => onActiveBlockChange(ref)}
                      >
                        <div className="mb-1 text-[10px] font-medium text-[#5C9DFF]">{block.title}</div>
                        <div className="max-h-24 overflow-hidden text-xs text-[#C5CDD9]">
                          <MathRenderer text={block.content.slice(0, 800)} className="math-renderer" />
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-xs text-[#8A94A9]">
                本页暂无关联内容块。可在预览区选中块后，工具栏「关联页码」绑定到当前页。
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
