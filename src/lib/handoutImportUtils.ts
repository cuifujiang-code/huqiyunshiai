import type { HandoutContent, HandoutModule, HandoutModuleType } from '../types/teacher'

function newModuleId() {
  return `mod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

const TYPE_MAP: Record<string, HandoutModuleType> = {
  knowledge: 'knowledge',
  知识点: 'knowledge',
  example: 'example',
  例题: 'example',
  exercise: 'exercise',
  练习: 'exercise',
  summary: 'summary',
  总结: 'summary',
}

function mapType(raw: unknown): HandoutModuleType {
  const key = String(raw || 'custom').toLowerCase()
  return TYPE_MAP[key] ?? TYPE_MAP[String(raw)] ?? 'custom'
}

function hasValidAnswer(mod: Record<string, unknown>) {
  const ans = mod.answer ?? mod.standardAnswer ?? mod.answers
  if (Array.isArray(ans)) return ans.some((a) => String(a).trim())
  return Boolean(String(ans ?? '').trim())
}

export function parseWorkbuddyJson(
  json: Record<string, unknown>,
  defaults: { title?: string; subject?: string; teacherName?: string } = {},
): HandoutContent {
  const title = String(json.title || defaults.title || '手写解析讲义')
  const date = new Date().toLocaleDateString('zh-CN')
  const rawModules = (json.modules ?? json.sections ?? json.items ?? []) as Record<string, unknown>[]

  const modules: HandoutModule[] = rawModules.map((mod, i) => {
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
      id: String(mod.id || newModuleId()),
      type,
      title: String(mod.title ?? mod.name ?? `模块 ${i + 1}`),
      content,
      style: {
        fontSize: (mod.style as { fontSize?: number })?.fontSize ?? 14,
        color: (mod.style as { color?: string })?.color ?? '#111827',
        fontFamily: (mod.style as { fontFamily?: string })?.fontFamily ?? 'Microsoft YaHei',
      },
      missingAnswer: !hasAnswer && (type === 'example' || type === 'exercise'),
      answer: hasAnswer ? answer : undefined,
    }
  })

  if (!modules.length && json.rawText) {
    modules.push({
      id: newModuleId(),
      type: 'knowledge',
      title: '手写解析',
      content: String(json.rawText),
      style: { fontSize: 14, color: '#111827', fontFamily: 'Microsoft YaHei' },
    })
  }

  return {
    title,
    cover: {
      title,
      subtitle: String(json.subject || defaults.subject || '手写解析导入'),
      teacherName: defaults.teacherName ?? '',
      date,
    },
    headerText: title,
    footerText: '华祺云师 AI · 讲义',
    modules,
    ocrMeta: { source: String(json.source || 'workbuddy'), importedAt: new Date().toISOString() },
  }
}

export function countMissingAnswersOnClient(modules: HandoutModule[]): HandoutModule[] {
  return modules.map((m) => {
    if (m.type !== 'example' && m.type !== 'exercise') return m
    const missing =
      m.missingAnswer ??
      (!m.answer && (m.content.includes('【答案待补充】') || !/(答案|解：|答：|参考答案)/.test(m.content)))
    return { ...m, missingAnswer: Boolean(missing) }
  })
}

export function countMissingAnswers(modules: HandoutModule[]): number {
  return countMissingAnswersOnClient(modules).filter((m) => m.missingAnswer).length
}

/** 浏览器端 PDF → 各页 PNG Base64 */
export async function pdfFileToPageImages(file: File, maxPages = 15): Promise<{ name: string; base64: string }[]> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()

  const buffer = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data: buffer }).promise
  const count = Math.min(doc.numPages, maxPages)
  const images: { name: string; base64: string }[] = []

  for (let i = 1; i <= count; i++) {
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')
    if (!ctx) continue
    await page.render({ canvasContext: ctx, viewport, canvas }).promise
    const dataUrl = canvas.toDataURL('image/png')
    images.push({
      name: `${file.name.replace(/\.pdf$/i, '')}-p${i}.png`,
      base64: dataUrl.replace(/^data:image\/png;base64,/, ''),
    })
  }

  return images
}
