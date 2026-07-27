/**
 * 教辅书智能生成引擎 — 最强版
 * 功能：
 *  1. 保留原稿核心思想与全部题目
 *  2. 智能分类与位置调整（含调整原因说明）
 *  3. 从题库自动增补合适题目
 *  4. 双版本排版输出（学生版/教师版）
 *  5. 支持 DOCX 直接导入
 *  6. 修复 OCR `false` 公式占位符
 */
import { callDeepSeekAI } from '../deepseekClient.js'
import { callDoubaoAI, isDoubaoConfigured } from '../doubaoClient.js'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin.js'
import { repairJSON } from '../batch/jsonRepairEngine.js'

const AI_TIMEOUT = 300000 // 5分钟

/**
 * 调用AI（DeepSeek优先，豆包兜底）
 */
async function callAi(systemPrompt, userPrompt, opts = {}) {
  const label = opts.label || 'BookSmartGen'
  if (isDoubaoConfigured()) {
    return callDoubaoAI(systemPrompt, userPrompt, {
      label,
      timeoutMs: opts.timeoutMs || AI_TIMEOUT,
    })
  }
  return callDeepSeekAI(systemPrompt, userPrompt, {
    timeoutMs: opts.timeoutMs || AI_TIMEOUT,
  })
}

/**
 * 解析AI返回的JSON（容错）
 */
function parseAiJson(raw) {
  try {
    return JSON.parse(raw)
  } catch {
    try {
      const repaired = repairJSON(raw)
      return JSON.parse(repaired)
    } catch {
      const m = raw.match(/\{[\s\S]*\}/)
      if (m) return JSON.parse(m[0])
      throw new Error('AI 返回格式无法解析')
    }
  }
}

// ─────────────────────────────────────────────
// 第一阶段：原稿解析与核心思想提取
// ─────────────────────────────────────────────

const EXTRACT_CORE_IDEA_SYSTEM = `你是 K12 教辅书内容分析专家。
请从教师提供的原稿中提取以下信息，并以严格 JSON 格式输出（不要 markdown 代码块）：

输出格式：
{
  "coreIdea": "原稿核心教学思想（200字内）",
  "learningObjectives": ["知识点目标1", "知识点目标2", ...],
  "targetAudience": "适用学生群体描述",
  "difficultyDistribution": { "基础": 占比, "中等": 占比, "拔高": 占比 },
  "chapterStructure": [
    {
      "originalTitle": "原稿章节标题",
      "suggestedTitle": "建议优化后的标题",
      "coreKnowledge": ["核心知识点1", "核心知识点2"],
      "questionCount": 原题数量,
      "questionTypes": ["选择题", "填空题", ...]
    }
  ],
  "originalQuestions": [
    {
      "id": "原题序号",
      "type": "题型",
      "content": "题目内容（保留完整原文）",
      "hasAnswer": true/false,
      "hasAnalysis": true/false,
      "difficulty": "基础|中等|拔高|压轴",
      "knowledgePoint": "关联知识点",
      "pageRef": "原稿页码（如有）"
    }
  ]
}`

function buildExtractCorePrompt(title, subject, grade, rawChapters) {
  const chaptersSummary = rawChapters.map((ch, ci) => ({
    chapterIndex: ci,
    title: ch.title,
    sectionCount: ch.sections?.length || 0,
    blockCount: (ch.sections || []).reduce((n, s) => n + (s.blocks?.length || 0), 0),
    blocksPreview: (ch.sections || []).slice(0, 2).flatMap(s =>
      (s.blocks || []).slice(0, 3).map(b => ({
        type: b.type,
        title: b.title,
        contentPreview: (b.content || '').slice(0, 100),
      }))
    ),
  }))
  return `教辅书信息：
书名：${title}
学科：${subject}
年级：${grade}

原稿结构：
${JSON.stringify(chaptersSummary, null, 2)}

请分析原稿，提取核心思想、学习目标、适用对象、难度分布，并对每一章给出结构分析。
同时，从第1章前3个block中识别并列出所有原有题目（originalQuestions）。

注意：
- 必须保留原稿 ALL 题目，不得删除或合并
- 题目内容请尽量从 preview 中完整提取
- 如果 preview 不完整，标注 "contentTruncated: true"，后续会补充`
}

/**
 * 提取原稿核心思想与题目清单
 */
