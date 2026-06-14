import treeData from '../../knowledge-base/subject-knowledge-tree.json'

/** JSON 节点 code → Supabase UUID（与 020 迁移种子一致） */
export const KNOWLEDGE_CODE_TO_UUID: Record<string, string> = {
  'math-grade-senior3': 'a1000001-0001-4001-8001-000000000001',
  'math-s3-ch01': 'a1000001-0001-4001-8001-000000000101',
  'math-s3-ch02': 'a1000001-0001-4001-8001-000000000102',
  'math-s3-ch03': 'a1000001-0001-4001-8001-000000000103',
  'math-s3-ch04': 'a1000001-0001-4001-8001-000000000104',
  'math-s3-ch05': 'a1000001-0001-4001-8001-000000000105',
  'math-s3-ch06': 'a1000001-0001-4001-8001-000000000106',
  'math-s3-ch07': 'a1000001-0001-4001-8001-000000000107',
  'math-s3-ch01-kp01': 'a1000001-0001-4001-8001-000000001101',
  'math-s3-ch01-kp02': 'a1000001-0001-4001-8001-000000001102',
  'math-s3-ch01-kp03': 'a1000001-0001-4001-8001-000000001103',
  'math-s3-ch01-kp01-ep01': 'a1000001-0001-4001-8001-000000001201',
  'math-s3-ch01-kp01-ep02': 'a1000001-0001-4001-8001-000000001202',
  'math-s3-ch01-kp01-ep03': 'a1000001-0001-4001-8001-000000001203',
  'math-s3-ch01-kp02-ep01': 'a1000001-0001-4001-8001-000000001204',
  'math-s3-ch01-kp02-ep02': 'a1000001-0001-4001-8001-000000001205',
  'math-s3-ch01-kp03-ep01': 'a1000001-0001-4001-8001-000000001206',
  'math-s3-ch01-kp03-ep02': 'a1000001-0001-4001-8001-000000001207',
  'math-s3-ch02-kp01': 'a1000001-0001-4001-8001-000000002101',
  'math-s3-ch02-kp02': 'a1000001-0001-4001-8001-000000002102',
  'math-s3-ch02-kp03': 'a1000001-0001-4001-8001-000000002103',
  'math-s3-ch02-kp01-ep01': 'a1000001-0001-4001-8001-000000002201',
  'math-s3-ch02-kp01-ep02': 'a1000001-0001-4001-8001-000000002202',
  'math-s3-ch02-kp01-ep03': 'a1000001-0001-4001-8001-000000002203',
  'math-s3-ch02-kp02-ep01': 'a1000001-0001-4001-8001-000000002204',
  'math-s3-ch02-kp02-ep02': 'a1000001-0001-4001-8001-000000002205',
  'math-s3-ch02-kp02-ep03': 'a1000001-0001-4001-8001-000000002206',
  'math-s3-ch02-kp03-ep01': 'a1000001-0001-4001-8001-000000002207',
  'math-s3-ch02-kp03-ep02': 'a1000001-0001-4001-8001-000000002208',
  'math-s3-ch02-kp03-ep03': 'a1000001-0001-4001-8001-000000002209',
  'math-s3-ch03-kp01': 'a1000001-0001-4001-8001-000000003101',
  'math-s3-ch03-kp02': 'a1000001-0001-4001-8001-000000003102',
  'math-s3-ch03-kp03': 'a1000001-0001-4001-8001-000000003103',
  'math-s3-ch03-kp01-ep01': 'a1000001-0001-4001-8001-000000003201',
  'math-s3-ch03-kp01-ep02': 'a1000001-0001-4001-8001-000000003202',
  'math-s3-ch03-kp02-ep01': 'a1000001-0001-4001-8001-000000003203',
  'math-s3-ch03-kp02-ep02': 'a1000001-0001-4001-8001-000000003204',
  'math-s3-ch03-kp03-ep01': 'a1000001-0001-4001-8001-000000003205',
  'math-s3-ch03-kp03-ep02': 'a1000001-0001-4001-8001-000000003206',
  'math-s3-ch04-kp01': 'a1000001-0001-4001-8001-000000004101',
  'math-s3-ch04-kp02': 'a1000001-0001-4001-8001-000000004102',
  'math-s3-ch04-kp01-ep01': 'a1000001-0001-4001-8001-000000004201',
  'math-s3-ch04-kp01-ep02': 'a1000001-0001-4001-8001-000000004202',
  'math-s3-ch04-kp02-ep01': 'a1000001-0001-4001-8001-000000004203',
  'math-s3-ch04-kp02-ep02': 'a1000001-0001-4001-8001-000000004204',
  'math-s3-ch04-kp02-ep03': 'a1000001-0001-4001-8001-000000004205',
  'math-s3-ch05-kp01': 'a1000001-0001-4001-8001-000000005101',
  'math-s3-ch05-kp02': 'a1000001-0001-4001-8001-000000005102',
  'math-s3-ch05-kp01-ep01': 'a1000001-0001-4001-8001-000000005201',
  'math-s3-ch05-kp01-ep02': 'a1000001-0001-4001-8001-000000005202',
  'math-s3-ch05-kp02-ep01': 'a1000001-0001-4001-8001-000000005203',
  'math-s3-ch05-kp02-ep02': 'a1000001-0001-4001-8001-000000005204',
  'math-s3-ch06-kp01': 'a1000001-0001-4001-8001-000000006101',
  'math-s3-ch06-kp02': 'a1000001-0001-4001-8001-000000006102',
  'math-s3-ch06-kp01-ep01': 'a1000001-0001-4001-8001-000000006201',
  'math-s3-ch06-kp01-ep02': 'a1000001-0001-4001-8001-000000006202',
  'math-s3-ch06-kp02-ep01': 'a1000001-0001-4001-8001-000000006203',
  'math-s3-ch06-kp02-ep02': 'a1000001-0001-4001-8001-000000006204',
  'math-s3-ch06-kp02-ep03': 'a1000001-0001-4001-8001-000000006205',
  'math-s3-ch07-kp01': 'a1000001-0001-4001-8001-000000007101',
  'math-s3-ch07-kp02': 'a1000001-0001-4001-8001-000000007102',
  'math-s3-ch07-kp01-ep01': 'a1000001-0001-4001-8001-000000007201',
  'math-s3-ch07-kp01-ep02': 'a1000001-0001-4001-8001-000000007202',
  'math-s3-ch07-kp02-ep01': 'a1000001-0001-4001-8001-000000007203',
  'math-s3-ch07-kp02-ep02': 'a1000001-0001-4001-8001-000000007204',
  'math-s3-ch07-kp02-ep03': 'a1000001-0001-4001-8001-000000007205',
}

