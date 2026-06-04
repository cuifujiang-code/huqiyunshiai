import '../../server/applyUrlShim.js'
import { orchestrateAITask } from '../../server/aiOrchestrator.js'
import { applyApiHeaders, handleOptions } from '../../server/apiResponse.js'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyApiHeaders(req, res)

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  const { taskType, input } = req.body ?? {}
  if (!taskType) {
    return res.status(400).json({ success: false, message: '缺少 taskType' })
  }

  try {
    const outcome = await orchestrateAITask(taskType, input ?? {})
    const status = outcome.success ? 200 : 500
    return res.status(status).json(outcome)
  } catch (err) {
    console.error('[api/ai/orchestrate]', err)
    return res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : 'AI 编排失败',
    })
  }
}

export const config = {
  maxDuration: 120,
  api: { bodyParser: { sizeLimit: '20mb' } },
}