export async function extractCoreIdea({ title, subject, grade, chapters }) {
  const prompt = buildExtractCorePrompt(title, subject, grade, chapters)
  const raw = await callAi(EXTRACT_CORE_IDEA_SYSTEM, prompt, { label: 'Book-ExtractCore' })
  return parseAiJson(raw)
}

// ─────────────────────────────────────────────
// 第二阶段：智能分类与位置调整建议
// ─────────────────────────────────────────────

const SMART_REORGANIZE_SYSTEM = `你是 K12 教辅书内容架构专家。
基于原稿核心思想，对题目和知识点进行最优位置调整。

调整原则（必须遵守）：
1. 螺旋上升：基础知识 → 典型例题 → 变式练习 → 综合应用
2. 认知负荷：每小节知识点不超过 3 个，题目不超过 8 道
3. 难度梯度：每章内部难度逐步递增，章末设置"挑战题"
4. 知识聚类：相同知识点的题目集中排列，异质题型穿插讲解

输出格式：
{
  "reorganizationPlan": [
    {
      "chapterIndex": 原章节索引,
      "originalTitle": "原标题",
      "newTitle": "优化后标题",
      "reason": "调整原因的详细说明（引用教学设计理论）",
      "sections": [
        {
          "sectionIndex": 原小节索引,
          "originalTitle": "原小节标题",
          "newTitle": "优化后小节标题",
          "blockArrangement": [
            {
              "blockId": "块ID",
              "originalType": "原类型(knowledge/example/exercise/summary)",
              "suggestedType": "建议类型（可不变）",
              "position": "在该 section 中的新位置（0-based）",
              "reason": "调整原因（如：将例题移至知识点讲解后，符合认知规律）"
            }
          ]
        }
      ]
    }
  ],
  "newSectionsSuggested": [
    {
      "chapterIndex": 插入到哪章,
      "afterSectionIndex": 插入到哪节之后,
      "suggestedTitle": "建议新增的小节标题",
      "rationale": "新增原因（如：原稿缺少知识总结环节）"
    }
  ],
  "pedagogicalNotes": [
    "教学建议1（如：建议在十字相乘法后增加配方法中考真题示例）",
    "教学建议2"
  ]
}`

function buildReorganizePrompt(coreIdea, chapters) {
  const fullStructure = chapters.map((ch, ci) => ({
    chapterIndex: ci,
    title: ch.title,
    sections: (ch.sections || []).map((s, si) => ({
      sectionIndex: si,
      title: s.title,
      blocks: (s.blocks || []).map(b => ({
        id: b.id,
        type: b.type,
        title: b.title,
        hasContent: !!b.content?.trim(),
      })),
    })),
  }))
  return `原稿核心思想分析：\n${JSON.stringify(coreIdea, null, 2)}\n\n原稿完整结构：\n${JSON.stringify(fullStructure, null, 2)}\n\n请基于核心思想和教学规律，给出最优的内容重组方案。`
}

/**
 * 生成智能重组方案
 */
export async function generateReorganizationPlan({ coreIdea, chapters }) {
  const prompt = buildReorganizePrompt(coreIdea, chapters)
  const raw = await callAi(SMART_REORGANIZE_SYSTEM, prompt, { label: 'Book-Reorganize' })
  return parseAiJson(raw)
}

// ─────────────────────────────────────────────
// 第三阶段：题库智能增补
// ─────────────────────────────────────────────

const AUGMENT_QUESTION_SYSTEM = `你是 K12 教辅书题目增补专家。
基于原稿知识点覆盖情况，从题库中筛选最合适的增补题目。

增补原则：
1. 填补空白：原稿未覆盖的重要知识点 → 增补基础题
2. 强化薄弱：原稿某知识点题目偏难 → 增补过渡题
3. 丰富题型：原稿只有选择题 → 增补解答题/应用题
4. 梯度完整：原稿缺少压轴题 → 增补拔高/压轴题
5. 数量控制：每小节题目总数不超过 12 道（原稿 + 增补）

输出格式：
{
  "augmentationPlan": [
    {
      "chapterIndex": 章节索引,
      "sectionIndex": 小节索引,
      "position": "插入位置（after:blockId 或 at:index）",
      "reason": "增补原因",
      "requiredTags": ["knowledge_point标签", "difficulty", "question_type"],
      "count": 需要增补的题目数量（1-3）
    }
  ],
  "coverageReport": {
    "coveredKnowledgePoints": ["已覆盖知识点"],
    "missingKnowledgePoints": ["缺失但重要的知识点"],
    "suggestedAdditions": ["建议增补的知识点描述"]
  }
}`

