import '../../server/applyUrlShim.js'
import { setNoCacheHeaders } from '../../server/apiResponse.js'
import {
  createStudentInviteCode,
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
  const studentId = body.studentId?.trim() || body.student_user_id?.trim()
  if (!studentId) {
    return res.status(400).json({ success: false, message: '缺少 studentId' })
  }

  try {
    const result = await createStudentInviteCode(studentId)
    return res.status(200).json({
      success: true,
      message: '邀请码已生成',
      ...result,
      code: result.inviteCode,
      expires_at: result.expiresAt,
    })
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : '生成邀请码失败',
    })
  }
}

export const config = { maxDuration: 30 }
