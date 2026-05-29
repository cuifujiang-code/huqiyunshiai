import { applyApiHeaders, handleOptions } from '../server/apiResponse.js'

export default function handler(req, res) {
  if (handleOptions(req, res)) return
  applyApiHeaders(req, res)
  res.status(200).json({ status: 'ok', message: 'Teacher API is running' })
}
