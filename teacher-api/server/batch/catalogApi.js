import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin.js'

const GROUPS = 'catalog_group'
const ITEMS = 'catalog_item'
const QUESTION_CATALOG = 'question_catalog'

function nowIso() {
  return new Date().toISOString()
}

function getPathname(req) {
  if (typeof req.url !== 'string' || !req.url) return '/'
  try {
    const host = req.headers?.host || 'localhost'
    const proto = req.headers?.['x-forwarded-proto'] === 'https' ? 'https' : 'http'
    return new URL(req.url, `${proto}://${host}`).pathname
  } catch {
    return req.url.split('?')[0] || '/'
  }
}

function resolveCatalogSegments(req) {
  const rawPath = req.query?.path
  if (Array.isArray(rawPath)) return rawPath.map(String).filter(Boolean)
  if (typeof rawPath === 'string' && rawPath) return rawPath.split('/').filter(Boolean)
  const pathname = getPathname(req)
  const match = pathname.match(/^\/api\/catalog\/?(.*)$/)
  return (match?.[1] || '').split('/').filter(Boolean)
}

function json(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  return res.status(status).json(payload)
}

function requireString(value, label) {
  const s = value == null ? '' : String(value).trim()
  if (!s) throw new Error(`缺少 ${label}`)
  return s
}