function buildAugmentPrompt(coreIdea, reorganizationPlan, subject, grade, questionBankStats) {
  return `原稿核心思想：${JSON.stringify(coreIdea, null, 2)}

重组方案：${JSON.stringify(reorganizationPlan, null, 2)}

学科：${subject}
年级：${grade}

题库统计信息：${JSON.stringify(questionBankStats, null, 2)}

请分析知识点覆盖情况，给出题目增补方案。
注意：
- 必须说明每处增补的具体原因（结合教学需要）
- 增补题目必须通过 requiredTags 精确定位
- 不要重复原稿已有题目类型`
}

/**
 * 查询题库统计（用于增补决策）
 */
async function fetchQuestionBankStats(subject, grade, knowledgePoints) {
  try {
    const admin = getSupabaseAdmin()
    // 查询题库中符合学科/年级的题目统计
    const { data, error } = await admin
      .from('teacher_question_bank')
      .select('knowledge_point, difficulty, question_type, id')
      .eq('subject', subject)
      .eq('grade', grade)
      .limit(2000)

    if (error) return { error: error.message }

    const stats = {
      total: data?.length || 0,
      byKnowledge: {},
      byDifficulty: {},
      byType: {},
    }

    for (const row of data || []) {
      const kp = row.knowledge_point || '未分类'
      const d = row.difficulty || '未知'
      const t = row.question_type || '未知'
      stats.byKnowledge[kp] = (stats.byKnowledge[kp] || 0) + 1
      stats.byDifficulty[d] = (stats.byDifficulty[d] || 0) + 1
      stats.byType[t] = (stats.byType[t] || 0) + 1
    }

    return stats
  } catch (e) {
    return { error: e.message }
  }
}

/**
 * 生成题目增补方案 + 执行增补
 */
export async function augmentWithQuestionBank({
  coreIdea,
  reorganizationPlan,
  chapters,
  subject,
  grade,
  teacherId,
}) {
  // 1. 获取题库统计
  const allKnowledgePoints = [
    ...(coreIdea.learningObjectives || []),
    ...(coreIdea.chapterStructure || []).flatMap(ch => ch.coreKnowledge || []),
  ]
  const bankStats = await fetchQuestionBankStats(subject, grade, allKnowledgePoints)

  // 2. AI 生成增补方案
  const prompt = buildAugmentPrompt(coreIdea, reorganizationPlan, subject, grade, bankStats)
  const raw = await callAi(AUGMENT_QUESTION_SYSTEM, prompt, { label: 'Book-Augment' })
  const augmentationPlan = parseAiJson(raw)

  // 3. 执行增补：根据方案从题库拉取题目
  const admin = getSupabaseAdmin()
  const { data: bankQuestions, error: qError } = await admin
    .from('teacher_question_bank')
    .select('*')
    .eq('subject', subject)
    .eq('grade', grade)

  if (qError) throw new Error(`题库查询失败：${qError.message}`)

  const augmentationPlanWithQuestions = {
    ...augmentationPlan,
    executions: [],
  }

  for (const aug of augmentationPlan.augmentationPlan || []) {
    const matched = (bankQuestions || []).filter(q => {
      const tags = aug.requiredTags || []
      return tags.some(t =>
        (q.knowledge_point && q.knowledge_point.includes(t)) ||
        (q.difficulty && q.difficulty.includes(t)) ||
        (q.question_type && q.question_type.includes(t))
      )
    }).slice(0, aug.count || 1)

    augmentationPlanWithQuestions.executions.push({
      ...aug,
      matchedQuestions: matched.map(q => ({
        id: q.id,
        content: q.content?.slice(0, 200),
        difficulty: q.difficulty,
        question_type: q.question_type,
        knowledge_point: q.knowledge_point,
      })),
    })
  }

  return augmentationPlanWithQuestions
}

// ─────────────────────────────────────────────
// 第四阶段：应用重组 + 增补，生成最终结构
// ─────────────────────────────────────────────

/**
 * 应用重组方案 + 增补题目，生成最终 BookChapter 结构
 */
