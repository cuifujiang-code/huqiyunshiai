#!/usr/bin/env node
/**
 * 测试数据驱动规划生成（含华祺 system prompt + 学生上下文）
 * 用法: node _scripts/test-planning-generate.mjs
 */
import dotenv from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env.local') })
dotenv.config()

const { generateDataDrivenPlan } = await import('../teacher-api/server/planningEngine.js')

const form = {
  studentName: '测试同学',
  grade: '高二',
  goalDirections: ['浙江新高考', '985冲刺'],
  scoreLevel: '良好',
  interests: ['数学', '物理'],
  parentExpectations: '希望冲击985',
  specialNotes: '选科物化生',
  createdByRole: 'student',
  studentUserId: process.env.TEST_STUDENT_USER_ID || '',
  _enhanced: {
    schoolInfo: { province: '浙江', grade: '高二' },
    electiveSubjects: ['物理', '化学', '生物'],
  },
}

const result = await generateDataDrivenPlan('浙江大学', '浙江', '通用', form)

if (!result.success) {
  console.error('生成失败:', result.message)
  process.exit(1)
}

const pr = result.report?.professionalReport
console.log('\n=== 生成成功 ===')
console.log('标题:', result.report?.title)
console.log('\n① 现状诊断:', pr?.diagnosis || '(未返回 professionalReport.diagnosis)')
console.log('\n② 推荐路径:')
;(pr?.recommendedPaths || []).forEach((p) => console.log(`  - [${p.type}] ${p.path}: ${p.reason}`))
console.log('\n③ 关键时间节点:')
;(pr?.keyTimeline || result.report?.milestones || []).slice(0, 5).forEach((t) =>
  console.log(`  - ${t.month || t.date}: ${t.event}${t.note ? ` (${t.note})` : ''}`),
)
console.log('\n④ 90天行动清单:')
;(pr?.actionList90Days || []).forEach((a, i) => console.log(`  ${i + 1}. ${a}`))
console.log('\n⑤ 风险提示:')
;(pr?.riskAlerts || result.report?.risks?.map((r) => r.risk) || []).forEach((r) => console.log(`  - ${r}`))

const checks = {
  hasDiagnosis: Boolean(pr?.diagnosis?.length),
  hasThreePaths: (pr?.recommendedPaths?.length ?? 0) >= 3,
  hasTimeline: (pr?.keyTimeline?.length ?? 0) >= 2 || (result.report?.milestones?.length ?? 0) >= 2,
  hasActions: (pr?.actionList90Days?.length ?? 0) >= 6,
  hasRisks: (pr?.riskAlerts?.length ?? 0) >= 1 || (result.report?.risks?.length ?? 0) >= 1,
  hasCitations: (result.report?.dataSourceCitations?.length ?? 0) >= 1,
}
console.log('\n=== 结构校验 ===', checks)
const allOk = Object.values(checks).every(Boolean)
process.exit(allOk ? 0 : 2)
