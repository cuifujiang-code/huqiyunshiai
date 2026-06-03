import '../../server/applyUrlShim.js'
import { setNoCacheHeaders } from '../../server/apiResponse.js'
import { listBindingsForUser } from '../../server/student/parentBindingStore.js'

export default async function handler(req, res) {
  setNoCacheHeaders(res)
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }
  const studentId = String(req.query.studentId || '').trim()
  if (!studentId) return res.status(400).json({ success: false, message: '缺少 studentId' })
  try {
    const bindings = await listBindingsForUser(studentId, 'student')
    return res.status(200).json({ success: true, bindings, parents: bindings })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '加载失败',
    })
  }
}

export const config = { maxDuration: 30 }
