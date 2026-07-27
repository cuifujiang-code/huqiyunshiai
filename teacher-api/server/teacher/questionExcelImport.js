import * as XLSX from 'xlsx'
import * as questionBank from './questionBankStore.js'
import { stripImagePlaceholders } from './questionContentSanitize.js'

const SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理']
const GRADES = ['七年级', '八年级', '九年级', '高一', '高二', '高三']
const DIFFICULTIES = ['基础', '中等', '拔高', '压轴']
const ABILITY_DIMENSIONS = ['逻辑推理', '运算求解', '直观想象', '数学建模', '数据分析']
const SUITABLE_STAGES = ['高一同步', '高二同步', '高三一轮复习', '高三二轮复习', '高考冲刺', '竞赛培优']

/** 表头别名：英文 / 中文 → 标准字段名 */
const HEADER_ALIASES = {
  content: 'content',
  题干: 'content',
  answer: 'answer',
  答案: 'answer',
  analysis: 'analysis',
  解析: 'analysis',
  question_type: 'question_type',
  题型: 'question_type',
  difficulty: 'difficulty',
  难度: 'difficulty',
  subject: 'subject',
  学科: 'subject',
  grade: 'grade',
  年级: 'grade',
  knowledge_point: 'knowledge_point',
  知识点: 'knowledge_point',
  source: 'source',
  题源: 'source',
  ability_dimension: 'ability_dimension',
  能力维度: 'ability_dimension',
  suitable_stage: 'suitable_stage',
  适用阶段: 'suitable_stage',
  estimated_time: 'estimated_time',
  '预估时间(秒)': 'estimated_time',
  预估时间: 'estimated_time',
  选项a: 'option_a',
  选项b: 'option_b',
  选项c: 'option_c',
  选项d: 'option_d',
  option_a: 'option_a',
  option_b: 'option_b',
  option_c: 'option_c',
  option_d: 'option_d',
}

function cellStr(value) {
  if (value == null) return ''
  return String(value).trim()
}

function normalizeHeader(raw) {
  const key = cellStr(raw).replace(/\s+/g, '')
  if (!key) return ''
  const lower = key.toLowerCase()
  return HEADER_ALIASES[key] || HEADER_ALIASES[lower] || lower
}

function rowIsEmpty(row) {
  return Object.values(row).every((v) => !cellStr(v))
}

function parseExcelRows(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error('Excel 文件中没有工作表')
  const sheet = workbook.Sheets[sheetName]
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  if (!matrix.length) throw new Error('Excel 工作表为空')

  const headerRow = matrix[0].map(normalizeHeader)
  const rows = []
  for (let i = 1; i < matrix.length; i++) {
    const cells = matrix[i]
    const obj = {}
    for (let c = 0; c < headerRow.length; c++) {
      const field = headerRow[c]
      if (!field) continue
      obj[field] = cells[c] ?? ''
    }
    if (rowIsEmpty(obj)) continue
    rows.push({ rowNumber: i + 1, raw: obj })
  }
  return rows
}

function buildQuestionPayload(raw) {
  const options = [
    cellStr(raw.option_a),
    cellStr(raw.option_b),
    cellStr(raw.option_c),
    cellStr(raw.option_d),
  ].filter(Boolean)

  const estimatedRaw = raw.estimated_time
  let estimated_time = null
  if (estimatedRaw !== '' && estimatedRaw != null) {
    const n = Number(estimatedRaw)
    if (!Number.isNaN(n) && n >= 0) estimated_time = Math.round(n)
  }

  return {
    content: stripImagePlaceholders(cellStr(raw.content)),
    answer: stripImagePlaceholders(cellStr(raw.answer)),
    analysis: stripImagePlaceholders(cellStr(raw.analysis)),
    question_type: cellStr(raw.question_type),
    difficulty: cellStr(raw.difficulty) || '中等',
    subject: cellStr(raw.subject),
    grade: cellStr(raw.grade),
    knowledge_point: cellStr(raw.knowledge_point),
    source: cellStr(raw.source) || '手动录入',
    ability_dimension: cellStr(raw.ability_dimension),
    suitable_stage: cellStr(raw.suitable_stage),
    estimated_time,
    options,
  }
}

