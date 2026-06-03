import { useState } from 'react'
import type { HandoutContent, HandoutModule } from '../../types/teacher'
import { btnSecondary, inputClass } from '../../types/teacher'
import { MODULE_PALETTE, createModule } from './handoutConstants'

interface Props {
  content: HandoutContent
  onChange: (next: HandoutContent) => void
}

export default function HandoutEditorPanel({ content, onChange }: Props) {
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  const updateModule = (i: number, patch: Partial<HandoutModule>) => {
    const modules = [...content.modules]
    modules[i] = { ...modules[i], ...patch }
    onChange({ ...content, modules })
  }

  const updateStyle = (i: number, patch: { fontSize?: number; color?: string }) => {
    const mod = content.modules[i]
    updateModule(i, { style: { ...mod.style, ...patch } })
  }

  const reorder = (from: number, to: number) => {
    if (from === to || to < 0 || to >= content.modules.length) return
    const modules = [...content.modules]
    const [item] = modules.splice(from, 1)
    modules.splice(to, 0, item)
    onChange({ ...content, modules })
  }

  const removeModule = (i: number) => {
    onChange({ ...content, modules: content.modules.filter((_, j) => j !== i) })
  }

  const cover = content.cover ?? { title: content.title }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
        <h3 className="mb-3 text-sm font-semibold text-violet-200">讲义封面</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className={`${inputClass} text-sm py-2`}
            placeholder="主标题"
            value={cover.title}
            onChange={(e) =>
              onChange({
                ...content,
                title: e.target.value,
                cover: { ...cover, title: e.target.value },
              })
            }
          />
          <input
            className={`${inputClass} text-sm py-2`}
            placeholder="副标题"
            value={cover.subtitle ?? ''}
            onChange={(e) => onChange({ ...content, cover: { ...cover, subtitle: e.target.value } })}
          />
          <input
            className={`${inputClass} text-sm py-2`}
            placeholder="教师姓名"
            value={cover.teacherName ?? ''}
            onChange={(e) => onChange({ ...content, cover: { ...cover, teacherName: e.target.value } })}
          />
          <input
            className={`${inputClass} text-sm py-2`}
            placeholder="日期"
            value={cover.date ?? ''}
            onChange={(e) => onChange({ ...content, cover: { ...cover, date: e.target.value } })}
          />
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <input
          className={`${inputClass} text-sm py-2`}
          placeholder="页眉文字"
          value={content.headerText ?? ''}
          onChange={(e) => onChange({ ...content, headerText: e.target.value })}
        />
        <input
          className={`${inputClass} text-sm py-2`}
          placeholder="页脚文字"
          value={content.footerText ?? ''}
          onChange={(e) => onChange({ ...content, footerText: e.target.value })}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {MODULE_PALETTE.map((p) => (
          <button
            key={p.type}
            type="button"
            className={btnSecondary}
            onClick={() => onChange({ ...content, modules: [...content.modules, createModule(p.type)] })}
          >
            {p.emoji} + {p.label}
          </button>
        ))}
      </div>

      {content.modules.map((mod, i) => (
        <div
          key={mod.id || i}
          draggable
          onDragStart={() => setDragIdx(i)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (dragIdx != null) reorder(dragIdx, i)
            setDragIdx(null)
          }}
          onDragEnd={() => setDragIdx(null)}
          className={`rounded-xl border p-3 transition ${
            dragIdx === i ? 'border-cyan-400 bg-cyan-500/10' : 'border-slate-700 bg-slate-800/40'
          }`}
        >
          <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
            <span className="cursor-grab">⋮⋮ 拖拽排序</span>
            <button type="button" className="ml-auto text-red-400" onClick={() => removeModule(i)}>
              删除
            </button>
          </div>
          <input
            className={`${inputClass} mb-2 font-semibold text-sm py-2`}
            value={mod.title}
            onChange={(e) => updateModule(i, { title: e.target.value })}
          />
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1 text-xs text-slate-400">
              字号
              <input
                type="number"
                min={12}
                max={24}
                className="w-14 rounded border border-slate-600 bg-slate-900 px-1 py-0.5 text-white"
                value={mod.style?.fontSize ?? 14}
                onChange={(e) => updateStyle(i, { fontSize: Number(e.target.value) || 14 })}
              />
            </label>
            <label className="flex items-center gap-1 text-xs text-slate-400">
              颜色
              <input
                type="color"
                className="h-7 w-10 cursor-pointer rounded border-0"
                value={mod.style?.color ?? '#111827'}
                onChange={(e) => updateStyle(i, { color: e.target.value })}
              />
            </label>
          </div>
          <textarea
            className={inputClass}
            rows={4}
            value={mod.content}
            onChange={(e) => updateModule(i, { content: e.target.value })}
          />
        </div>
      ))}

      {content.modules.length === 0 && (
        <p className="text-center text-sm text-slate-500">点击上方按钮添加模块，或拖拽调整顺序</p>
      )}
    </div>
  )
}
