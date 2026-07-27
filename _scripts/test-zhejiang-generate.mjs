import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { generateZhejiangRecommendations } from '../teacher-api/server/volunteer/zhejiang/recommendEngine.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv(rel) {
  const p = join(root, rel)
  if (!existsSync(p)) return {}
  const out = {}
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 1) continue
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return out
}

const env = { ...loadEnv('.env'), ...loadEnv('.env.local'), ...process.env }
const sb = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const { data } = await sb
  .from('college_admission_data')
  .select('*')
  .eq('province', '浙江')
  .eq('subject_type', '物理类')
  .eq('batch_type', '本科')

const input = {
  province: '浙江',
  subjectType: '物理类',
  subjects: ['物理', '化学', '生物'],
  rank: 45001,
  batchSegment: '一段',
  examYear: 2025,
  intendedMajors: ['计算机', '工程', '机械'],
}

try {
  const result = generateZhejiangRecommendations(data ?? [], input)
  console.log('rows in:', data?.length, 'items out:', result.items.length, result.summary)
} catch (e) {
  console.error('error:', e.message)
}
