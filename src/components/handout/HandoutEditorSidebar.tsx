import type { HandoutContent } from '../../types/teacher'
import { btnSecondary, inputClass } from '../../types/teacher'
import { MODULE_PALETTE, createModule } from './handoutConstants'

interface Props {
  content: HandoutContent
  onChange: (next: HandoutContent) => void
  exportMode: 'print' | 'digital'
  onExportModeChange: (mode: 'print' | 'digital') => void
  activeModuleIndex: number | null
  onSelectModule: (index: number | null) => void
  onImportOcr?: () => void
  onGenerateSummary?: (knowledgePoint: string) => void
  summaryLoading?: boolean
  knowledgePoint?: string
  onKnowledgePointChange?: (v: string) => void
  onSave?: () => void
  onExportWord?: () => void
  onExportPdf?: () => void
}

export default function HandoutEditorSidebar({
  content,
  onChange,
  exportMode,
  onExportModeChange,
  activeModuleIndex,
  onSelectModule,
  onImportOcr,
  onGenerateSummary,
  summaryLoading,
  knowledgePoint = '',
  onKnowledgePointChange,
  onSave,
  onExportWord,
  onExportPdf,
}: Props) {
  const missingCount = content.modules.filter((m) => m.missingAnswer).length

  const reorder = (from: number, to: number) => {
    if (from === to || to < 0 || to >= content.modules.length) return
    const modules = [...content.modules]
    const [item] = modules.splice(from, 1)
    modules.splice(to, 0, item)
    onChange({ ...content, modules })
    onSelectModule(to)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="text-[#8A94A9] self-center">导出模式</span>
        <button
          type="button"
          className={`rounded px-3 py-1 ${exportMode === 'print' ? 'bg-[#2584FF] text-white' : 'bg-slate-700 text-slate-300'}`}
          onClick={() => onExportModeChange('print')}
        >
          可打印版
        </button>
        <button
          type="button"
          className={`rounded px-3 py-1 ${exportMode === 'digital' ? 'bg-[#2584FF] text-white' : 'bg-slate-700 text-slate-300'}`}
          onClick={() => onExportModeChange('digital')}
        >
          电子阅读版
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {onImportOcr && (
          <button type="button" className={btnSecondary} onClick={onImportOcr}>
            📥 OCR 导入
          </button>
        )}
        {onGenerateSummary && (
          <button
            type="button"
            className={btnSecondary}
            disabled={summaryLoading}
            onClick={() => onGenerateSummary(knowledgePoint)}
          >
            {summaryLoading ? '生成中…' : '🤖 知识点总结'}
          </button>
        )}
      </div>

      {onGenerateSummary && (
        <input
          className={`${inputClass} text-sm py-2`}
          placeholder="知识点名称"
          value={knowledgePoint}
          onChange={(e) => onKnowledgePointChange?.(e.target.value)}
        />
      )}

      {missingCount > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          ⚠ {missingCount} 处答案待补充
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-medium text-[#8A94A9]">添加模块（也可在右侧画布底部添加）</p>
        <div className="flex flex-wrap gap-1.5">
          {MODULE_PALETTE.map((p) => (
            <button
              key={p.type}
              type="button"
              className={`${btnSecondary} !px-2 !py-1 text-xs`}
              onClick={() => {
                const modules = [...content.modules, createModule(p.type)]
                onChange({ ...content, modules })
                onSelectModule(modules.length - 1)
              }}
            >
              {p.emoji} {p.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-[#8A94A9]">章节导航（点击定位）</p>
        <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
          {content.modules.map((m, i) => (
            <li key={m.id || i}>
              <button
                type="button"
                className={`w-full rounded px-2 py-1.5 text-left transition ${
                  activeModuleIndex === i
                    ? 'bg-[#2584FF]/20 text-blue-200'
                    : 'text-[#8A94A9] hover:bg-slate-800'
                }`}
                onClick={() => onSelectModule(i)}
              >
                {i + 1}. {m.title || '未命名模块'}
              </button>
            </li>
          ))}
          {content.modules.length === 0 && (
            <li className="text-xs text-slate-500">暂无模块，请在右侧添加</li>
          )}
        </ul>
      </div>

      {activeModuleIndex != null && content.modules[activeModuleIndex] && (
        <div className="flex gap-1 text-xs">
          <button
            type="button"
            className={btnSecondary}
            disabled={activeModuleIndex <= 0}
            onClick={() => reorder(activeModuleIndex, activeModuleIndex - 1)}
          >
            ↑ 上移
          </button>
          <button
            type="button"
            className={btnSecondary}
            disabled={activeModuleIndex >= content.modules.length - 1}
            onClick={() => reorder(activeModuleIndex, activeModuleIndex + 1)}
          >
            ↓ 下移
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-slate-700 pt-4">
        {onSave && (
          <button type="button" className="btn-brand flex-1 min-w-[90px]" onClick={onSave}>
            保存
          </button>
        )}
        {onExportWord && (
          <button type="button" className="btn-secondary flex-1 min-w-[90px]" onClick={onExportWord}>
            Word
          </button>
        )}
        {onExportPdf && (
          <button type="button" className="btn-secondary flex-1 min-w-[90px]" onClick={() => void onExportPdf()}>
            PDF
          </button>
        )}
      </div>
      <p className="text-xs text-[#8A94A9]">在右侧讲义页面上直接点击模块编辑</p>
    </div>
  )
}
