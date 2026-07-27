import type { PaperCategory, PaperFilters, PaperItem } from '../types/paper'

const API = '/api/papers'

function qs(params: Record<string, string | number | boolean | undefined>) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '' || v === false) continue
    sp.set(k, String(v))
  }
  return sp.toString()
}

async function parseJson(res: Response) {
  const data = await res.json()
  if (!res.ok || data.success === false) throw new Error(data.message || res.statusText)
  return data
}

export async function fetchPaperCategories(grade?: string): Promise<PaperCategory[]> {
  const q = grade && grade !== '不限' ? `?grade=${encodeURIComponent(grade)}` : ''
  const res = await fetch(`${API}/categories${q}`)
  const data = await parseJson(res)
  return data.categories ?? []
}

export async function fetchPapers(
  userId: string,
  filters: Partial<PaperFilters> & { page?: number; pageSize?: number },
) {
  const query = qs({
    userId,
    page: filters.page ?? 1,
    pageSize: filters.pageSize ?? 10,
    grade: filters.grade,
    exam_year: filters.exam_year,
    area: filters.area,
    level: filters.level,
    category_id: filters.category_id,
    set_type: filters.set_type,
    has_answer: filters.has_answer || undefined,
    has_analysis: filters.has_analysis || undefined,
    keyword: filters.keyword,
    subject: filters.subject,
    file_type: filters.file_type !== '不限' ? filters.file_type : undefined,
    sort: filters.sort,
    my_uploads: filters.my_uploads || undefined,
  })
  const res = await fetch(`${API}?${query}`)
  return parseJson(res) as Promise<{ items: PaperItem[]; total: number; page: number; pageSize: number }>
}

export async function fetchPaperDetail(userId: string, id: string) {
  const res = await fetch(`${API}/${id}?userId=${encodeURIComponent(userId)}`)
  const data = await parseJson(res)
  return data.paper as PaperItem
}

const PAPER_MAX_MB = 50
const PAPER_MAX_BYTES = PAPER_MAX_MB * 1024 * 1024

export async function uploadPaper(userId: string, payload: Record<string, unknown>, file: File, onProgress?: (p: number) => void) {
  if (file.size > PAPER_MAX_BYTES) {
    throw new Error(`文件超过 ${PAPER_MAX_MB}MB 限制，请压缩后重试`)
  }
  const base64 = await fileToBase64(file, onProgress)
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, ...payload, fileBase64: base64, fileName: file.name }),
  })
  const data = await parseJson(res)
  return data.paper as PaperItem
}

export async function uploadPapersBatch(
  userId: string,
  items: { file: File; payload: Record<string, unknown> }[],
  callbacks?: {
    onFileStart?: (index: number) => void
    onFileProgress?: (index: number, percent: number) => void
    onFileDone?: (index: number, ok: boolean, message?: string) => void
  },
): Promise<{ success: number; failed: number }> {
  let success = 0
  let failed = 0
  for (let i = 0; i < items.length; i++) {
    const { file, payload } = items[i]
    callbacks?.onFileStart?.(i)
    try {
      if (file.size > PAPER_MAX_BYTES) {
        throw new Error(`超过 ${PAPER_MAX_MB}MB`)
      }
      await uploadPaper(userId, payload, file, (p) => callbacks?.onFileProgress?.(i, p))
      success++
      callbacks?.onFileDone?.(i, true)
    } catch (e) {
      failed++
      callbacks?.onFileDone?.(i, false, e instanceof Error ? e.message : '上传失败')
    }
  }
  return { success, failed }
}

export async function updatePaper(userId: string, id: string, patch: Partial<PaperItem>) {
  const res = await fetch(`${API}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, ...patch }),
  })
  return parseJson(res)
}

export async function deletePaper(userId: string, id: string) {
  const res = await fetch(`${API}/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  })
  return parseJson(res)
}

export async function togglePaperCollect(userId: string, paperId: string, collect: boolean) {
  const res = await fetch(`${API}/${paperId}/collect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, collect }),
  })
  return parseJson(res)
}

export async function downloadPaper(userId: string, paperId: string) {
  const res = await fetch(`${API}/${paperId}/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  })
  const data = await parseJson(res)
  return data as { url: string; fileName: string }
}

export async function fetchPaperCollection(userId: string) {
  const res = await fetch(`${API}/collection?userId=${encodeURIComponent(userId)}`)
  const data = await parseJson(res)
  return (data.items ?? []) as PaperItem[]
}

function fileToBase64(file: File, onProgress?: (p: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const b64 = result.includes(',') ? result.split(',')[1] : result
      resolve(b64)
    }
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}
