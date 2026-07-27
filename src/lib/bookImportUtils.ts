import type { BookChapter } from '../types/teacher'

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

const TYPE_MAP: Record<string, BookChapter['sections'][0]['blocks'][0]['type']> = {
  knowledge: 'knowledge',
  知识点: 'knowledge',
  example: 'example',
  例题: 'example',
  exercise: 'exercise',
  练习: 'exercise',
  summary: 'summary',
  总结: 'summary',
}

function mapType(raw: unknown) {
  const key = String(raw || 'knowledge').toLowerCase()
  return TYPE_MAP[key] ?? TYPE_MAP[String(raw)] ?? 'knowledge'
}

function hasValidAnswer(mod: Record<string, unknown>) {
  const ans = mod.answer ?? mod.standardAnswer ?? mod.answers
  if (Array.isArray(ans)) return ans.some((a) => String(a).trim())
  return Boolean(String(ans ?? '').trim())
}

export function countBookBlocks(chapters: BookChapter[] = []) {
  return chapters.reduce(
    (n, ch) => n + ch.sections.reduce((m, sec) => m + sec.blocks.length, 0),
    0,
  )
}

function blockFromRaw(mod: Record<string, unknown>, index = 0) {
  const type = mapType(mod.type ?? mod.moduleType)
  const answer = String(mod.answer ?? mod.standardAnswer ?? '')
  const hasAnswer = mod.hasAnswer !== undefined ? Boolean(mod.hasAnswer) : hasValidAnswer(mod)
  let content = String(mod.content ?? mod.text ?? mod.body ?? '').trim()

  if (!hasAnswer && (type === 'example' || type === 'exercise')) {
    content += `${content ? '\n\n' : ''}【答案待补充】`
  } else if (hasAnswer && answer) {
    content += `\n\n参考答案：${answer}`
  }

  return {
    id: String(mod.id || newId('blk')),
    type,
    title: String(mod.title ?? mod.name ?? `内容 ${index + 1}`),
    content,
    style: {
      fontSize: (mod.style as { fontSize?: number })?.fontSize ?? 14,
      color: (mod.style as { color?: string })?.color ?? '#111827',
      fontFamily: (mod.style as { fontFamily?: string })?.fontFamily ?? 'Microsoft YaHei',
    },
    missingAnswer: !hasAnswer && (type === 'example' || type === 'exercise'),
  }
}

function sectionFromRaw(sec: Record<string, unknown>, si = 0) {
  let blocks = (
    (sec.blocks as Record<string, unknown>[]) ||
    (sec.items as Record<string, unknown>[]) ||
    []
  ).map((b, bi) => blockFromRaw(b, bi))
  const sectionContent = String(sec.content ?? sec.text ?? sec.body ?? '').trim()
  if (!blocks.length && sectionContent) {
    blocks = [
      blockFromRaw(
        { type: sec.type, title: sec.title || `小节 ${si + 1}`, content: sectionContent },
        0,
      ),
    ]
  }
  return {
    id: String(sec.id || newId('sec')),
    title: String(sec.title ?? sec.name ?? `第${si + 1}节`),
    blocks,
  }
}

function chapterFromRaw(ch: Record<string, unknown>, ci = 0) {
  let sections = ((ch.sections as Record<string, unknown>[]) || []).map((sec, si) => sectionFromRaw(sec, si))
  const chapterBlocks = (ch.blocks as Record<string, unknown>[]) || (ch.items as Record<string, unknown>[]) || []
  if (!sections.length && chapterBlocks.length) {
    sections = [
      {
        id: newId('sec'),
        title: String(ch.title || '导入内容'),
        blocks: chapterBlocks.map((b, bi) => blockFromRaw(b, bi)),
      },
    ]
  }
  const chapterContent = String(ch.content ?? ch.text ?? ch.body ?? '').trim()
  if (!sections.length && chapterContent) {
    sections = [
      {
        id: newId('sec'),
        title: String(ch.title || '内容'),
        blocks: [blockFromRaw({ title: ch.title || '识别内容', content: chapterContent }, 0)],
      },
    ]
  }
  return {
    id: String(ch.id || newId('ch')),
    title: String(ch.title ?? ch.name ?? `第${ci + 1}章`),
    sections,
  }
}

function chaptersFromModules(modules: Record<string, unknown>[]) {
  return [
    {
      id: newId('ch'),
      title: '第一章 导入内容',
      sections: modules.map((mod, i) => ({
        id: newId('sec'),
        title: String(mod.title ?? mod.name ?? `小节 ${i + 1}`),
        blocks: [blockFromRaw(mod, i)],
      })),
    },
  ]
}

function chaptersFromRawText(rawText: string): BookChapter[] {
  return [
    {
      id: newId('ch'),
      title: '第一章 导入内容',
      sections: [
        {
          id: newId('sec'),
          title: 'OCR 识别',
          blocks: [
            {
              id: newId('blk'),
              type: 'knowledge',
              title: '识别原文',
              content: rawText,
            },
          ],
        },
      ],
    },
  ]
}

function normalizeChapters(json: Record<string, unknown>): BookChapter[] {
  if (Array.isArray(json.chapters) && json.chapters.length) {
    return (json.chapters as Record<string, unknown>[]).map((ch, ci) => chapterFromRaw(ch, ci))
  }
  const modules = (json.modules ?? json.items ?? []) as Record<string, unknown>[]
  if (modules.length) return chaptersFromModules(modules)
  const flatSections = json.sections
  if (Array.isArray(flatSections) && flatSections.length) {
    return [
      {
        id: newId('ch'),
        title: String(json.title || '第一章 导入内容'),
        sections: (flatSections as Record<string, unknown>[]).map((sec, si) => sectionFromRaw(sec, si)),
      },
    ]
  }
  const rawText = String(json.rawText ?? json.ocrText ?? '').trim()
  if (rawText) return chaptersFromRawText(rawText)
  return [{ id: newId('ch'), title: '第一章', sections: [] }]
}

/** 客户端解析 OCR / WorkBuddy JSON → 辅导书章节 */
export function parseBookOcrJson(
  json: Record<string, unknown>,
  defaults: { title?: string; grade?: string; level?: string; ocrText?: string } = {},
) {
  let chapters = normalizeChapters(json)
  if (countBookBlocks(chapters) === 0) {
    const rawText = String(json.rawText ?? json.ocrText ?? defaults.ocrText ?? '').trim()
    if (rawText) chapters = chaptersFromRawText(rawText)
  }
  return {
    title: String(json.title || defaults.title || 'OCR 导入辅导书'),
    grade: String(json.grade || defaults.grade || ''),
    level: String(json.level || defaults.level || '基础'),
    foreword: String(json.foreword || ''),
    epilogue: String(json.epilogue || ''),
    chapters,
  }
}

async function fileToBase64Image(file: File): Promise<{ name: string; base64: string }> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return { name: file.name, base64: btoa(binary) }
}

export async function imageFilesToPageImages(files: File[]): Promise<{ name: string; base64: string }[]> {
  const images: { name: string; base64: string }[] = []
  for (const file of files) {
    images.push(await fileToBase64Image(file))
  }
  return images
}

export { pdfFileToPageImages } from './handoutImportUtils'
