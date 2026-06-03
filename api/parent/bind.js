import '../../server/applyUrlShim.js'
import { setNoCacheHeaders } from '../../server/apiResponse.js'
import {
  bindParentWithInviteCode,
  isParentBindingStoreConfigured,
} from '../../server/student/parentBindingStore.js'

export default async function handler(req, res) {
  setNoCacheHeaders(res)
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  if (!isParentBindingStoreConfigured()) {
    return res.status(503).json({ success: false, message: '绑定服务未配置 Supabase' })
  }

  const body = req.body ?? {}
  const parentId = body.parentId?.trim() || body.parent_user_id?.trim()
  const inviteCode = body.inviteCode ?? body.invite_code

  if (!parentId) return res.status(400).json({ success: false, message: '缺少 parentId' })
  if (!inviteCode) return res.status(400).json({ success: false, message: '请输入邀请码' })

  try {
    const result = await bindParentWithInviteCode(parentId, inviteCode)
    return res.status(200).json({ success: true, ...result })
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : '绑定失败',
    })
  }
}

export const config = { maxDuration: 30 }