/** 目录组 CRUD */
async function createCatalogGroup(body) {
  const admin = getSupabaseAdmin()
  const name = requireString(body?.name, 'name')
  const userId = requireString(body?.userId ?? body?.user_id, 'userId')
  const { data, error } = await admin
    .from(GROUPS)
    .insert({ name, user_id: userId, updated_at: nowIso() })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

async function listCatalogGroups(userId) {
  const admin = getSupabaseAdmin()
  const uid = requireString(userId, 'userId')
  const { data, error } = await admin
    .from(GROUPS)
    .select('*')
    .eq('user_id', uid)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

async function renameCatalogGroup(id, name) {
  const admin = getSupabaseAdmin()
  const groupId = requireString(id, 'id')
  const groupName = requireString(name, 'name')
  const { data, error } = await admin
    .from(GROUPS)
    .update({ name: groupName, updated_at: nowIso() })
    .eq('id', groupId)
    .select('*')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('目录组不存在')
  return data
}

async function deleteCatalogGroup(id) {
  const admin = getSupabaseAdmin()
  const groupId = requireString(id, 'id')
  const { data, error } = await admin
    .from(GROUPS)
    .delete()
    .eq('id', groupId)
    .select('id')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('目录组不存在')
  return { id: groupId, deleted: true }
}

/** 子目录 CRUD */
async function createCatalogItem(body) {
  const admin = getSupabaseAdmin()
  const groupId = requireString(body?.groupId ?? body?.group_id, 'groupId')
  const name = requireString(body?.name, 'name')

  const { data: lastItem } = await admin
    .from(ITEMS)
    .select('sort_order')
    .eq('group_id', groupId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const sortOrder = (Number(lastItem?.sort_order) || 0) + 1
  const { data, error } = await admin
    .from(ITEMS)
    .insert({
      group_id: groupId,
      name,
      type: body?.type || 'folder',
      sort_order: sortOrder,
      updated_at: nowIso(),
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

async function listCatalogItems(groupId) {
  const admin = getSupabaseAdmin()
  const gid = requireString(groupId, 'groupId')
  const { data, error } = await admin
    .from(ITEMS)
    .select('*')
    .eq('group_id', gid)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  const items = data ?? []
  const withCounts = await Promise.all(items.map(async (item) => {
    const { count, error: countErr } = await admin
      .from(QUESTION_CATALOG)
      .select('*', { count: 'exact', head: true })
      .eq('catalog_id', item.id)
    if (countErr) return { ...item, question_count: 0 }
    return { ...item, question_count: count ?? 0 }
  }))
  return withCounts
}

async function renameCatalogItem(id, name) {
  const admin = getSupabaseAdmin()
  const itemId = requireString(id, 'id')
  const itemName = requireString(name, 'name')
  const { data, error } = await admin
    .from(ITEMS)
    .update({ name: itemName, updated_at: nowIso() })
    .eq('id', itemId)
    .select('*')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('子目录不存在')
  return data
}

async function listCatalogQuestionIds(catalogId) {
  const admin = getSupabaseAdmin()
  const cid = requireString(catalogId, 'catalogId')
  const { data, error } = await admin
    .from(QUESTION_CATALOG)
    .select('question_id')
    .eq('catalog_id', cid)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => row.question_id)
}

async function deleteCatalogItem(id) {
  const admin = getSupabaseAdmin()
  const itemId = requireString(id, 'id')
  const { data, error } = await admin
    .from(ITEMS)
    .delete()
    .eq('id', itemId)
    .select('id')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('子目录不存在')
  return { id: itemId, deleted: true }
}

/** 题目与目录关联 */
async function addQuestionToCatalog(body) {
  const admin = getSupabaseAdmin()
  const questionId = requireString(body?.questionId ?? body?.question_id, 'questionId')
  const catalogId = requireString(body?.catalogId ?? body?.catalog_id, 'catalogId')
  const { data, error } = await admin
    .from(QUESTION_CATALOG)
    .upsert({ question_id: questionId, catalog_id: catalogId }, { onConflict: 'question_id,catalog_id' })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

async function removeQuestionFromCatalog(body) {
  const admin = getSupabaseAdmin()
  const questionId = requireString(body?.questionId ?? body?.question_id, 'questionId')
  const catalogId = requireString(body?.catalogId ?? body?.catalog_id, 'catalogId')
  const { data, error } = await admin
    .from(QUESTION_CATALOG)
    .delete()
    .eq('question_id', questionId)
    .eq('catalog_id', catalogId)
    .select('*')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('关联不存在')
  return { questionId, catalogId, removed: true }
}

/**
 * 题库目录 API 路由入口
 * POST   /api/catalog/group
 * GET    /api/catalog/groups?userId=
 * PUT    /api/catalog/group/:id
 * DELETE /api/catalog/group/:id
 * POST   /api/catalog/item
 * GET    /api/catalog/items?groupId=
 * DELETE /api/catalog/item/:id
 * POST   /api/catalog/add-question
 * DELETE /api/catalog/remove-question
 */
export async function handleCatalogRequest(req, res) {
  if (!isSupabaseAdminConfigured()) {
    return json(res, 503, {
      success: false,
      message: 'Supabase 未配置：请设置 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY',
    })
  }

  const segments = resolveCatalogSegments(req)
  const resource = segments[0] || ''
  const resourceId = segments[1] || ''
  const method = req.method?.toUpperCase() || 'GET'

  console.log('[catalogApi] 路由', { method, segments, url: req.url })

  try {
    // POST /api/catalog/group
    if (method === 'POST' && resource === 'group' && !resourceId) {
      const group = await createCatalogGroup(req.body ?? {})
      return json(res, 201, { success: true, group })
    }

    // GET /api/catalog/groups
    if (method === 'GET' && resource === 'groups') {
      const groups = await listCatalogGroups(req.query?.userId)
      return json(res, 200, { success: true, groups })
    }

    // PUT /api/catalog/group/:id
    if (method === 'PUT' && resource === 'group' && resourceId) {
      const group = await renameCatalogGroup(resourceId, req.body?.name)
      return json(res, 200, { success: true, group })
    }

    // DELETE /api/catalog/group/:id
    if (method === 'DELETE' && resource === 'group' && resourceId) {
      const result = await deleteCatalogGroup(resourceId)
      return json(res, 200, { success: true, ...result })
    }

    // POST /api/catalog/item
    if (method === 'POST' && resource === 'item' && !resourceId) {
      const item = await createCatalogItem(req.body ?? {})
      return json(res, 201, { success: true, item })
    }

    // GET /api/catalog/items
    if (method === 'GET' && resource === 'items') {
      const items = await listCatalogItems(req.query?.groupId)
      return json(res, 200, { success: true, items })
    }

    // GET /api/catalog/question-ids?catalogId=
    if (method === 'GET' && resource === 'question-ids') {
      const questionIds = await listCatalogQuestionIds(req.query?.catalogId)
      return json(res, 200, { success: true, questionIds })
    }

    // PUT /api/catalog/item/:id
    if (method === 'PUT' && resource === 'item' && resourceId) {
      const item = await renameCatalogItem(resourceId, req.body?.name)
      return json(res, 200, { success: true, item })
    }

    // DELETE /api/catalog/item/:id
    if (method === 'DELETE' && resource === 'item' && resourceId) {
      const result = await deleteCatalogItem(resourceId)
      return json(res, 200, { success: true, ...result })
    }

    // POST /api/catalog/add-question
    if (method === 'POST' && resource === 'add-question') {
      const link = await addQuestionToCatalog(req.body ?? {})
      return json(res, 201, { success: true, link })
    }

    // DELETE /api/catalog/remove-question
    if (method === 'DELETE' && resource === 'remove-question') {
      const result = await removeQuestionFromCatalog(req.body ?? req.query ?? {})
      return json(res, 200, { success: true, ...result })
    }

    return json(res, 404, {
      success: false,
      message: `未知 catalog 路由: ${method} /api/catalog/${segments.join('/')}`,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[catalogApi] 处理失败', { method, segments, msg })
    const status = /不存在|缺少/.test(msg) ? 400 : 500
    return json(res, status, { success: false, message: msg })
  }
}
