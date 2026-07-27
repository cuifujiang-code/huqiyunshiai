/**
 * 试卷上传文件名智能解析 — 提取地区、年份、年级、学期、分类、标题等
 */
import type { PaperCategory } from '../types/paper'

export interface ParsedFilenameResult {
  title?: string
  area?: string
  exam_year?: number
  grade?: string
  term?: string
  category_id?: string
  categoryName?: string
  has_answer?: boolean
  has_analysis?: boolean
  /** 成功识别字段数 */
  matchedCount: number
  hasAnyMatch: boolean
}

/** 省级（长名优先匹配） */
const PROVINCES = [
  '黑龙江', '内蒙古', '港澳台',
  '河北', '山西', '辽宁', '吉林', '江苏', '浙江', '安徽', '福建', '江西', '山东',
  '河南', '湖北', '湖南', '广东', '广西', '海南', '重庆', '四川', '贵州', '云南',
  '西藏', '陕西', '甘肃', '青海', '宁夏', '新疆',
  '北京', '上海', '天津',
]

/** 省份 → 主要地市 */
const PROVINCE_CITIES: Record<string, string[]> = {
  浙江: ['杭州', '宁波', '温州', '绍兴', '嘉兴', '金华', '台州', '湖州', '丽水', '衢州', '舟山'],
  江苏: ['南京', '苏州', '无锡', '常州', '南通', '扬州', '镇江', '泰州', '盐城', '连云港', '徐州', '淮安', '宿迁'],
  广东: ['广州', '深圳', '东莞', '佛山', '珠海', '惠州', '中山', '江门', '湛江', '汕头'],
  山东: ['济南', '青岛', '烟台', '潍坊', '淄博', '临沂', '济宁', '泰安', '威海', '德州'],
  河北: ['石家庄', '唐山', '保定', '邯郸', '廊坊', '沧州', '秦皇岛', '张家口', '承德'],
  河南: ['郑州', '洛阳', '开封', '南阳', '安阳', '新乡', '许昌', '焦作'],
  湖北: ['武汉', '宜昌', '襄阳', '荆州', '黄石', '十堰', '黄冈'],
  湖南: ['长沙', '株洲', '湘潭', '衡阳', '岳阳', '常德', '郴州'],
  四川: ['成都', '绵阳', '德阳', '宜宾', '南充', '泸州', '乐山'],
  福建: ['福州', '厦门', '泉州', '漳州', '莆田', '龙岩'],
  安徽: ['合肥', '芜湖', '蚌埠', '阜阳', '安庆', '马鞍山', '滁州'],
  江西: ['南昌', '赣州', '九江', '上饶', '宜春', '吉安'],
  辽宁: ['沈阳', '大连', '鞍山', '抚顺', '锦州', '营口'],
  陕西: ['西安', '宝鸡', '咸阳', '渭南', '汉中', '榆林'],
  云南: ['昆明', '曲靖', '玉溪', '大理', '红河'],
  贵州: ['贵阳', '遵义', '六盘水', '安顺'],
  甘肃: ['兰州', '天水', '酒泉', '张掖'],
  山西: ['太原', '大同', '运城', '临汾', '长治'],
  吉林: ['长春', '吉林', '四平', '延边'],
  黑龙江: ['哈尔滨', '齐齐哈尔', '大庆', '牡丹江'],
  广西: ['南宁', '桂林', '柳州', '北海', '玉林'],
  内蒙古: ['呼和浩特', '包头', '赤峰', '鄂尔多斯'],
  新疆: ['乌鲁木齐', '克拉玛依', '喀什', '伊犁'],
  海南: ['海口', '三亚', '儋州'],
  宁夏: ['银川', '石嘴山', '吴忠'],
  青海: ['西宁', '海东'],
  西藏: ['拉萨', '日喀则'],
}

const CITY_TO_PROVINCE: Record<string, string> = {}
for (const [prov, cities] of Object.entries(PROVINCE_CITIES)) {
  for (const c of cities) CITY_TO_PROVINCE[c] = prov
}

