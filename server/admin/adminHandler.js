import { isSupabaseAdminConfigured } from '../supabaseAdmin.js'
import { AdminAuthError, requireAdmin } from './adminAuth.js'
import {
  getAdminStats,
  giftMembershipDays,
  listUsers,
  setMembershipExpiry,
} from './adminStore.js'

function notConfigured(res) {
  return res.status(503).json({ success: false, message: '请配置 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY' })
}

export async function handleAdminApi(req, res, pathSegments = []) {
  const method = req.method
  const path = pathSegments.filter(Boolean).join('/')

  if (!isSupabaseAdminConfigured()) return notConfigured(res)

  try {
    await requireAdmin(req)
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return res.status(err.status).json({ success: false, message: err.message })
    }
    console.error('[adminApi] auth', err)
    return res.status(500).json({ success: false, message: '鉴权失败' })
  }

  try {
    if (path === 'stats' && method === 'GET') {
      const stats = await getAdminStats()
      return res.status(200).json({ success: true, stats })
    }

    if (path === 'users' && method === 'GET') {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1)
      const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize, 10) || 20))
      const keyword = req.query.keyword ?? ''
      const result = await listUsers({ page, pageSize, keyword })
      return res.status(200).json({ success: true, ...result })
    }

    const membershipMatch = path.match(/^users\/([^/]+)\/membership$/)
    if (membershipMatch && method === 'PUT') {
      const userId = membershipMatch[1]
      const { expiresAt, membershipType } = req.body ?? {}
      const data = await setMembershipExpiry(userId, expiresAt ?? null, membershipType)
      return res.status(200).json({ success: true, membership: data })
    }

    const giftMatch = path.match(/^users\/([^/]+)\/gift-days$/)
    if (giftMatch && method === 'POST') {
      const userId = giftMatch[1]
      const { days, membershipType } = req.body ?? {}
      if (!days || Number(days) < 1) {
        return res.status(400).json({ success: false, message: '请提供有效的赠送天数' })
      }
      const data = await giftMembershipDays(userId, days, membershipType)
      return res.status(200).json({ success: true, membership: data })
    }

    return res.status(404).json({ success: false, message: `未知路由: admin/${path || '(empty)'}` })
  } catch (error) {
    console.error('[adminApi]', path, error)
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '服务器错误',
    })
  }
}
