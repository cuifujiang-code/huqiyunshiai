import { useRef, useState } from 'react'
import type { BookBlock, BookChapter, BookCoverStyle, BookRecord, ExportMode } from '../../types/teacher'
import type { SourcePageImage } from '../../lib/figureExtract'
import MathRenderer from '../common/MathRenderer'
import BookInlineBlockEditor from './BookInlineBlockEditor'
import FigureCropModal from './FigureCropModal'
import { FONT_FAMILIES } from '../handout/HandoutOcrImportModal'
import type { CSSProperties } from 'react'

export type BookBlockRef = { chapterIndex: number; sectionIndex: number; blockIndex: number }

const COVER_STYLES: Record<BookCoverStyle, CSSProperties> = {
  minimal: { background: '#fff', color: '#111', border: '2px solid #111' },
  academic: { background: 'linear-gradient(135deg,#1e3a5f,#2c5282)', color: '#fff' },
  fresh: { background: 'linear-gradient(135deg,#ecfdf5,#d1fae5)', color: '#065f46', border: '3px solid #34d399' },
}

const BLOCK_LABELS: Record<BookBlock['type'], string> = {
  knowledge: '知识讲解',
  example: '例题',
  exercise: '练习',
  summary: '本章总结',
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

function appendSnippet(text: string, snippet: string) {
  const base = text.trim()
  return base ? `${base}\n\n${snippet}` : snippet
}

function blockStyle(b: BookBlock): CSSProperties {
  return {
    fontSize: b.style?.fontSize ?? 14,
    color: b.style?.color ?? '#111827',
    fontFamily: b.style?.fontFamily ?? 'Microsoft YaHei, SimSun, serif',
    lineHeight: 1.75,
  }
}

export function updateBookBlock(
  chapters: BookChapter[],
  ref: BookBlockRef,
  patch: Partial<BookBlock>,
): BookChapter[] {
  return chapters.map((ch, ci) =>
    ci !== ref.chapterIndex
      ? ch
      : {
          ...ch,
          sections: ch.sections.map((sec, si) =>
            si !== ref.sectionIndex
              ? sec
              : {
                  ...sec,
                  blocks: sec.blocks.map((b, bi) => (bi !== ref.blockIndex ? b : { ...b, ...patch })),
                },
          ),
        },
  )
}

export function updateBookBlockStyle(
  chapters: BookChapter[],
  ref: BookBlockRef,
  stylePatch: Partial<NonNullable<BookBlock['style']>>,
): BookChapter[] {
  const ch = chapters[ref.chapterIndex]
  const b = ch?.sections[ref.sectionIndex]?.blocks[ref.blockIndex]
  if (!b) return chapters
  return updateBookBlock(chapters, ref, { style: { ...b.style, ...stylePatch } })
}

export function reorderBookBlocks(
  chapters: BookChapter[],
  ref: BookBlockRef,
  toIndex: number,
): BookChapter[] {
  const sec = chapters[ref.chapterIndex]?.sections[ref.sectionIndex]
  if (!sec) return chapters
  const blocks = [...sec.blocks]
  const from = ref.blockIndex
  if (from < 0 || from >= blocks.length || toIndex < 0 || toIndex >= blocks.length || from === toIndex) {
    return chapters
  }
  const [item] = blocks.splice(from, 1)
  blocks.splice(toIndex, 0, item)
  return chapters.map((ch, ci) =>
    ci !== ref.chapterIndex
      ? ch
      : {
          ...ch,
          sections: ch.sections.map((s, si) =>
            si !== ref.sectionIndex ? s : { ...s, blocks },
          ),
        },
  )
}

function blockLayoutStyle(b: BookBlock): CSSProperties {
  const base = blockStyle(b)
  const s = b.style
  return {
    ...base,
    marginTop: s?.marginTop ?? undefined,
    textAlign: s?.align ?? undefined,
  }
}

function blockWrapperClass(b: BookBlock): string {
  return b.style?.width === 'half' ? 'w-full md:w-[calc(50%-0.375rem)]' : 'w-full'
}

interface Props {
  book: BookRecord
  onBookChange: (patch: Partial<Pick<BookRecord, 'title' | 'grade' | 'level' | 'chapters' | 'foreword' | 'epilogue'>>) => void
  activeBlock: BookBlockRef | null
  onActiveBlockChange: (ref: BookBlockRef | null) => void
  exportMode?: ExportMode
  /** OCR 导入时的原图页，用于手动裁剪插入图形 */
  sourcePages?: SourcePageImage[]
  /** 原件对比当前页（0-based），用于「关联页码」快捷绑定 */
  comparePageIndex?: number
}

export default function BookCanvasEditor({
  book,
  onBookChange,
  activeBlock,
  onActiveBlockChange,
  exportMode = 'print',
  sourcePages = [],
  comparePageIndex = 0,
}: Props) {
  const coverStyle = book.coverStyle ?? 'academic'
  const settings = book.layoutSettings ?? {}
  const [figureCropOpen, setFigureCropOpen] = useState(false)
  const [figureCropRef, setFigureCropRef] = useState<BookBlockRef | null>(null)
  const [dragBlockRef, setDragBlockRef] = useState<BookBlockRef | null>(null)

  const setChapters = (chapters: BookChapter[]) => onBookChange({ chapters })

  const updateBlock = (ref: BookBlockRef, patch: Partial<BookBlock>) => {
    setChapters(updateBookBlock(book.chapters, ref, patch))
  }

  const updateStyle = (ref: BookBlockRef, patch: Partial<NonNullable<BookBlock['style']>>) => {
    setChapters(updateBookBlockStyle(book.chapters, ref, patch))
  }

  const moveBlock = (ref: BookBlockRef, delta: -1 | 1) => {
    setChapters(reorderBookBlocks(book.chapters, ref, ref.blockIndex + delta))
    onActiveBlockChange({ ...ref, blockIndex: ref.blockIndex + delta })
  }

  const dropBlock = (ref: BookBlockRef, toIndex: number) => {
    setChapters(reorderBookBlocks(book.chapters, ref, toIndex))
    onActiveBlockChange({ ...ref, blockIndex: toIndex })
  }

  const insertSnippet = (ref: BookBlockRef, snippet: string) => {
    const b = book.chapters[ref.chapterIndex]?.sections[ref.sectionIndex]?.blocks[ref.blockIndex]
    if (!b) return
    updateBlock(ref, { content: appendSnippet(b.content, snippet) })
  }

  const openFigureCrop = (ref: BookBlockRef) => {
    setFigureCropRef(ref)
    setFigureCropOpen(true)
  }

  const insertFigureSnippet = (snippet: string) => {
    if (!figureCropRef) return
    insertSnippet(figureCropRef, snippet)
  }

  const removeBlock = (ref: BookBlockRef) => {
    const next = book.chapters.map((ch, ci) =>
      ci !== ref.chapterIndex
        ? ch
        : {
            ...ch,
            sections: ch.sections.map((sec, si) =>
              si !== ref.sectionIndex
                ? sec
                : { ...sec, blocks: sec.blocks.filter((_, bi) => bi !== ref.blockIndex) },
            ),
          },
    )
    setChapters(next)
    onActiveBlockChange(null)
  }

  const addBlock = (ci: number, si: number, type: BookBlock['type']) => {
    const next = book.chapters.map((ch, i) =>
      i !== ci
        ? ch
        : {
            ...ch,
            sections: ch.sections.map((sec, j) =>
              j !== si
                ? sec
                : {
                    ...sec,
                    blocks: [...sec.blocks, { id: newId('blk'), type, title: BLOCK_LABELS[type], content: '' }],
                  },
            ),
          },
    )
    setChapters(next)
    const sec = next[ci]?.sections[si]
    if (sec) onActiveBlockChange({ chapterIndex: ci, sectionIndex: si, blockIndex: sec.blocks.length - 1 })
  }

  const isActive = (ref: BookBlockRef) =>
    activeBlock?.chapterIndex === ref.chapterIndex &&
    activeBlock?.sectionIndex === ref.sectionIndex &&
    activeBlock?.blockIndex === ref.blockIndex

  const activeBlockData =
    activeBlock &&
    book.chapters[activeBlock.chapterIndex]?.sections[activeBlock.sectionIndex]?.blocks[activeBlock.blockIndex]

  return (
    <div
      className="book-canvas-root rounded-[12px] border border-white/10 bg-white text-[#111] shadow-xl"
      style={{ fontFamily: settings.fontFamily ?? 'SimSun, "Microsoft YaHei", serif' }}
      onClick={() => onActiveBlockChange(null)}
    >
      <div className="border-b border-slate-200 px-4 py-2 text-center text-xs text-slate-500">
        点击任意题目/段落直接编辑 · 拖拽 ⋮⋮ 调整顺序 · 支持 MathType 粘贴与半宽排版
      </div>

      <div className={`book-canvas-content px-8 py-10 ${exportMode === 'digital' ? 'leading-relaxed' : ''}`}>
        {/* 封面 */}
        <section
          className="mb-10 flex min-h-[200px] flex-col items-center justify-center rounded-lg border border-slate-200 p-10 text-center"
          style={COVER_STYLES[coverStyle]}
        >
          <input
            className="mb-2 w-full border-none bg-transparent text-center text-3xl font-bold outline-none focus:ring-2 focus:ring-blue-400 rounded"
            style={{ color: 'inherit' }}
            value={book.title}
            onChange={(e) => onBookChange({ title: e.target.value })}
            placeholder="书名"
          />
          <div className="flex w-full max-w-xs gap-2 text-base opacity-90">
            <input
              className="flex-1 border-none bg-transparent text-center outline-none focus:ring-1 focus:ring-blue-300 rounded"
              style={{ color: 'inherit' }}
              value={book.grade}
              onChange={(e) => onBookChange({ grade: e.target.value })}
              placeholder="年级"
            />
            <span>·</span>
            <input
              className="flex-1 border-none bg-transparent text-center outline-none focus:ring-1 focus:ring-blue-300 rounded"
              style={{ color: 'inherit' }}
              value={book.level}
              onChange={(e) => onBookChange({ level: e.target.value })}
              placeholder="难度"
            />
          </div>
        </section>

        {/* 前言 */}
        <section className="mb-8 border-b border-slate-200 pb-6">
          <h2 className="mb-2 text-lg font-semibold" style={{ color: settings.headingColor ?? '#1e40af' }}>
            前言
          </h2>
          <textarea
            className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
            rows={3}
            value={book.foreword ?? ''}
            onChange={(e) => onBookChange({ foreword: e.target.value })}
            placeholder="点击输入前言（选填）"
          />
        </section>

        {/* 章节内容 */}
        {book.chapters.map((ch, ci) => (
          <section key={ch.id || ci} id={`book-ch-${ci}`} className="mb-10">
            <input
              className="mb-4 w-full border-none border-b-2 bg-transparent text-xl font-bold outline-none focus:border-blue-500"
              style={{ borderColor: settings.headingColor ?? '#1e40af', color: settings.headingColor ?? '#1e40af' }}
              value={ch.title}
              onChange={(e) => {
                const chapters = book.chapters.map((c, i) => (i === ci ? { ...c, title: e.target.value } : c))
                setChapters(chapters)
              }}
              placeholder="章节标题"
            />

            {ch.sections.map((sec, si) => (
              <div key={sec.id || si} className="mb-6">
                <input
                  className="mb-3 w-full border-none bg-transparent text-lg font-semibold outline-none focus:ring-1 focus:ring-blue-400 rounded pl-2"
                  style={{ color: settings.headingColor ?? '#1e40af' }}
                  value={sec.title}
                  onChange={(e) => {
                    const chapters = book.chapters.map((c, i) =>
                      i !== ci
                        ? c
                        : {
                            ...c,
                            sections: c.sections.map((s, j) => (j === si ? { ...s, title: e.target.value } : s)),
                          },
                    )
                    setChapters(chapters)
                  }}
                  placeholder="小节标题"
                />

                <div className="book-section-blocks mb-4 flex flex-wrap gap-3">
                {sec.blocks.map((b, bi) => {
                  const ref: BookBlockRef = { chapterIndex: ci, sectionIndex: si, blockIndex: bi }
                  const active = isActive(ref)
                  const isDragging =
                    dragBlockRef?.chapterIndex === ci &&
                    dragBlockRef?.sectionIndex === si &&
                    dragBlockRef?.blockIndex === bi
                  return (
                    <article
                      key={b.id || bi}
                      id={`book-block-${ci}-${si}-${bi}`}
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation()
                        setDragBlockRef(ref)
                      }}
                      onDragOver={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        if (dragBlockRef && dragBlockRef.sectionIndex === si && dragBlockRef.chapterIndex === ci) {
                          dropBlock(dragBlockRef, bi)
                        }
                        setDragBlockRef(null)
                      }}
                      onDragEnd={() => setDragBlockRef(null)}
                      className={`book-block scroll-mt-4 rounded-lg p-3 transition ${blockWrapperClass(b)} ${
                        isDragging ? 'opacity-50 ring-2 ring-dashed ring-blue-400' : ''
                      } ${
                        active ? 'ring-2 ring-[#2563eb] ring-offset-2 bg-blue-50/40' : 'hover:bg-slate-50 cursor-text'
                      } ${b.missingAnswer ? 'border-l-4 border-amber-400 pl-3' : ''}`}
                      style={blockLayoutStyle(b)}
                      onClick={(e) => {
                        e.stopPropagation()
                        onActiveBlockChange(ref)
                      }}
                    >
                      <div className="mb-1 flex items-center gap-2 text-[10px] text-slate-400">
                        <span className="cursor-grab select-none" title="拖拽调整顺序">
                          ⋮⋮
                        </span>
                        {b.style?.sourcePageIndex != null && sourcePages.length > 0 && (
                          <span className="rounded bg-cyan-50 px-1.5 text-cyan-700">
                            原图第 {b.style.sourcePageIndex + 1} 页
                          </span>
                        )}
                      </div>
                      {active && activeBlockData && (
                        <div
                          className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-slate-700"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="font-medium text-blue-700">纠错编辑</span>
                          <select
                            className="rounded border border-slate-300 px-1 py-0.5"
                            value={b.type}
                            onChange={(e) =>
                              updateBlock(ref, { type: e.target.value as BookBlock['type'] })
                            }
                          >
                            <option value="knowledge">知识讲解</option>
                            <option value="example">例题</option>
                            <option value="exercise">练习</option>
                            <option value="summary">总结</option>
                          </select>
                          <label className="flex items-center gap-1">
                            字号
                            <input
                              type="number"
                              min={12}
                              max={28}
                              className="w-12 rounded border border-slate-300 px-1 py-0.5"
                              value={b.style?.fontSize ?? 14}
                              onChange={(e) => updateStyle(ref, { fontSize: Number(e.target.value) || 14 })}
                            />
                          </label>
                          <label className="flex items-center gap-1">
                            字体
                            <select
                              className="rounded border border-slate-300 px-1 py-0.5"
                              value={b.style?.fontFamily ?? 'Microsoft YaHei'}
                              onChange={(e) => updateStyle(ref, { fontFamily: e.target.value })}
                            >
                              {FONT_FAMILIES.map((f) => (
                                <option key={f.value} value={f.value}>{f.label}</option>
                              ))}
                            </select>
                          </label>
                          <label className="flex items-center gap-1">
                            颜色
                            <input
                              type="color"
                              className="h-7 w-9 cursor-pointer rounded border border-slate-300"
                              value={b.style?.color ?? '#111827'}
                              onChange={(e) => updateStyle(ref, { color: e.target.value })}
                            />
                          </label>
                          <label className="flex items-center gap-1">
                            宽度
                            <select
                              className="rounded border border-slate-300 px-1 py-0.5"
                              value={b.style?.width ?? 'full'}
                              onChange={(e) =>
                                updateStyle(ref, { width: e.target.value as 'full' | 'half' })
                              }
                            >
                              <option value="full">整行</option>
                              <option value="half">半宽</option>
                            </select>
                          </label>
                          <label className="flex items-center gap-1">
                            对齐
                            <select
                              className="rounded border border-slate-300 px-1 py-0.5"
                              value={b.style?.align ?? 'left'}
                              onChange={(e) =>
                                updateStyle(ref, { align: e.target.value as 'left' | 'center' | 'right' })
                              }
                            >
                              <option value="left">左</option>
                              <option value="center">中</option>
                              <option value="right">右</option>
                            </select>
                          </label>
                          <label className="flex items-center gap-1">
                            上距
                            <input
                              type="number"
                              min={0}
                              max={120}
                              className="w-12 rounded border border-slate-300 px-1 py-0.5"
                              value={b.style?.marginTop ?? 0}
                              onChange={(e) => updateStyle(ref, { marginTop: Number(e.target.value) || 0 })}
                            />
                          </label>
                          {sourcePages.length > 0 && (
                            <button
                              type="button"
                              className="rounded bg-white px-2 py-0.5 border border-cyan-200 text-cyan-800 hover:bg-cyan-50"
                              onClick={() => updateStyle(ref, { sourcePageIndex: comparePageIndex })}
                              title="绑定到原件对比当前页"
                            >
                              关联页码
                            </button>
                          )}
                          <button
                            type="button"
                            className="rounded bg-white px-2 py-0.5 border border-slate-300 hover:bg-slate-100 disabled:opacity-40"
                            disabled={bi === 0}
                            onClick={() => moveBlock(ref, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="rounded bg-white px-2 py-0.5 border border-slate-300 hover:bg-slate-100 disabled:opacity-40"
                            disabled={bi >= sec.blocks.length - 1}
                            onClick={() => moveBlock(ref, 1)}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="rounded bg-white px-2 py-0.5 border border-slate-300 hover:bg-slate-100"
                            onClick={() => insertSnippet(ref, '---')}
                          >
                            + 分隔线
                          </button>
                          <button
                            type="button"
                            className="rounded bg-white px-2 py-0.5 border border-slate-300 hover:bg-slate-100"
                            onClick={() => insertSnippet(ref, '$$\n\n$$')}
                          >
                            + 公式
                          </button>
                          {sourcePages.length > 0 && (
                            <button
                              type="button"
                              className="rounded bg-white px-2 py-0.5 border border-cyan-300 text-cyan-800 hover:bg-cyan-50"
                              onClick={() => openFigureCrop(ref)}
                            >
                              ✂ 提取图形
                            </button>
                          )}
                          <button
                            type="button"
                            className="ml-auto rounded bg-red-50 px-2 py-0.5 text-red-600 border border-red-200 hover:bg-red-100"
                            onClick={() => removeBlock(ref)}
                          >
                            删除
                          </button>
                        </div>
                      )}

                      <input
                        className="mb-2 w-full border-none bg-transparent font-semibold outline-none focus:ring-1 focus:ring-blue-400 rounded"
                        style={blockStyle(b)}
                        value={b.title}
                        onClick={(e) => e.stopPropagation()}
                        onFocus={() => onActiveBlockChange(ref)}
                        onChange={(e) => updateBlock(ref, { title: e.target.value })}
                        placeholder="块标题"
                      />

                      {b.missingAnswer && (
                        <span className="mb-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                          答案待补充
                        </span>
                      )}

                      <div style={blockStyle(b)} onClick={(e) => e.stopPropagation()}>
                        <BookInlineBlockEditor
                          value={b.content}
                          figures={b.figures}
                          onChange={(text) => updateBlock(ref, { content: text, missingAnswer: false })}
                          style={blockStyle(b)}
                          isActive={active}
                          onActivate={() => onActiveBlockChange(ref)}
                          hasSourcePages={sourcePages.length > 0}
                          onInsertFigure={() => openFigureCrop(ref)}
                        />
                      </div>
                    </article>
                  )
                })}
                </div>

                <div className="mt-2 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                  {(['knowledge', 'example', 'exercise', 'summary'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs hover:bg-blue-50 hover:border-blue-400"
                      onClick={() => addBlock(ci, si, t)}
                    >
                      + {BLOCK_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}

        {/* 后记 */}
        <section className="mt-8 border-t border-slate-200 pt-6">
          <h2 className="mb-2 text-lg font-semibold" style={{ color: settings.headingColor ?? '#1e40af' }}>
            后记
          </h2>
          <textarea
            className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
            rows={3}
            value={book.epilogue ?? ''}
            onChange={(e) => onBookChange({ epilogue: e.target.value })}
            placeholder="点击输入后记（选填）"
          />
        </section>
      </div>

      <FigureCropModal
        open={figureCropOpen}
        pages={sourcePages}
        onClose={() => {
          setFigureCropOpen(false)
          setFigureCropRef(null)
        }}
        onInsert={insertFigureSnippet}
      />
    </div>
  )
}