/** 分类关键词（priority 越小越优先；冲突时取 priority 最高） */
const CATEGORY_RULES: { name: string; keywords: string[]; priority: number }[] = [
  { name: '期中', keywords: ['期中考试', '期中卷', '期中'], priority: 1 },
  { name: '期末', keywords: ['期末考试', '期末卷', '期末'], priority: 1 },
  { name: '一模', keywords: ['一模'], priority: 2 },
  { name: '二模', keywords: ['二模'], priority: 2 },
  { name: '三模', keywords: ['三模'], priority: 2 },
  { name: '一轮复习', keywords: ['一轮复习', '一轮'], priority: 3 },
  { name: '二轮专题', keywords: ['二轮专题', '二轮'], priority: 3 },
  { name: '三轮冲刺', keywords: ['三轮冲刺', '三轮', '冲刺'], priority: 3 },
  { name: '真题', keywords: ['高考真题', '中考真题', '真题汇编', '真题'], priority: 3 },
  { name: '模拟预测', keywords: ['模拟预测', '模拟', '预测', '联考', '校考', '统考', '校统', '校际'], priority: 3 },
  { name: '开学', keywords: ['开学'], priority: 4 },
  { name: '周测', keywords: ['周测', '周考卷', '周考', '限时练', '限时训练'], priority: 4 },
  { name: '阶段检测', keywords: ['阶段检测', '单元检测', '月考', '学情', '段考', '模块检测', '模块考'], priority: 4 },
  { name: '竞赛', keywords: ['竞赛', '联赛', '奥赛'], priority: 4 },
  { name: '初高衔接', keywords: ['初高衔接', '衔接'], priority: 4 },
  { name: '学业考试', keywords: ['学业考试', '学考'], priority: 4 },
  { name: '强基计划', keywords: ['强基计划', '强基'], priority: 4 },
  { name: '自主招生', keywords: ['自主招生', '自招'], priority: 4 },
]

const GRADE_RULES: { re: RegExp; grade: string }[] = [
  { re: /高[\s]?一(?:年级)?|高1(?:年级)?(?!\d)/, grade: '高一' },
  { re: /高[\s]?二(?:年级)?|高2(?:年级)?(?!\d)/, grade: '高二' },
  { re: /高[\s]?三(?:年级)?|高3(?:年级)?(?!\d)/, grade: '高三' },
  { re: /九年级|9年级|(?<![0-9])九(?=年级)/, grade: '九年级' },
  { re: /八年级|8年级|(?<![0-9])八(?=年级)/, grade: '八年级' },
  { re: /七年级|7年级|(?<![0-9])七(?=年级)/, grade: '七年级' },
]

function stripExtension(name: string): string {
  return name.replace(/\.[^.\\/]+$/i, '')
}