export function applyReorganizationAndAugmentation({
  chapters,
  reorganizationPlan,
  augmentationResult,
  preserveAllOriginalQuestions = true,
}) {
  // 深拷贝
  let result = JSON.parse(JSON.stringify(chapters))

  // 1. 应用章节/小节标题优化
  for (const chPlan of reorganizationPlan.reorganizationPlan || []) {
    if (result[chPlan.chapterIndex]) {
      result[chPlan.chapterIndex].title = chPlan.newTitle || result[chPlan.chapterIndex].title

      for (const secPlan of chPlan.sections || []) {
        const sec = result[chPlan.chapterIndex].sections?.[secPlan.sectionIndex]
        if (sec) {
          sec.title = secPlan.newTitle || sec.title

          // 应用 block 位置调整
          if (secPlan.blockArrangement?.length > 0) {
            const blocks = sec.blocks || []
            const reordered = []
            const placed = new Set()

            for (const arrangement of secPlan.blockArrangement) {
              const idx = blocks.findIndex(b => b.id === arrangement.blockId)
              if (idx >= 0) {
                blocks[idx].type = arrangement.suggestedType || blocks[idx].type
                reordered.push(blocks[idx])
                placed.add(idx)
              }
            }

            // 保留未被 rearrangement 覆盖的原有 blocks
            if (preserveAllOriginalQuestions) {
              for (let i = 0; i < blocks.length; i++) {
                if (!placed.has(i)) reordered.push(blocks[i])
              }
            }

            sec.blocks = reordered
          }
        }
      }
    }
  }

  // 2. 新增建议的小节
  for (const newSec of reorganizationPlan.newSectionsSuggested || []) {
    const ch = result[newSec.chapterIndex]
    if (ch) {
      const insertAt = (newSec.afterSectionIndex || 0) + 1
      ch.sections.splice(insertAt, 0, {
        id: `sec-auto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: newSec.suggestedTitle,
        blocks: [],
      })
    }
  }

  // 3. 应用题目增补
  for (const exe of augmentationResult.executions || []) {
    const ch = result[exe.chapterIndex]
    if (!ch?.sections?.[exe.sectionIndex]) continue

    const sec = ch.sections[exe.sectionIndex]
    const questions = exe.matchedQuestions || []

    for (const q of questions) {
      // 将题库题目转换为 BookBlock
      const block = {
        id: `blk-aug-${q.id}`,
        type: mapQuestionTypeToBlockType(q.question_type),
        title: `题目（增补）`,
        content: q.content || '',
        questionId: q.id,
        missingAnswer: !q.answer,
      }
      // 插入到指定位置
      if (exe.position?.startsWith?.('after:')) {
        const afterId = exe.position.slice(6)
        const idx = sec.blocks.findIndex(b => b.id === afterId)
        sec.blocks.splice(idx + 1, 0, block)
      } else {
        sec.blocks.push(block)
      }
    }
  }

  return result
}

function mapQuestionTypeToBlockType(qType) {
  if (['选择题', '填空题', '计算题', '解答题', '证明题', '应用题'].includes(qType)) return 'exercise'
  if (['例题', '典型题'].some(k => qType?.includes?.(k))) return 'example'
  return 'exercise'
}

// ─────────────────────────────────────────────
// 第五阶段：双版本排版导出
// ─────────────────────────────────────────────

/**
 * 生成学生版 BookRecord（无解析）
 */
export function generateStudentVersion(bookRecord) {
  const student = JSON.parse(JSON.stringify(bookRecord))
  student.exportMode = 'print'
  student.title = `${bookRecord.title}（学生版）`

  for (const ch of student.chapters) {
    for (const sec of ch.sections) {
      for (const blk of sec.blocks) {
        // 移除解析/答案（保留题目内容）
        if (blk.type === 'example') {
          // 例题：保留题干，移除【解答】部分
          blk.content = removeAnswerFromContent(blk.content)
        }
        if (blk.type === 'exercise') {
          blk.content = removeAnswerFromContent(blk.content)
        }
        delete blk.answer
        delete blk.missingAnswer
      }
    }
  }

  // 前言增加学生版说明
  student.foreword = `（学生版）\n\n本书仅供学生练习使用，解析与答案请参照教师版。\n\n` + (bookRecord.foreword || '')

  return student
}

/**
 * 生成教师版 BookRecord（含完整解析）
 */
export function generateTeacherVersion(bookRecord) {
  const teacher = JSON.parse(JSON.stringify(bookRecord))
  teacher.exportMode = 'digital'
  teacher.title = `${bookRecord.title}（教师版）`

  for (const ch of teacher.chapters) {
    for (const sec of ch.sections) {
      for (const blk of sec.blocks) {
        // 确保包含完整解析
        if (blk.type === 'example') {
          blk.content = ensureAnswerInContent(blk.content)
        }
        if (blk.type === 'exercise') {
          blk.content = ensureAnswerInContent(blk.content)
        }
      }
    }
  }

  teacher.foreword = `（教师版）\n\n本书包含完整解析与教学建议，供教师备课使用。\n\n` + (bookRecord.foreword || '')

  // 教师版增加"教学设计建议"章节
  teacher.chapters.push({
    id: `ch-teacher-notes-${Date.now()}`,
    title: '附录：教学设计建议',
    sections: [{
      id: `sec-teacher-notes-${Date.now()}`,
      title: '教学建议',
      blocks: [{
        id: `blk-teacher-notes-${Date.now()}`,
        type: 'summary',
        title: '教学建议',
        content: generateTeachingNotes(bookRecord),
      }],
    }],
  })

  return teacher
}

function removeAnswerFromContent(content) {
  if (!content) return content
  // 移除 [解答]、[答案]、[解析] 标签及其后内容
  return content
    .replace(/\[解答\][\s\S]*?(?=\[|$)/gi, '')
    .replace(/\[答案\][\s\S]*?(?=\[|$)/gi, '')
    .replace(/\[解析\][\s\S]*?(?=\[|$)/gi, '')
    .trim()
}

function ensureAnswerInContent(content) {
  // 如果内容中已有 [解答] 标签，保持不变
  if (/\[解答\]|【解答】/.test(content)) return content
  return content
}

function generateTeachingNotes(bookRecord) {
  const chapters = bookRecord.chapters || []
  let notes = `本书共 ${chapters.length} 章，建议教学安排：\n\n`
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i]
    const blockCount = (ch.sections || []).reduce((n, s) => n + (s.blocks?.length || 0), 0)
    notes += `第${i + 1}章《${ch.title}》：建议 ${Math.ceil(blockCount / 5)} 课时\n`
  }
  return notes
}

// ─────────────────────────────────────────────
// 主流程：一键智能生成
// ─────────────────────────────────────────────

/**
 * 一键智能生成教辅书（完整流程）
 * 
 * 输入：
 *  - title, subject, grade, level
 *  - chapters: 原稿章节结构（OCR或手动创建）
 *  - teacherId: 教师ID（用于查询题库）
 *  - options: { preserveAllQuestions, generateDualVersion, augmentFromBank }
 *
 * 输出：
 *  {
 *    coreIdea,           // 原稿核心思想
 *    reorganizationPlan,  // 重组方案（含调整原因）
 *    augmentationResult,  // 增补结果
 *    previewChapters,    // 调整后章节预览
 *    studentVersion,      // 学生版
 *    teacherVersion,      // 教师版
 *    adjustmentReport,    // 调整说明报告
 *  }
 */
export async function smartGenerateBook({
  title,
  subject,
  grade,
  level,
  chapters,
  teacherId,
  options = {},
}) {
  const {
    preserveAllQuestions = true,
    generateDualVersion = true,
    augmentFromBank = true,
  } = options

  const report = {
    stages: [],
    warnings: [],
  }

  // ── 阶段1：提取核心思想 ──
  report.stages.push({ stage: 'extractCore', status: 'started', message: '分析原稿核心思想...' })
  const coreIdea = await extractCoreIdea({ title, subject, grade, chapters })
  report.stages[report.stages.length - 1].status = 'done'
  report.stages[report.stages.length - 1].message = `核心思想提取完成：${coreIdea.coreIdea?.slice(0, 50)}...`

  // ── 阶段2：生成重组方案 ──
  report.stages.push({ stage: 'reorganize', status: 'started', message: '生成内容重组方案...' })
  const reorganizationPlan = await generateReorganizationPlan({ coreIdea, chapters })
  report.stages[report.stages.length - 1].status = 'done'
  report.stages[report.stages.length - 1].message = `重组方案生成完成：${(reorganizationPlan.reorganizationPlan || []).length} 章调整`

  // ── 阶段3：题库增补 ──
  let augmentationResult = { augmentationPlan: [], executions: [] }
  if (augmentFromBank) {
    report.stages.push({ stage: 'augment', status: 'started', message: '从题库智能增补题目...' })
    augmentationResult = await augmentWithQuestionBank({
      coreIdea,
      reorganizationPlan,
      chapters,
      subject,
      grade,
      teacherId,
    })
    report.stages[report.stages.length - 1].status = 'done'
    report.stages[report.stages.length - 1].message = `增补方案完成：${(augmentationResult.executions || []).length} 处增补`
  }

  // ── 阶段4：应用调整 ──
  report.stages.push({ stage: 'apply', status: 'started', message: '应用调整方案...' })
  const finalChapters = applyReorganizationAndAugmentation({
    chapters,
    reorganizationPlan,
    augmentationResult,
    preserveAllOriginalQuestions: preserveAllQuestions,
  })
  report.stages[report.stages.length - 1].status = 'done'
  report.stages[report.stages.length - 1].message = `调整应用完成：${finalChapters.length} 章`

  // ── 阶段5：生成双版本 ──
  let studentVersion = null
  let teacherVersion = null
  if (generateDualVersion) {
    report.stages.push({ stage: 'export', status: 'started', message: '生成学生版/教师版...' })
    const baseRecord = {
      title,
      subject,
      grade,
      level,
      chapters: finalChapters,
      layoutTemplate: 'knowledge-example',
      layoutSettings: { fontFamily: 'Microsoft YaHei, SimSun, serif', fontSize: 14, lineHeight: 1.7 },
      coverStyle: 'academic',
    }
    studentVersion = generateStudentVersion(baseRecord)
    teacherVersion = generateTeacherVersion(baseRecord)
    report.stages[report.stages.length - 1].status = 'done'
    report.stages[report.stages.length - 1].message = '双版本生成完成'
  }

  // ── 生成调整报告 ──
  const adjustmentReport = generateAdjustmentReport({
    coreIdea,
    reorganizationPlan,
    augmentationResult,
    originalChapterCount: chapters.length,
    finalChapterCount: finalChapters.length,
  })

  return {
    coreIdea,
    reorganizationPlan,
    augmentationResult,
    previewChapters: finalChapters,
    studentVersion,
    teacherVersion,
    adjustmentReport,
    report,
  }
}

/**
 * 生成人类可读的调整报告
 */
function generateAdjustmentReport({ coreIdea, reorganizationPlan, augmentationResult, originalChapterCount, finalChapterCount }) {
  let md = `# 教辅书智能生成调整报告\n\n`
  md += `## 一、原稿核心思想\n\n${coreIdea.coreIdea || '（未能提取）'}\n\n`
  md += `**适用对象**：${coreIdea.targetAudience || '未指定'}\n\n`
  md += `**难度分布**：${JSON.stringify(coreIdea.difficultyDistribution || {})}\n\n`

  md += `## 二、章节调整说明\n\n`
  for (const ch of reorganizationPlan.reorganizationPlan || []) {
    md += `### 第${ch.chapterIndex + 1}章：《${ch.originalTitle}》→《${ch.newTitle}》\n\n`
    md += `**调整原因**：${ch.reason || '优化章节结构'}\n\n`
    for (const sec of ch.sections || []) {
      md += `- 小节《${sec.originalTitle}》→《${sec.newTitle}》\n`
      for (const blk of sec.blockArrangement || []) {
        if (blk.reason) {
          md += `  - 内容块调整：${blk.reason}\n`
        }
      }
    }
    md += `\n`
  }

  md += `## 三、题目增补说明\n\n`
  for (const exe of augmentationResult.executions || []) {
    md += `- **第${exe.chapterIndex + 1}章 第${exe.sectionIndex + 1}节**：${exe.reason || '智能增补'}\n`
    md += `  - 增补数量：${exe.matchedQuestions?.length || 0} 题\n`
    md += `  - 标签要求：${(exe.requiredTags || []).join(', ')}\n\n`
  }

  md += `## 四、统计信息\n\n`
  md += `- 原稿章节数：${originalChapterCount}\n`
  md += `- 调整后章节数：${finalChapterCount}\n`
  md += `- 新增小节数：${(reorganizationPlan.newSectionsSuggested || []).length}\n\n`

  md += `## 五、教学建议\n\n`
  for (const note of coreIdea.pedagogicalNotes || reorganizationPlan.pedagogicalNotes || []) {
    md += `- ${note}\n`
  }

  return md
}

export default {
  smartGenerateBook,
  extractCoreIdea,
  generateReorganizationPlan,
  augmentWithQuestionBank,
  applyReorganizationAndAugmentation,
  generateStudentVersion,
  generateTeacherVersion,
  generateAdjustmentReport,
}
