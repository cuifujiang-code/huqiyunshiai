import type { PhotoSearchHistoryItem, PhotoSearchResult, SearchStatus } from '../types/photoSearch'
import { postApiJson } from './postApiJson'

export const PHOTO_SEARCH_API = '/api/student/photo-search'
export const PHOTO_SEARCH_HISTORY_API = '/api/student/photo-search-history'

const SEARCH_TIMEOUT_MS = 65_000

export interface PhotoSearchResponse {
  success: boolean
  message?: string
  result?: PhotoSearchResult
  searchStatus?: SearchStatus
}

export interface PhotoSearchHistoryResponse {
  success: boolean
  message?: string
  items?: PhotoSearchHistoryItem[]
  total?: number
  page?: number
  pageSize?: number
  item?: PhotoSearchHistoryItem
}

/**
 * 判断是否为网络层错误（fetch 失败、超时、CORS 等）
 * 区别于服务器返回的 HTTP 错误（500 等）
 */
function isNetworkError(reason: string): boolean {
  return (
    reason.includes('网络错误') ||
    reason.includes('NetworkError') ||
    reason.includes('Failed to fetch') ||
    reason.includes('请求超时') ||
    reason.includes('AbortError') ||
    reason.includes('ERR_')
  )
}

export async function submitPhotoSearch(params: {
  userId?: string
  imageBase64: string
  imageName: string
  editedOcrText?: string
  /** 浏览器 Tesseract 识别文本（第三层降级，跳过服务端 OCR/视觉） */
  clientOcrText?: string
}): Promise<PhotoSearchResponse> {
  const r = await postApiJson<PhotoSearchResponse>(
    PHOTO_SEARCH_API,
    {
      userId: params.userId,
      imageBase64: params.imageBase64,
      imageName: params.imageName,
      editedOcrText: params.editedOcrText,
      clientOcrText: params.clientOcrText,
    },
    '拍照搜题',
    { timeoutMs: SEARCH_TIMEOUT_MS },
  )

  if (r.kind === 'success') return r.data

  // 网络层错误 → network_error
  if (isNetworkError(r.reason)) {
    return { success: false, message: '网络连接失败，请检查网络后重试', searchStatus: 'network_error' }
  }

  return { success: false, message: r.reason }
}

export async function fetchPhotoSearchHistory(
  userId: string,
  page = 1,
): Promise<PhotoSearchHistoryResponse> {
  const url = `${PHOTO_SEARCH_HISTORY_API}?userId=${encodeURIComponent(userId)}&page=${page}&pageSize=20`
  const r = await postApiJson<PhotoSearchHistoryResponse>(url, null, '搜题历史', {
    method: 'GET',
    timeoutMs: 15_000,
  })

  if (r.kind === 'success') return r.data
  return { success: false, message: r.reason, items: [] }
}
