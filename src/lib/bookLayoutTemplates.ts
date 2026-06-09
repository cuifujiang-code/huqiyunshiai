import type { BookLayoutSettings, BookLayoutTemplateId } from '../types/teacher'

export interface BookLayoutTemplate {
  id: BookLayoutTemplateId
  name: string
  desc: string
  settings: BookLayoutSettings
  /** 附加 CSS class */
  bodyClass: string
}

export const BOOK_LAYOUT_TEMPLATES: BookLayoutTemplate[] = [
  {
    id: 'classic',
    name: '经典单栏',
    desc: '传统教辅排版，章节标题 + 正文',
    settings: {
      fontFamily: 'Microsoft YaHei, SimSun, serif',
      fontSize: 14,
      lineHeight: 1.65,
      marginMm: 20,
      headingColor: '#1e40af',
      bodyColor: '#111827',
    },
    bodyClass: 'layout-classic',
  },
  {
    id: 'cornell',
    name: '康奈尔笔记式',
    desc: '左侧线索区 + 右侧笔记区 + 底部总结',
    settings: {
      fontFamily: 'Microsoft YaHei, SimSun, serif',
      fontSize: 13,
      lineHeight: 1.55,
      marginMm: 18,
      columnGapMm: 8,
      headingColor: '#0f766e',
      bodyColor: '#134e4a',
    },
    bodyClass: 'layout-cornell',
  },
  {
    id: 'two-column',
    name: '左右分栏式',
    desc: '双栏正文，适合习题密集章节',
    settings: {
      fontFamily: 'SimSun, Microsoft YaHei, serif',
      fontSize: 12,
      lineHeight: 1.5,
      marginMm: 16,
      columnGapMm: 12,
      headingColor: '#7c3aed',
      bodyColor: '#1f2937',
    },
    bodyClass: 'layout-two-column',
  },
  {
    id: 'knowledge-example',
    name: '知识点+例题式',
    desc: '知识框 + 例题框交替，层次清晰',
    settings: {
      fontFamily: 'Microsoft YaHei, SimSun, serif',
      fontSize: 14,
      lineHeight: 1.7,
      marginMm: 20,
      headingColor: '#b45309',
      bodyColor: '#292524',
    },
    bodyClass: 'layout-knowledge-example',
  },
  {
    id: 'workbook',
    name: '练习册式',
    desc: '大题号 + 留白区，适合课堂练习',
    settings: {
      fontFamily: 'SimHei, Microsoft YaHei, sans-serif',
      fontSize: 13,
      lineHeight: 1.8,
      marginMm: 22,
      headingColor: '#0369a1',
      bodyColor: '#0c4a6e',
    },
    bodyClass: 'layout-workbook',
  },
]

export function getLayoutTemplate(id: BookLayoutTemplateId) {
  return BOOK_LAYOUT_TEMPLATES.find((t) => t.id === id) ?? BOOK_LAYOUT_TEMPLATES[0]
}

/** 一键统一全书排版 */
export function applyBookLayoutSettings(
  templateId: BookLayoutTemplateId,
  overrides?: Partial<BookLayoutSettings>,
): BookLayoutSettings {
  const tpl = getLayoutTemplate(templateId)
  return { ...tpl.settings, ...overrides }
}
