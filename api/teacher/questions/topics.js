import '../../../server/applyUrlShim.js'
import * as questionBank from '../../../server/teacher/questionBankStore.js'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: '仅支持 GET' })

  const teacherId = req.query?.teacherId
  if (!teacherId) return res.status(400).json({ success: false, message: '缺少 teacherId' })

  try {
    const subject = req.query?.subject || ''
    const grade = req.query?.grade || ''
    const result = await questionBank.listTopics(teacherId, subject || undefined, grade || undefined)
    return res.status(200).json({ success: true, ...result })
  } catch (err) {
    console.error('[questions/topics] 错误', err)
    return res.status(500).json({ success: false, message: err.message })
  }
}

export const config = { maxDuration: 15 }
