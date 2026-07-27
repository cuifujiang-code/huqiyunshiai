/**
 * 从 planning-templates.json 的 tier_estimates 推断省份（服务端与前端共用逻辑）
 */
export function inferProvinceFromCity(city, fallback = '浙江') {
  const c = String(city || '').trim()
  if (!c) return fallback
  const rules = [
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

export function resolvePlanningTargetFromBody(body = {}, enhanced = {}) {
  return (
    body.targetUniversity?.trim() ||
    body.targetTierLevel?.trim() ||
    enhanced.targetTierLevel?.trim() ||
    enhanced.targetSchools?.[0]?.trim() ||
    body.targetSchools?.[0]?.trim() ||
    ''
  )
}

export function resolvePlanningProvince(body = {}, enhanced = {}) {
  return (
    enhanced.schoolInfo?.province?.trim() ||
    body.province?.trim() ||
    inferProvinceFromCity(body.city || enhanced.city || enhanced.schoolInfo?.city || '')
  )
}
