/**
 * 服务端规划 prompt 扩展（与 src/lib/planningWizardUtils 逻辑对齐）
 */

const DEFAULT_HOLLAND = { R: 50, I: 50, A: 50, S: 50, E: 50, C: 50 }

const FAMILY_BUDGET_SCORES = {
  '5万以下': 40,
  '5-15万': 60,
  '15-30万': 80,
  '30万以上': 100,
}

const TARGET_TIER_SCORES = {
  '985/顶尖院校': 92,
  '211/双一流': 78,
  省内重点本科: 62,
  普通本科: 48,
  暂时没想好: 45,
}

export function formatHollandScoresLine(scores = DEFAULT_HOLLAND) {
  return ['R', 'I', 'A', 'S', 'E', 'C'].map((k) => `${k}:${scores[k] ?? 0}`).join(' ')
}

export function computeFiveDimensionFromForm(form = {}, enhanced = {}) {
  const hollandScores = form.hollandScores || enhanced.hollandScores || DEFAULT_HOLLAND
  const hollandVals = Object.values(hollandScores)
  const interestScore = hollandVals.length ? Math.max(...hollandVals.map(Number)) : 50
  const talents = form.specialTalents || enhanced.specialTalents || []
  const abilityScore = Math.min(100, 30 + talents.length * 18)
  const budget = form.familyBudget || enhanced.familyBudget || ''
  const resourceScore = FAMILY_BUDGET_SCORES[budget] ?? 50
  const tier = form.targetTierLevel || enhanced.targetTierLevel || ''
  let targetScore = TARGET_TIER_SCORES[tier] ?? 50
  const majorIntent = form.targetMajorIntent || enhanced.targetMajorIntent || ''
  if (String(majorIntent).trim()) targetScore = Math.min(100, targetScore + 8)
  const academicScore = form.competencyScore ?? enhanced.competencyScore ?? 0
  const totalScore = Math.round(
    academicScore * 0.35 +
      abilityScore * 0.2 +
      interestScore * 0.2 +
      resourceScore * 0.15 +
      targetScore * 0.1,
  )
  return {
    academicScore,
    abilityScore,
    interestScore,
    resourceScore,
    targetScore,
    totalScore: Math.min(100, Math.max(0, totalScore)),
  }
}

export function formatFiveDimensionText(analysis) {
  return [
    `- 学科成绩分：${analysis.academicScore}/100`,
    `- 综合能力分：${analysis.abilityScore}/100（根据特长标签数量估算）`,
    `- 兴趣匹配度：${analysis.interestScore}/100（霍兰德最高分/100）`,
    `- 家庭资源分：${analysis.resourceScore}/100（根据预算档位映射）`,
    `- 目标期望分：${analysis.targetScore}/100（目标越明确分越高）`,
    `- 五维总分：${analysis.totalScore}/100`,
  ].join('\n')
}

export function resolvePlanningEnrichment(form = {}, enhanced = {}, clientEnrichment = null) {
  const hollandScores = clientEnrichment?.hollandScores || form.hollandScores || enhanced.hollandScores || DEFAULT_HOLLAND
  const fiveDimension =
    clientEnrichment?.fiveDimension || computeFiveDimensionFromForm(form, enhanced)
  return {
    hollandScoresLine: clientEnrichment?.hollandScoresLine || formatHollandScoresLine(hollandScores),
    fiveDimensionText: clientEnrichment?.fiveDimensionText || formatFiveDimensionText(fiveDimension),
    fiveDimension,
  }
}

