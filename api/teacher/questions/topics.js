import '../../../server/applyUrlShim.js'
import * as questionBank from '../../../server/teacher/questionBankStore.js'
import { setNoCacheHeaders } from '../../../server/apiResponse.js'

export default async function handler(req, res) {
  setNoCacheHeaders(res)
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: '仅支持 GET' })

  const teacherId = req.query?.teacherId
  if (!teacherId) return res.status(400).json({ success: false, message: '缺少 teacherId' })

  try {
    const subject = req.query?.subject || ''
    const topics = await questionBank.listTopics(teacherId, subject || undefined)
    return res.status(200).json({ success: true, topics })
  } catch (err) {
    console.error('[questions/topics] 错误', err)
    return res.status(500).json({ success: false, message: err.message })
  }
}

export const config = { maxDuration: 15 }
