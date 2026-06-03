import type { PhotoSearchHistoryItem, PhotoSearchResult } from '../types/photoSearch'
import { postApiJson } from './postApiJson'

export const PHOTO_SEARCH_API = '/api/student/photo-search'
export const PHOTO_SEARCH_HISTORY_API = '/api/student/photo-search-history'

const SEARCH_TIMEOUT_MS = 65_000

export interface PhotoSearchResponse {
  success: boolean
  message?: string
  result?: PhotoSearchResult
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

export async function submitPhotoSearch(params: {
  userId?: string
  imageBase64: string
  imageName: string
}): Promise<PhotoSearchResponse> {
  const r = await postApiJson<PhotoSearchResponse>(
    PHOTO_SEARCH_API,
    {
      userId: params.userId,
      imageBase64: params.imageBase64,
      imageName: params.imageName,
    },
    '拍照搜题',
    { timeoutMs: SEARCH_TIMEOUT_MS },
  )

  if (r.kind === 'success') return r.data
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
