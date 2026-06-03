import { getTeacherApiBase } from './apiBase'
import { postApiJson } from './postApiJson'

const TEACHER_API_BASE = getTeacherApiBase()

function catalogUrl(path: string) {
  return `${TEACHER_API_BASE}/api/catalog/${path.replace(/^\//, '')}`
}

export interface CatalogGroup {
  id: string
  name: string
  user_id: string
  created_at?: string
  updated_at?: string
}

export interface CatalogItem {
  id: string
  group_id: string
  name: string
  type?: string
  sort_order?: number
  question_count?: number
  created_at?: string
  updated_at?: string
}

async function callCatalog<T>(url: string, body: unknown, label: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'POST') {
  const r = await postApiJson<T>(url, body, label, { method, timeoutMs: 30000 })
  if (r.kind === 'success') return r.data
  throw new Error(r.reason)
}

export async function fetchCatalogGroups(userId: string) {
  const params = new URLSearchParams({ userId })
  const data = await callCatalog<{ success: boolean; groups: CatalogGroup[] }>(
    `${catalogUrl('groups')}?${params}`,
    null,
    '目录组列表',
    'GET',
  )
  return data.groups ?? []
}

export async function createCatalogGroup(userId: string, name: string) {
  const data = await callCatalog<{ success: boolean; group: CatalogGroup }>(
    catalogUrl('group'),
    { userId, name },
    '创建目录组',
  )
  return data.group
}

export async function renameCatalogGroup(id: string, name: string) {
  const data = await callCatalog<{ success: boolean; group: CatalogGroup }>(
    catalogUrl(`group/${id}`),
    { name },
    '重命名目录组',
    'PUT',
  )
  return data.group
}

export async function deleteCatalogGroup(id: string) {
  return callCatalog<{ success: boolean }>(catalogUrl(`group/${id}`), null, '删除目录组', 'DELETE')
}

export async function fetchCatalogItems(groupId: string) {
  const params = new URLSearchParams({ groupId })
  const data = await callCatalog<{ success: boolean; items: CatalogItem[] }>(
    `${catalogUrl('items')}?${params}`,
    null,
    '子目录列表',
    'GET',
  )
  return data.items ?? []
}

export async function createCatalogItem(groupId: string, name: string) {
  const data = await callCatalog<{ success: boolean; item: CatalogItem }>(
    catalogUrl('item'),
    { groupId, name },
    '创建子目录',
  )
  return data.item
}

export async function renameCatalogItem(id: string, name: string) {
  const data = await callCatalog<{ success: boolean; item: CatalogItem }>(
    catalogUrl(`item/${id}`),
    { name },
    '重命名子目录',
    'PUT',
  )
  return data.item
}

export async function deleteCatalogItem(id: string) {
  return callCatalog<{ success: boolean }>(catalogUrl(`item/${id}`), null, '删除子目录', 'DELETE')
}

export async function addQuestionToCatalog(questionId: string, catalogId: string) {
  return callCatalog(catalogUrl('add-question'), { questionId, catalogId }, '添加题目到目录')
}

export async function removeQuestionFromCatalog(questionId: string, catalogId: string) {
  return callCatalog(
    catalogUrl('remove-question'),
    { questionId, catalogId },
    '从目录移除题目',
    'DELETE',
  )
}

export async function fetchCatalogQuestionIds(catalogId: string) {
  const params = new URLSearchParams({ catalogId })
  const data = await callCatalog<{ success: boolean; questionIds: string[] }>(
    `${catalogUrl('question-ids')}?${params}`,
    null,
    '目录题目 ID',
    'GET',
  )
  return data.questionIds ?? []
}