export const KNOWLEDGE_UUID_TO_CODE = Object.fromEntries(
  Object.entries(KNOWLEDGE_CODE_TO_UUID).map(([code, uuid]) => [uuid, code]),
)

export type KnowledgeTreeLevel = 'grade' | 'chapter' | 'knowledge_point' | 'exam_point'

export interface KnowledgeTreeNode {
  id: string
  uuid: string
  name: string
  level: KnowledgeTreeLevel
  subject: string
  grade?: string
  children: KnowledgeTreeNode[]
}

interface ExamPointJson { id: string; name: string; sortOrder: number }
interface KnowledgePointJson { id: string; name: string; sortOrder: number; examPoints: ExamPointJson[] }
interface ChapterJson { id: string; name: string; sortOrder: number; knowledgePoints: KnowledgePointJson[] }
interface GradeJson { id: string; name: string; sortOrder: number; chapters: ChapterJson[] }

function codeToUuid(code: string) {
  return KNOWLEDGE_CODE_TO_UUID[code] ?? code
}

function buildExamPoints(eps: ExamPointJson[], subject: string, grade: string): KnowledgeTreeNode[] {
  return eps.map((ep) => ({
    id: ep.id,
    uuid: codeToUuid(ep.id),
    name: ep.name,
    level: 'exam_point' as const,
    subject,
    grade,
    children: [],
  }))
}

function buildTreeFromJson(): KnowledgeTreeNode[] {
  const subject = treeData.subject as string
  const grades = (treeData.grades ?? []) as GradeJson[]
  return grades.map((g) => ({
    id: g.id,
    uuid: codeToUuid(g.id),
    name: g.name,
    level: 'grade' as const,
    subject,
    grade: g.name,
    children: g.chapters.map((ch) => ({
      id: ch.id,
      uuid: codeToUuid(ch.id),
      name: ch.name,
      level: 'chapter' as const,
      subject,
      grade: g.name,
      children: ch.knowledgePoints.map((kp) => ({
        id: kp.id,
        uuid: codeToUuid(kp.id),
        name: kp.name,
        level: 'knowledge_point' as const,
        subject,
        grade: g.name,
        children: buildExamPoints(kp.examPoints ?? [], subject, g.name),
      })),
    })),
  }))
}

export const SUBJECT_KNOWLEDGE_TREE = buildTreeFromJson()

export function flattenKnowledgeTree(nodes: KnowledgeTreeNode[] = SUBJECT_KNOWLEDGE_TREE): KnowledgeTreeNode[] {
  const out: KnowledgeTreeNode[] = []
  const walk = (list: KnowledgeTreeNode[]) => {
    for (const n of list) {
      out.push(n)
      if (n.children.length) walk(n.children)
    }
  }
  walk(nodes)
  return out
}

export function filterKnowledgeTreeBySubjectGrade(
  subject: string,
  grade?: string,
  nodes: KnowledgeTreeNode[] = SUBJECT_KNOWLEDGE_TREE,
): KnowledgeTreeNode[] {
  return nodes
    .filter((g) => g.subject === subject && (!grade || g.grade === grade))
    .map((g) => ({ ...g }))
}

export function resolveKnowledgePointLabels(ids: string[]): string[] {
  const flat = flattenKnowledgeTree()
  return ids.map((id) => {
    const node = flat.find((n) => n.uuid === id || n.id === id)
    return node?.name ?? id
  })
}

export function knowledgeIdsToLegacyString(ids: string[]): string {
  return resolveKnowledgePointLabels(ids).join(' / ')
}

export function selectableKnowledgeLevels(level: KnowledgeTreeLevel) {
  return level === 'knowledge_point' || level === 'exam_point'
}
