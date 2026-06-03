import type { HandoutContent, HandoutModule, HandoutModuleType } from '../../types/teacher'

export const MODULE_PALETTE: { type: HandoutModuleType; label: string; emoji: string }[] = [
  { type: 'knowledge', label: '知识点讲解', emoji: '📘' },
  { type: 'example', label: '例题', emoji: '✏️' },
  { type: 'exercise', label: '练习', emoji: '📝' },
  { type: 'summary', label: '总结', emoji: '📋' },
]

export function newHandoutId(prefix = 'mod') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export function createModule(type: HandoutModuleType, title?: string): HandoutModule {
  const meta = MODULE_PALETTE.find((p) => p.type === type)
  return {
    id: newHandoutId(),
    type,
    title: title ?? meta?.label ?? '模块',
    content: '',
    style: { fontSize: 14, color: '#111827' },
  }
}

export function createCustomHandout(title: string, teacherName?: string): HandoutContent {
  const date = new Date().toLocaleDateString('zh-CN')
  return {
    title,
    cover: { title, subtitle: '自定义讲义', teacherName: teacherName ?? '', date },
    headerText: title,
    footerText: '华祺云师 AI · 讲义',
    modules: [createModule('knowledge', '开篇导入')],
  }
}
