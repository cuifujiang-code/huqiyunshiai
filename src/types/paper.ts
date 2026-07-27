/** 试题试卷模块类型与常量 — 全学段全学科 */

export interface PaperCategory {
  id: string
  parent_id: string | null
  category_name: string
  sort: number
  children?: PaperCategory[]
}

export interface PaperItem {
  id: string
  title: string
  subject: string
  grade: string
  term: string
  exam_year: number | null
  area: string
  category_id: string | null
  level: string
  has_answer: boolean
  has_analysis: boolean
  file_url: string
  file_type: string
  file_size: number
  page_count: number
  set_type: 'single' | 'set'
  view_count: number
  download_count: number
  upload_user_id: string
  visibility: string
  tags: string[]
  created_at: string
  updated_at: string
  collected?: boolean
}

/** 8 大学科（导航、上传） */
export const PAPER_SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理'] as const

/** 筛选栏学科（含不限） */
export const PAPER_SUBJECTS_FILTER = ['不限', ...PAPER_SUBJECTS] as const

/** 全学段年级 */
export const PAPER_GRADES = ['不限', '七年级', '八年级', '九年级', '高一', '高二', '高三'] as const

export const PAPER_JUNIOR_GRADES = ['七年级', '八年级', '九年级'] as const
export const PAPER_SENIOR_GRADES = ['高一', '高二', '高三'] as const

export const GAO_KAO_CATEGORY = '高考复习'

export const PAPER_LEVELS = ['不限', '免费', '普通', '特供', '精品', '教辅'] as const

export const PAPER_TERMS = ['上学期', '下学期', '无'] as const

export const PAPER_SORT_TABS = [
  { id: 'latest', label: '最新' },
  { id: 'views', label: '浏览量' },
  { id: 'downloads', label: '年下载' },
] as const

export const PAPER_YEARS = ['不限', ...Array.from({ length: 12 }, (_, i) => String(2016 + i))]

export const PAPER_AREAS = [
  '不限', '全国', '北京', '天津', '上海', '重庆',
  '河北', '山西', '辽宁', '吉林', '黑龙江', '江苏', '浙江', '安徽', '福建', '江西', '山东',
  '河南', '湖北', '湖南', '广东', '海南', '四川', '贵州', '云南', '陕西', '甘肃', '青海',
  '内蒙古', '广西', '西藏', '宁夏', '新疆', '香港', '澳门', '台湾',
] as const

export const PAPER_FILE_TYPES = ['不限', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'zip', 'rar', 'png', 'jpg'] as const

export interface PaperFilters {
  grade: string
  exam_year: string
  area: string
  level: string
  category_id: string
  set_type: 'single' | 'set' | ''
  has_answer: boolean
  has_analysis: boolean
  keyword: string
  subject: string
  file_type: string
  sort: string
  my_uploads: boolean
}

export function isJuniorGrade(grade: string): boolean {
  return (PAPER_JUNIOR_GRADES as readonly string[]).includes(grade)
}

/** 初中年级隐藏「高考复习」分类 */
export function filterCategoriesByGrade(categories: PaperCategory[], grade: string): PaperCategory[] {
  if (!isJuniorGrade(grade)) return categories
  return categories.filter((c) => c.category_name !== GAO_KAO_CATEGORY)
}

export function isGaokaoCategory(categories: PaperCategory[], categoryId: string): boolean {
  if (!categoryId) return false
  for (const cat of categories) {
    if (cat.id === categoryId && cat.category_name === GAO_KAO_CATEGORY) return true
    if (cat.children?.some((sub) => sub.id === categoryId)) {
      return cat.category_name === GAO_KAO_CATEGORY
    }
  }
  return false
}

export const defaultPaperFilters = (): PaperFilters => ({
  grade: '不限',
  exam_year: '不限',
  area: '不限',
  level: '不限',
  category_id: '',
  set_type: '',
  has_answer: false,
  has_analysis: false,
  keyword: '',
  subject: '不限',
  file_type: '不限',
  sort: 'latest',
  my_uploads: false,
})
