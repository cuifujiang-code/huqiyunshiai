/**
 * WorkBuddy 手写解析 JSON → HandoutContent
 */

function newModuleId() {
  return `mod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
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
  const key = String(raw || 'custom').toLowerCase()
  return TYPE_MAP[key] || TYPE_MAP[raw] || 'custom'
}

function hasValidAnswer(mod) {
  const ans = mod.answer ?? mod.answers ?? mod.standardAnswer
  if (Array.isArray(ans)) return ans.some((a) => String(a).trim())
  return Boolean(String(ans ?? '').trim())
}

/** WorkBuddy / OCR 结构化 JSON → 讲义编辑器格式 */
export function workbuddyJsonToHandoutContent(json, defaults = {}) {
  const title = json.title || defaults.title || '手写解析讲义'
  const date = new Date().toLocaleDateString('zh-CN')

  const rawModules = json.modules ?? json.sections ?? json.items ?? []
  const modules = rawModules.map((mod, i) => {
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
      id: mod.id || newModuleId(),
      type,
      title: mod.title || mod.name || `模块 ${i + 1}`,
      content,
      style: {
        fontSize: mod.style?.fontSize ?? 14,
        color: mod.style?.color ?? '#111827',
        fontFamily: mod.style?.fontFamily ?? 'Microsoft YaHei',
      },
      missingAnswer: !hasAnswer && (type === 'example' || type === 'exercise'),
      answer: hasAnswer ? String(answer) : undefined,
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
      subtitle: json.subject || defaults.subject || '手写解析导入',
      teacherName: defaults.teacherName || '',
      date,
    },
    headerText: title,
    footerText: '华祺云师 AI · 讲义',
    modules,
    ocrMeta: {
      source: json.source || 'workbuddy',
      importedAt: new Date().toISOString(),
    },
  }
}

/** 检测题目是否缺答案 */
export function detectMissingAnswers(modules) {
  return modules.map((m) => {
    if (m.type !== 'example' && m.type !== 'exercise') return m
    const missing =
      m.missingAnswer ??
      (!m.answer && (m.content.includes('【答案待补充】') || !/(答案|解：|答：)/.test(m.content)))
    return { ...m, missingAnswer: Boolean(missing) }
  })
}

export { newModuleId }
