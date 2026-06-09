/**
 * 高考志愿填报 — 前端 API 封装
 */

import { buildTeacherRootApiUrl } from './apiBase'
import type {
  GenerateVolunteerResponse,
  SchemesListResponse,
  SchemeDetailResponse,
  VolunteerFormInput,
  VolunteerItem,
} from '../types/volunteer'

async function apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(buildTeacherRootApiUrl(path))
  if (params) {
    Object.entries(params).forEach(([k, v]) => { if (v) url.searchParams.set(k, v) })
  }
  const r = await fetch(url.toString(), { headers: { 'Content-Type': 'application/json' } })
  return r.json()
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(buildTeacherRootApiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return r.json()
}

async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(buildTeacherRootApiUrl(path), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return r.json()
}

export async function generateVolunteerScheme(
  userId: string,
  input: VolunteerFormInput,
): Promise<GenerateVolunteerResponse> {
  return apiPost('/volunteer/generate', { userId, ...input })
}

export async function fetchVolunteerSchemes(userId: string): Promise<SchemesListResponse> {
  return apiGet('/volunteer/schemes', { userId })
}

export async function fetchVolunteerScheme(
  schemeId: string,
  userId?: string,
): Promise<SchemeDetailResponse> {
  return apiGet(`/volunteer/scheme/${schemeId}`, userId ? { userId } : undefined)
}

export async function updateVolunteerScheme(
  schemeId: string,
  userId: string,
  payload: { schemeName?: string; status?: string; items?: VolunteerItem[] },
): Promise<SchemeDetailResponse> {
  return apiPut(`/volunteer/scheme/${schemeId}`, { userId, ...payload })
}