function normalizeText(name: string): string {
  return stripExtension(name)
    .replace(/[（(][^）)]*[）)]/g, ' ')
    .replace(/[_\-–—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractArea(text: string): string | undefined {
  let province: string | undefined
  let city: string | undefined

  for (const p of PROVINCES) {
    const idx = text.indexOf(p)
    if (idx === -1) continue
    province = p
    const after = text.slice(idx + p.length)
    const cities = PROVINCE_CITIES[p] ?? []
    for (const c of cities) {
      if (after.startsWith(c) || after.startsWith(`${c}市`) || text.includes(`${c}市`)) {
        city = c
        break
      }
    }
    break
  }

  if (!province) {
    for (const [c, p] of Object.entries(CITY_TO_PROVINCE)) {
      if (text.includes(`${c}市`) || text.includes(c)) {
        province = p
        city = c
        break
      }
    }
  }

  if (province && city) return `${province}-${city}`
  if (province) return province
  return undefined
}

function extractYear(text: string): number | undefined {
  const range = text.match(/(20(?:1[6-9]|2[0-7]))[\s\-—–~～至到]+(20(?:1[6-9]|2[0-7]))/)
  if (range) {
    const y = Number(range[2])
    if (y >= 2016 && y <= 2027) return y
  }
  const m = text.match(/(20(?:1[6-9]|2[0-7]))/)
  return m ? Number(m[1]) : undefined
}

function extractGrade(text: string): string | undefined {
  let bestIdx = Infinity
  let grade: string | undefined
  for (const { re, grade: g } of GRADE_RULES) {
    const m = text.match(re)
    if (m && m.index !== undefined && m.index < bestIdx) {
      bestIdx = m.index
      grade = g
    }
  }
  return grade
}

function extractTerm(text: string): string | undefined {
  if (/第[\s]?一学期|第一学期|上学期|上册/.test(text)) return '上学期'
  if (/第[\s]?二学期|第二学期|下学期|下册/.test(text)) return '下学期'
  return undefined
}

function extractCategoryName(text: string): string | undefined {
  let best: { name: string; priority: number; index: number } | null = null
  for (const rule of CATEGORY_RULES) {
    for (const kw of rule.keywords) {
      const idx = text.indexOf(kw)
      if (idx === -1) continue
      if (
        !best
        || rule.priority < best.priority
        || (rule.priority === best.priority && idx < best.index)
      ) {
        best = { name: rule.name, priority: rule.priority, index: idx }
      }
    }
  }
  if (best) return best.name
  // 启发式：含「N月」+ 试卷/考试 → 阶段检测（月考）
  if (/\d{1,2}\s*月/.test(text) && /试卷|考试|检测|练习/.test(text)) {
    return '阶段检测'
  }
  return undefined
}

function resolveCategoryFromTexts(texts: string[], flatCategories: PaperCategory[]) {
  for (const t of texts) {
    if (!t) continue
    const name = extractCategoryName(t)
    const id = resolveCategoryId(name, flatCategories)
    if (id) return { category_id: id, categoryName: name }
  }
  return { category_id: undefined, categoryName: undefined }
}

function extractFlags(text: string): { has_answer: boolean; has_analysis: boolean } {
  const raw = stripExtension(text)
  const has_answer = /答案|参考答案/.test(raw)
  const has_analysis = /解析|详解/.test(raw)
  return { has_answer, has_analysis }
}

function buildTitle(rawName: string): string {
  let t = stripExtension(rawName)
  t = t.replace(/[（(][^）)]*[）)]/g, ' ')
  t = t.replace(/20(?:1[6-9]|2[0-7])[\s\-—–~～至到]+20(?:1[6-9]|2[0-7])\s*学年/g, ' ')
  t = t.replace(/20(?:1[6-9]|2[0-7])\s*学年/g, ' ')
  t = t.replace(/20(?:1[6-9]|2[0-7])\s*年/g, ' ')
  t = t.replace(/\b20(?:1[6-9]|2[0-7])\b/g, ' ')
  t = t.replace(/第[\s]?[一二1-2]\s*学期|第一学期|第二学期|上学期|下学期|上册|下册/g, ' ')
  t = t.replace(/[_\-–—]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (t.length >= 4) return t
  return stripExtension(rawName).replace(/[（(][^）)]*[）)]/g, '').trim()
}

function resolveCategoryId(name: string | undefined, flatCategories: PaperCategory[]): string | undefined {
  if (!name) return undefined
  const hit = flatCategories.find((c) => c.category_name === name)
  return hit?.id
}

export function parsePaperFilename(
  fileName: string,
  flatCategories: PaperCategory[],
): ParsedFilenameResult {
  const text = normalizeText(fileName)
  const raw = stripExtension(fileName)

  const area = extractArea(text)
  const exam_year = extractYear(text)
  const grade = extractGrade(text)
  const term = extractTerm(text)
  const title = buildTitle(fileName)
  const { category_id, categoryName } = resolveCategoryFromTexts(
    [text, title, raw],
    flatCategories,
  )

  const { has_answer, has_analysis } = extractFlags(raw)

  const fields = [area, exam_year, grade, term, category_id, title, has_answer || has_analysis ? true : undefined]
  const matchedCount = fields.filter((f) => f !== undefined && f !== '').length

  return {
    title: title.length >= 2 ? title : undefined,
    area,
    exam_year,
    grade,
    term,
    category_id,
    categoryName,
    has_answer: has_answer || undefined,
    has_analysis: has_analysis || undefined,
    matchedCount,
    hasAnyMatch: matchedCount > 0,
  }
}

export interface PaperUploadSharedDefaults {
  subject: string
  level: string
  category_id?: string
  grade?: string
  term?: string
  exam_year?: number
  area?: string
}

/** 批量上传：从已解析行中统计最多出现的分类 ID */
export function inferMajorityCategoryId(
  rows: { category_id?: string }[],
): string | undefined {
  const counts = new Map<string, number>()
  for (const r of rows) {
    if (!r.category_id) continue
    counts.set(r.category_id, (counts.get(r.category_id) ?? 0) + 1)
  }
  let bestId: string | undefined
  let bestN = 0
  for (const [id, n] of counts) {
    if (n > bestN) {
      bestN = n
      bestId = id
    }
  }
  return bestId
}

export function categoryNameById(id: string, flatCategories: PaperCategory[]): string | undefined {
  return flatCategories.find((c) => c.id === id)?.category_name
}

/** 单文件上传 payload：文件名解析 + 共享默认值 + 行级覆盖合并 */
export function buildUploadPayloadFromFile(
  file: File,
  flatCategories: PaperCategory[],
  shared: PaperUploadSharedDefaults,
  rowOverride?: { category_id?: string },
): Record<string, unknown> {
  const parsed = parsePaperFilename(file.name, flatCategories)
  const fallbackTitle = file.name.replace(/\.[^.]+$/, '')
  const category_id =
    rowOverride?.category_id
    || parsed.category_id
    || shared.category_id
    || null
  return {
    title: parsed.title || fallbackTitle,
    subject: shared.subject,
    grade: parsed.grade || shared.grade || '高一',
    term: parsed.term || shared.term || '无',
    exam_year: parsed.exam_year ?? shared.exam_year ?? new Date().getFullYear(),
    area: parsed.area || shared.area || '全国',
    category_id,
    level: shared.level || '普通',
    has_answer: Boolean(parsed.has_answer),
    has_analysis: Boolean(parsed.has_analysis),
    set_type: 'single',
  }
}
