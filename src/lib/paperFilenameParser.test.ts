/**
 * 文件名解析单元测试用例（可在浏览器控制台或 vitest 中运行）
 */
import { parsePaperFilename } from './paperFilenameParser'
import type { PaperCategory } from '../types/paper'

const MOCK_CATEGORIES: PaperCategory[] = [
  { id: 'c1', parent_id: null, category_name: '期末', sort: 5 },
  { id: 'c2', parent_id: null, category_name: '期中', sort: 4 },
  { id: 'c3', parent_id: null, category_name: '周测', sort: 2 },
  { id: 'c4', parent_id: 'g1', category_name: '二轮专题', sort: 2 },
  { id: 'g1', parent_id: null, category_name: '高考复习', sort: 6 },
]

const CASES = [
  {
    name: '示例1-浙江期末',
    file: '浙江宁波市镇海中学2025-2026学年第二学期期末考试高一年级数学试卷.pdf',
    expect: { area: '浙江-宁波', exam_year: 2026, grade: '高一', term: '下学期', categoryName: '期末' },
  },
  {
    name: '示例2-二轮含答案',
    file: '2026年高三二轮专题复习数学周测卷（含答案）.zip',
    expect: { exam_year: 2026, grade: '高三', categoryName: '二轮专题', has_answer: true },
  },
  {
    name: '示例3-杭州期中',
    file: '杭州市2025学年第一学期九年级期中数学联考.docx',
    expect: { area: '浙江-杭州', exam_year: 2025, grade: '九年级', term: '上学期', categoryName: '期中' },
  },
]

export function runPaperFilenameParserTests(): void {
  for (const c of CASES) {
    const r = parsePaperFilename(c.file, MOCK_CATEGORIES)
    console.log(`[${c.name}]`, r, 'expect', c.expect)
  }
}
