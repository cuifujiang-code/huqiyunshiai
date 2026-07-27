/**
 * OCR / WorkBuddy JSON → 辅导书章节结构
 */

function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

const TYPE_MAP = {
  knowledge: 'knowledge',
  知识点: 'knowledge',
  讲解: 'knowledge',
  example: 'example',
  例题: 'example',
  exercise: 'exercise',
  练习: 'exercise',
  summary: 'summary',
  总结: 'summary',
}

function mapType(raw) {
  const key = String(raw || 'knowledge').toLowerCase()
  return TYPE_MAP[key] || TYPE_MAP[raw] || 'knowledge'
}

function hasValidAnswer(mod) {
  const ans = mod.answer ?? mod.answers ?? mod.standardAnswer
  if (Array.isArray(ans)) return ans.some((a) => String(a).trim())
  return Boolean(String(ans ?? '').trim())
}

export function countBookBlocks(chapters = []) {
  return chapters.reduce(
    (n, ch) => n + (ch.sections || []).reduce((m, sec) => m + (sec.blocks || []).length, 0),
    0,
  )
}

function blockFromRaw(mod, index = 0) {
  const type = mapType(mod.type || mod.moduleType)
  const answer = mod.answer ?? mod.standardAnswer ?? ''
  const hasAnswer = mod.hasAnswer !== undefined ? Boolean(mod.hasAnswer) : hasValidAnswer(mod)
  let content = String(mod.content || mod.text || mod.body || '').trim()

  if (!hasAnswer && (type === 'example' || type === 'exercise')) {
    content += content ? '\n\n' : ''
    content += '【答案待补充】'
  } else if (hasAnswer && answer) {
    content += `\n\n参考答案：${answer}`
  }

  return {
    id: mod.id || newId('blk'),
    type,
    title: mod.title || mod.name || `内容 ${index + 1}`,
    content,
    style: {
      fontSize: mod.style?.fontSize ?? 14,
      color: mod.style?.color ?? '#111827',
      fontFamily: mod.style?.fontFamily ?? 'Microsoft YaHei',
    },
    missingAnswer: !hasAnswer && (type === 'example' || type === 'exercise'),
  }
}

function sectionFromRaw(sec, si = 0) {
  let blocks = (sec.blocks || sec.items || []).map((b, bi) => blockFromRaw(b, bi))
  const sectionContent = String(sec.content || sec.text || sec.body || '').trim()
  if (!blocks.length && sectionContent) {
    blocks = [
      blockFromRaw(
        { type: sec.type, title: sec.title || `小节 ${si + 1}`, content: sectionContent },
        0,
      ),
    ]
  }
  return {
    id: sec.id || newId('sec'),
    title: sec.title || sec.name || `第${si + 1}节`,
    blocks,
  }
}

function chapterFromRaw(ch, ci = 0) {
  let sections = (ch.sections || []).map((sec, si) => sectionFromRaw(sec, si))

  const chapterBlocks = ch.blocks || ch.items || []
  if (!sections.length && chapterBlocks.length) {
    sections = [
      {
        id: newId('sec'),
        title: ch.title || '导入内容',
        blocks: chapterBlocks.map((b, bi) => blockFromRaw(b, bi)),
      },
    ]
  }

  const chapterContent = String(ch.content || ch.text || ch.body || '').trim()
  if (!sections.length && chapterContent) {
    sections = [
      {
        id: newId('sec'),
        title: ch.title || '内容',
        blocks: [blockFromRaw({ title: ch.title || '识别内容', content: chapterContent }, 0)],
      },
    ]
  }

  return {
    id: ch.id || newId('ch'),
    title: ch.title || ch.name || `第${ci + 1}章`,
    sections,
  }
}

function chaptersFromModules(modules) {
  return [
    {
      id: newId('ch'),
      title: '第一章 导入内容',
      sections: modules.map((mod, i) => ({
        id: newId('sec'),
        title: mod.title || mod.name || `小节 ${i + 1}`,
        blocks: [blockFromRaw(mod, i)],
      })),
    },
  ]
}

function chaptersFromRawText(rawText) {
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
              style: { fontSize: 14, color: '#111827', fontFamily: 'Microsoft YaHei' },
            },
          ],
        },
      ],
    },
  ]
}

function normalizeChapters(json) {
  if (Array.isArray(json.chapters) && json.chapters.length) {
    return json.chapters.map((ch, ci) => chapterFromRaw(ch, ci))
  }

  const modules = json.modules ?? json.items ?? []
  if (Array.isArray(modules) && modules.length) {
    return chaptersFromModules(modules)
  }

  // 讲义式 flat sections（无 chapters 包裹）
  const flatSections = json.sections
  if (Array.isArray(flatSections) && flatSections.length && !json.chapters) {
    return [
      {
        id: newId('ch'),
        title: json.title || '第一章 导入内容',
        sections: flatSections.map((sec, si) => sectionFromRaw(sec, si)),
      },
    ]
  }

  const rawText = String(json.rawText || json.ocrText || '').trim()
  if (rawText) return chaptersFromRawText(rawText)

  return [{ id: newId('ch'), title: '第一章', sections: [] }]
}

/** OCR / WorkBuddy JSON → 辅导书编辑器格式 */
export function ocrJsonToBookContent(json, defaults = {}) {
  const title = json.title || defaults.title || 'OCR 导入辅导书'
  let chapters = normalizeChapters(json)

  if (countBookBlocks(chapters) === 0) {
    const rawText = String(json.rawText || json.ocrText || defaults.ocrText || '').trim()
    if (rawText) chapters = chaptersFromRawText(rawText)
  }

  return {
    title,
    grade: json.grade || defaults.grade || '',
    level: json.level || defaults.level || '基础',
    foreword: String(json.foreword || defaults.foreword || '').trim(),
    epilogue: String(json.epilogue || defaults.epilogue || '').trim(),
    chapters,
    ocrMeta: {
      source: json.source || defaults.source || 'doubao-vision',
      importedAt: new Date().toISOString(),
    },
  }
}
