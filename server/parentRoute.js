import { setNoCacheHeaders } from './apiResponse.js'
import {
  bindParentWithInviteCode,
  createStudentInviteCode,
  isParentBindingStoreConfigured,
  listBindingsForUser,
  unbindBinding,
} from './student/parentBindingStore.js'

function parseStudentId(body) {
  return body?.studentId?.trim() || body?.student_user_id?.trim() || ''
}

function parseParentBind(body) {
  return {
    parentId: body?.parentId?.trim() || body?.parent_user_id?.trim() || '',
    inviteCode: body?.inviteCode ?? body?.invite_code,
  }
}

async function handleGenerateInvite(req, res) {
  if (!isParentBindingStoreConfigured()) {
    return res.status(503).json({ success: false, message: '绑定服务未配置 Supabase' })
  }

  const studentId = parseStudentId(req.body ?? {})
  if (!studentId) {
    return res.status(400).json({ success: false, message: '缺少 studentId / student_user_id' })
  }

  try {
    const result = await createStudentInviteCode(studentId)
    return res.json({
      success: true,
      message: '邀请码已生成',
      ...result,
      code: result.inviteCode,
      expires_at: result.expiresAt,
    })
  } catch (error) {
    console.error('[generate-invite-code]', error)
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : '生成邀请码失败',
    })
  }
}

async function handleParentBind(req, res) {
  if (!isParentBindingStoreConfigured()) {
    return res.status(503).json({ success: false, message: '绑定服务未配置 Supabase' })
  }

  const { parentId, inviteCode } = parseParentBind(req.body ?? {})
  if (!parentId) return res.status(400).json({ success: false, message: '缺少 parentId / parent_user_id' })
  if (!inviteCode) return res.status(400).json({ success: false, message: '请输入邀请码' })

  try {
    const result = await bindParentWithInviteCode(parentId, inviteCode)
    return res.json({ success: true, ...result })
  } catch (error) {
    console.error('[parent/bind]', error)
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : '绑定失败',
    })
  }
}

export function registerParentRoutes(app) {
  app.post('/api/student/generate-invite-code', async (req, res) => {
    setNoCacheHeaders(res)
    return handleGenerateInvite(req, res)
  })

  app.post('/api/parent/generate-code', async (req, res) => {
    setNoCacheHeaders(res)
    return handleGenerateInvite(req, res)
  })

  app.post('/api/parent/bind', async (req, res) => {
    setNoCacheHeaders(res)
    return handleParentBind(req, res)
  })

  app.get('/api/parent/bindings', async (req, res) => {
    setNoCacheHeaders(res)
    const userId = String(req.query.user_id || req.query.userId || '').trim()
    const role = String(req.query.role || 'student').trim()
    if (!userId) return res.status(400).json({ success: false, message: '缺少 user_id' })

    try {
      const bindings = await listBindingsForUser(userId, role === 'parent' ? 'parent' : 'student')
      return res.json({ success: true, bindings })
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : '加载绑定列表失败',
      })
    }
  })

  app.get('/api/student/parent-bindings', async (req, res) => {
    setNoCacheHeaders(res)
    const studentId = String(req.query.studentId || req.query.user_id || '').trim()
    if (!studentId) return res.status(400).json({ success: false, message: '缺少 studentId' })
    try {
      const bindings = await listBindingsForUser(studentId, 'student')
      return res.json({ success: true, parents: bindings })
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : '加载失败',
      })
    }
  })

  app.get('/api/parent/children', async (req, res) => {
    setNoCacheHeaders(res)
    const parentId = String(req.query.parentId || req.query.parent_user_id || '').trim()
    if (!parentId) return res.status(400).json({ success: false, message: '缺少 parentId' })
    try {
      const bindings = await listBindingsForUser(parentId, 'parent')
      return res.json({ success: true, students: bindings })
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : '加载失败',
      })
    }
  })

  app.post('/api/parent/unbind', async (req, res) => {
    setNoCacheHeaders(res)
    const bindingId = req.body?.binding_id?.trim() || req.body?.bindingId?.trim()
    if (!bindingId) return res.status(400).json({ success: false, message: '缺少 binding_id' })
    try {
      await unbindBinding(bindingId)
      return res.json({ success: true, message: '已解除绑定' })
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : '解绑失败',
      })
    }
  })
}