function validateQuestionPayload(payload) {
  const errors = []
  if (!payload.content) errors.push('题干(content)不能为空')
  if (!payload.subject) errors.push('学科(subject)不能为空')
  else if (!SUBJECTS.includes(payload.subject)) errors.push(`学科无效，可选：${SUBJECTS.join('、')}`)
  if (!payload.grade) errors.push('年级(grade)不能为空')
  else if (!GRADES.includes(payload.grade)) errors.push(`年级无效，可选：${GRADES.join('、')}`)
  if (!payload.question_type) errors.push('题型(question_type)不能为空')
  if (payload.difficulty && !DIFFICULTIES.includes(payload.difficulty)) {
    errors.push(`难度无效，可选：${DIFFICULTIES.join('、')}`)
  }
  if (payload.ability_dimension && !ABILITY_DIMENSIONS.includes(payload.ability_dimension)) {
    errors.push(`能力维度无效，可选：${ABILITY_DIMENSIONS.join('、')}`)
  }
  if (payload.suitable_stage && !SUITABLE_STAGES.includes(payload.suitable_stage)) {
    errors.push(`适用阶段无效，可选：${SUITABLE_STAGES.join('、')}`)
  }
  if (payload.estimated_time != null && (Number.isNaN(payload.estimated_time) || payload.estimated_time < 0)) {
    errors.push('预估时间(estimated_time)须为非负整数（秒）')
  }
  return errors
}

/**
 * 解析 Excel 并批量导入题库
 * @returns {{ successCount: number, failureCount: number, errors: { row: number, message: string }[], questions?: object[] }}
 */
export async function importQuestionsFromExcel(teacherId, buffer) {
  const parsedRows = parseExcelRows(buffer)
  if (!parsedRows.length) {
    return { successCount: 0, failureCount: 0, errors: [{ row: 0, message: '未找到有效数据行（请检查表头与示例格式）' }] }
  }

  const validQuestions = []
  const errors = []

  for (const { rowNumber, raw } of parsedRows) {
    const payload = buildQuestionPayload(raw)
    const rowErrors = validateQuestionPayload(payload)
    if (rowErrors.length) {
      errors.push({ row: rowNumber, message: rowErrors.join('；') })
      continue
    }
    validQuestions.push(payload)
  }

  let inserted = []
  if (validQuestions.length) {
    try {
      const result = await questionBank.createQuestionsBatch(teacherId, validQuestions)
      inserted = Array.isArray(result) ? result : (result.items ?? [])
    } catch (err) {
      errors.push({ row: 0, message: `批量写入失败：${err.message}` })
      return {
        successCount: 0,
        failureCount: parsedRows.length,
        errors,
      }
    }
  }

  return {
    successCount: inserted.length,
    failureCount: errors.length,
    errors,
    questions: inserted,
  }
}

export const TEMPLATE_HEADERS = [
  'content',
  'answer',
  'analysis',
  'question_type',
  'difficulty',
  'subject',
  'grade',
  'knowledge_point',
  'source',
  'ability_dimension',
  'suitable_stage',
  'estimated_time',
  '选项A',
  '选项B',
  '选项C',
  '选项D',
]

export const TEMPLATE_EXAMPLE_ROW = [
  '已知函数 $f(x)=x^2+1$，求 $f(2)$ 的值。',
  '5',
  '将 $x=2$ 代入得 $f(2)=2^2+1=5$。',
  '填空题',
  '基础',
  '数学',
  '高三',
  '函数的概念与性质',
  '2024年高考数学全国卷I',
  '运算求解',
  '高三一轮复习',
  120,
  '',
  '',
  '',
  '',
]

export function buildImportTemplateBuffer() {
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, TEMPLATE_EXAMPLE_ROW])
  ws['!cols'] = TEMPLATE_HEADERS.map(() => ({ wch: 18 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '题目导入')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}
