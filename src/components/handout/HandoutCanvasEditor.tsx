import { forwardRef, useCallback, type CSSProperties } from 'react'
import type { HandoutContent, HandoutModule, HandoutModuleType } from '../../types/teacher'
import MathRenderer from '../common/MathRenderer'
import LatexFormulaEditor from '../common/LatexFormulaEditor'
import { FONT_FAMILIES } from './HandoutOcrImportModal'
import { MODULE_PALETTE, createModule } from './handoutConstants'

interface Props {
  content: HandoutContent
  onChange: (next: HandoutContent) => void
  activeModuleIndex: number | null
  onActiveModuleIndexChange: (index: number | null) => void
  exportMode?: 'print' | 'digital'
}

function moduleStyle(m: HandoutModule): CSSProperties {
  return {
    fontSize: m.style?.fontSize ?? 14,
    color: m.style?.color ?? '#111827',
    fontFamily: m.style?.fontFamily ?? 'Microsoft YaHei, SimSun, serif',
    lineHeight: 1.75,
  }
}

function appendSnippet(text: string, snippet: string) {
  const base = text.trim()
  return base ? `${base}\n\n${snippet}` : snippet
}

const HandoutCanvasEditor = forwardRef<HTMLDivElement, Props>(function HandoutCanvasEditor(
  { content, onChange, activeModuleIndex, onActiveModuleIndexChange, exportMode = 'print' },
  ref,
) {
  const cover = content.cover ?? { title: content.title }
  const header = content.headerText?.trim() || content.title
  const footer = content.footerText?.trim() || '华祺云师 AI · 讲义'

  const updateModule = useCallback(
    (i: number, patch: Partial<HandoutModule>) => {
      const modules = [...content.modules]
      modules[i] = { ...modules[i], ...patch }
      onChange({ ...content, modules })
    },
    [content, onChange],
  )

  const updateStyle = useCallback(
    (i: number, patch: { fontSize?: number; color?: string; fontFamily?: string }) => {
      const mod = content.modules[i]
      updateModule(i, { style: { ...mod.style, ...patch } })
    },
    [content.modules, updateModule],
  )

  const removeModule = (i: number) => {
    onChange({ ...content, modules: content.modules.filter((_, j) => j !== i) })
    onActiveModuleIndexChange(null)
  }

  const addModule = (type: HandoutModuleType) => {
    const modules = [...content.modules, createModule(type)]
    onChange({ ...content, modules })
    onActiveModuleIndexChange(modules.length - 1)
  }

  const insertSnippet = (i: number, snippet: string) => {
    updateModule(i, { content: appendSnippet(content.modules[i].content, snippet) })
  }

  return (
    <div
      ref={ref}
      className="handout-canvas-root rounded-[12px] border border-white/[0.06] bg-white text-[#111] shadow-xl"
      style={{ fontFamily: 'SimSun, "Microsoft YaHei", serif' }}
    >
      {/* 页眉 */}
      <div className="border-b border-slate-200 px-6 py-2 text-center text-xs text-slate-500">
        <input
          className="w-full border-none bg-transparent text-center outline-none focus:ring-1 focus:ring-blue-400 rounded px-1"
          value={header}
          onChange={(e) => onChange({ ...content, headerText: e.target.value })}
          placeholder="页眉文字"
        />
      </div>

      <div className={`px-8 py-10 ${exportMode === 'digital' ? 'leading-relaxed' : ''}`}>
        {/* 封面 */}
        <section className="mb-10 border-b border-slate-200 pb-10 text-center">
          <input
            className="mb-3 w-full border-none bg-transparent text-center text-3xl font-bold outline-none focus:ring-2 focus:ring-blue-400 rounded"
            value={cover.title}
            onChange={(e) =>
              onChange({
                ...content,
                title: e.target.value,
                cover: { ...cover, title: e.target.value },
              })
            }
            placeholder="讲义主标题"
          />
          <input
            className="mb-4 w-full border-none bg-transparent text-center text-lg text-slate-600 outline-none focus:ring-1 focus:ring-blue-300 rounded"
            value={cover.subtitle ?? ''}
            onChange={(e) => onChange({ ...content, cover: { ...cover, subtitle: e.target.value } })}
            placeholder="副标题（选填）"
          />
          <div className="space-y-1 text-sm text-slate-500">
            <input
              className="w-full border-none bg-transparent text-center outline-none focus:ring-1 focus:ring-blue-300 rounded"
              value={cover.teacherName ?? ''}
              onChange={(e) => onChange({ ...content, cover: { ...cover, teacherName: e.target.value } })}
              placeholder="主讲教师"
            />
            <input
              className="w-full border-none bg-transparent text-center outline-none focus:ring-1 focus:ring-blue-300 rounded"
              value={cover.date ?? ''}
              onChange={(e) => onChange({ ...content, cover: { ...cover, date: e.target.value } })}
              placeholder="日期"
            />
          </div>
        </section>

        {/* 模块列表 — 直接在讲义页上编辑 */}
        {content.modules.map((mod, i) => {
          const active = activeModuleIndex === i
          return (
            <section
              key={mod.id || i}
              id={`handout-mod-${i}`}
              className={`handout-module mb-8 scroll-mt-4 rounded-lg transition ${
                active ? 'ring-2 ring-[#2563eb] ring-offset-2 bg-blue-50/30' : 'hover:bg-slate-50/80'
              } ${mod.missingAnswer ? 'border-l-4 border-amber-400 pl-3' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                onActiveModuleIndexChange(i)
              }}
            >
              {/* 选中时：格式工具栏 */}
              {active && (
                <div
                  className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-slate-700"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="font-medium text-blue-700">格式</span>
                  <label className="flex items-center gap-1">
                    字号
                    <input
                      type="number"
                      min={12}
                      max={28}
                      className="w-12 rounded border border-slate-300 px-1 py-0.5"
                      value={mod.style?.fontSize ?? 14}
                      onChange={(e) => updateStyle(i, { fontSize: Number(e.target.value) || 14 })}
                    />
                  </label>
                  <label className="flex items-center gap-1">
                    字体
                    <select
                      className="rounded border border-slate-300 px-1 py-0.5"
                      value={mod.style?.fontFamily ?? 'Microsoft YaHei'}
                      onChange={(e) => updateStyle(i, { fontFamily: e.target.value })}
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
                      value={mod.style?.color ?? '#111827'}
                      onChange={(e) => updateStyle(i, { color: e.target.value })}
                    />
                  </label>
                  <span className="mx-1 text-slate-300">|</span>
                  <button
                    type="button"
                    className="rounded bg-white px-2 py-0.5 border border-slate-300 hover:bg-slate-100"
                    onClick={() => insertSnippet(i, '---')}
                  >
                    + 分隔线
                  </button>
                  <button
                    type="button"
                    className="rounded bg-white px-2 py-0.5 border border-slate-300 hover:bg-slate-100"
                    onClick={() => insertSnippet(i, '[提示] ')}
                  >
                    + 提示框
                  </button>
                  <button
                    type="button"
                    className="rounded bg-white px-2 py-0.5 border border-slate-300 hover:bg-slate-100"
                    onClick={() => insertSnippet(i, '[板书] ')}
                  >
                    + 板书
                  </button>
                  <button
                    type="button"
                    className="rounded bg-white px-2 py-0.5 border border-slate-300 hover:bg-slate-100"
                    onClick={() => insertSnippet(i, '$$\n\n$$')}
                  >
                    + 公式块
                  </button>
                  <button
                    type="button"
                    className="ml-auto rounded bg-red-50 px-2 py-0.5 text-red-600 border border-red-200 hover:bg-red-100"
                    onClick={() => removeModule(i)}
                  >
                    删除模块
                  </button>
                </div>
              )}

              <input
                className="mb-3 w-full border-none bg-transparent text-lg font-semibold outline-none focus:ring-1 focus:ring-blue-400 rounded pl-2"
                style={{
                  borderLeft: '4px solid #2563eb',
                  ...moduleStyle(mod),
                  fontSize: (mod.style?.fontSize ?? 14) + 2,
                }}
                value={mod.title}
                onClick={(e) => e.stopPropagation()}
                onFocus={() => onActiveModuleIndexChange(i)}
                onChange={(e) => updateModule(i, { title: e.target.value })}
                placeholder="模块标题"
              />

              {mod.missingAnswer && (
                <span className="mb-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                  答案待补充
                </span>
              )}

              <div style={moduleStyle(mod)} onClick={(e) => e.stopPropagation()}>
                {active ? (
                  <LatexFormulaEditor
                    value={mod.content}
                    onChange={(text) => updateModule(i, { content: text })}
                    placeholder="点击编辑正文。$...$ 行内公式，$$...$$ 独立公式。Ctrl+B 包裹公式。"
                    className="text-sm !border-slate-300"
                  />
                ) : (
                  <div
                    className="min-h-[2rem] cursor-text whitespace-pre-wrap"
                    onClick={() => onActiveModuleIndexChange(i)}
                  >
                    {mod.content.trim() ? (
                      <MathRenderer text={mod.content} className="math-renderer" />
                    ) : (
                      <span className="text-slate-400 italic">点击此处编辑内容…</span>
                    )}
                  </div>
                )}
              </div>
            </section>
          )
        })}

        {/* 画布底部：添加元素 */}
        <div
          className="mt-6 border-t border-dashed border-slate-300 pt-6"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="mb-3 text-sm font-medium text-slate-600">添加内容模块</p>
          <div className="flex flex-wrap gap-2">
            {MODULE_PALETTE.map((p) => (
              <button
                key={p.type}
                type="button"
                className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm hover:bg-blue-50 hover:border-blue-400 transition"
                onClick={() => addModule(p.type)}
              >
                {p.emoji} {p.label}
              </button>
            ))}
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm hover:bg-blue-50 hover:border-blue-400 transition"
              onClick={() => addModule('custom')}
            >
              ➕ 自定义段落
            </button>
          </div>
        </div>
      </div>

      {/* 页脚 */}
      <div className="border-t border-slate-200 px-6 py-2 text-center text-xs text-slate-500">
        <input
          className="w-full border-none bg-transparent text-center outline-none focus:ring-1 focus:ring-blue-400 rounded"
          value={footer}
          onChange={(e) => onChange({ ...content, footerText: e.target.value })}
          placeholder="页脚文字"
        />
      </div>
    </div>
  )
})

export default HandoutCanvasEditor
