/** 院校层次标签 — 向导 Step 5 选择层次而非具体校名时使用 */
export const TIER_LABELS = [
  '985/顶尖院校',
  '985',
  '顶尖院校',
  'C9',
  '清北',
  '211/双一流',
  '211',
  '双一流',
  '省内重点本科',
  '省重点',
  '省内重点',
  '重点本科',
  '普通本科',
  '本科',
  '一段线',
  '暂时没想好',
  '未定',
  '待定',
  '没想好',
] as const

export function isTierLabel(str: string): boolean {
  const normalized = str.trim().toLowerCase()
  if (!normalized) return false
  return TIER_LABELS.some((label) => {
    const nl = label.toLowerCase()
    return normalized === nl || normalized.includes(nl) || nl.includes(normalized)
  })
}

/** 从城市字符串推断高考省份（默认浙江） */
export function inferProvinceFromCity(city: string, fallback = '浙江'): string {
  const c = String(city || '').trim()
  if (!c) return fallback
  const rules: [string, string][] = [
    ['浙江', '浙江'],
    ['江苏', '江苏'],
    ['上海', '上海'],
    ['北京', '北京'],
    ['广东', '广东'],
    ['山东', '山东'],
    ['四川', '四川'],
    ['湖北', '湖北'],
    ['湖南', '湖南'],
    ['河南', '河南'],
    ['安徽', '安徽'],
    ['福建', '福建'],
    ['江西', '江西'],
    ['河北', '河北'],
    ['山西', '山西'],
    ['陕西', '陕西'],
    ['辽宁', '辽宁'],
    ['吉林', '吉林'],
    ['黑龙江', '黑龙江'],
    ['云南', '云南'],
    ['贵州', '贵州'],
    ['甘肃', '甘肃'],
    ['海南', '海南'],
    ['重庆', '重庆'],
    ['天津', '天津'],
    ['广西', '广西'],
    ['内蒙古', '内蒙古'],
    ['新疆', '新疆'],
    ['宁夏', '宁夏'],
    ['青海', '青海'],
    ['西藏', '西藏'],
  ]
  for (const [key, prov] of rules) {
    if (c.includes(key)) return prov
  }
  return fallback
}

export function resolvePlanningTarget(form: {
  targetSchools?: string[]
  targetTierLevel?: string
  targetUniversity?: string
}): string {
  return (
    form.targetUniversity?.trim() ||
    form.targetSchools?.[0]?.trim() ||
    form.targetTierLevel?.trim() ||
    ''
  )
}