export function formatExamTrendBlock(records = []) {
  if (!records.length) return ''
  const lines = ['【最近两次考试趋势分析】']
  records.slice(0, 2).forEach((rec, idx) => {
    lines.push(`第${idx + 1}次：${rec.exam_name || '考试'}（${rec.exam_date || '—'}）`)
    const scores = rec.scores_json
    if (scores && typeof scores === 'object') {
      Object.entries(scores)
        .filter(([k]) => !k.startsWith('_') && k !== 'lossReasons')
        .forEach(([subject, row]) => {
          if (!row || typeof row !== 'object') return
          lines.push(`  ${subject}：${row.score ?? '—'}分（班均${row.avg ?? '—'}）`)
        })
    }
  })

  if (records.length >= 2) {
    const [latest, prev] = records
    const latestScores = latest.scores_json || {}
    const prevScores = prev.scores_json || {}
    const deltas = []
    Object.keys(latestScores).forEach((subject) => {
      if (subject.startsWith('_') || subject === 'lossReasons') return
      const a = Number(latestScores[subject]?.score)
      const b = Number(prevScores[subject]?.score)
      if (Number.isFinite(a) && Number.isFinite(b)) {
        const d = a - b
        deltas.push(`${subject}${d >= 0 ? '+' : ''}${d}`)
      }
    })
    if (deltas.length) lines.push(`较上次变化：${deltas.join('、')}`)
  }

  return lines.join('\n')
}

export function buildFallbackPathOptions(fiveDimTotal = 60) {
  const mainName =
    fiveDimTotal >= 85 ? '985冲刺路线' : fiveDimTotal >= 70 ? '211/双一流路线' : '省内重本路线'
  return [
    {
      name: mainName,
      matchScore: Math.min(98, fiveDimTotal + 5),
      reason: '与五维总分及目标层次最匹配的主路径',
      keyActions: ['锁定主科提分节奏', '按目标院校要求优化选科', '每月一次模考校准'],
    },
    {
      name: fiveDimTotal >= 70 ? '综合评价/强基备选' : '普通本科稳健路线',
      matchScore: Math.max(55, fiveDimTotal - 5),
      reason: '兼顾兴趣特长与录取概率的备选方案',
      keyActions: ['准备综合素质材料', '关注专项招生窗口', '保持主科不退步'],
    },
    {
      name: fiveDimTotal >= 55 ? '省内公办保底路线' : '技能提升/专科衔接路线',
      matchScore: Math.max(40, fiveDimTotal - 15),
      reason: '确保有学可上的保底路径',
      keyActions: ['夯实基础题得分率', '提前了解高职单招政策', '设定最低可接受院校'],
    },
  ]
}

export function normalizePathOptions(parsed, fiveDimTotal, form) {
  const actionPool = Array.isArray(parsed.professionalReport?.actionList90Days)
    ? parsed.professionalReport.actionList90Days.map(String)
    : []
  const defaultActions = buildFallbackPathOptions(fiveDimTotal, form).map((p) => p.keyActions)

  const withActions = (item, index) => {
    let keyActions = (Array.isArray(item.keyActions) ? item.keyActions : []).filter(Boolean).map(String)
    if (keyActions.length < 3 && actionPool.length) {
      keyActions = [...keyActions, ...actionPool].slice(0, 3)
    }
    if (keyActions.length < 3 && defaultActions[index]) {
      keyActions = [...keyActions, ...defaultActions[index]].slice(0, 3)
    }
    return {
      name: String(item.name || '升学路径').slice(0, 40),
      matchScore: Math.min(100, Math.max(0, Number(item.matchScore) || 0)),
      reason: String(item.reason || '').slice(0, 80),
      keyActions,
    }
  }

  if (Array.isArray(parsed.pathOptions) && parsed.pathOptions.length >= 3) {
    return parsed.pathOptions.slice(0, 3).map(withActions)
  }

  const fromPro = parsed.professionalReport?.recommendedPaths
  if (Array.isArray(fromPro) && fromPro.length) {
    const typeScores = { main: fiveDimTotal + 5, backup: fiveDimTotal - 5, fallback: fiveDimTotal - 15 }
    return fromPro.slice(0, 3).map((p, i) =>
      withActions(
        {
          name: p.path || p.name || `路径${i + 1}`,
          matchScore: typeScores[p.type] ?? fiveDimTotal - i * 8,
          reason: p.reason || '',
          keyActions: p.keyActions,
        },
        i,
      ),
    )
  }

  return buildFallbackPathOptions(fiveDimTotal, form)
}
