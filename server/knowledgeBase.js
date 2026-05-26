import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RULES_PATH = join(__dirname, '..', 'knowledge-base', 'education-planning', 'planning-rules.json')

let cachedRules = null

export function loadPlanningKnowledgeBase() {
  if (cachedRules) return cachedRules
  const raw = readFileSync(RULES_PATH, 'utf-8')
  cachedRules = JSON.parse(raw)
  return cachedRules
}

export function buildKnowledgeSystemPrompt() {
  const kb = loadPlanningKnowledgeBase()
  return `你是华祺云师AI的专业教育规划顾问。请严格依据以下教育规划知识库为学生制定个性化、可执行的教育规划方案。

【知识库内容】
${JSON.stringify(kb, null, 0)}

【规划逻辑链条】
学生画像（年级+成绩+兴趣+目标）→ 定位当前阶段 → 匹配培养路径 → 拆解阶段性任务 → 生成可执行计划。

【输出原则】
1. 规划必须具体、可执行，避免空泛口号
2. 时间轴与任务需与年级、目标方向匹配
3. 学科优先级用1-5星表示（5星最高）
4. 风险分析需基于学生实际输入，给出可操作的备选方案
5. 只返回 JSON，不要 markdown 代码块`
}
