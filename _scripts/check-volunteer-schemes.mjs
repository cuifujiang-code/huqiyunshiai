import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

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

const { data: schemes } = await sb
  .from('volunteer_schemes')
  .select('scheme_id, scheme_name, rank, status')
  .order('updated_at', { ascending: false })
  .limit(8)

for (const s of schemes ?? []) {
  const { count } = await sb
    .from('volunteer_items')
    .select('*', { count: 'exact', head: true })
    .eq('scheme_id', s.scheme_id)
  console.log(`${s.scheme_name} | rank=${s.rank} | items=${count} | ${s.status}`)
}

const { count: zjPlans } = await sb
  .from('zhejiang_admission_plans')
  .select('*', { count: 'exact', head: true })
const { count: legacy } = await sb
  .from('college_admission_data')
  .select('*', { count: 'exact', head: true })
  .eq('province', '浙江')
console.log(`\nadmission: zhejiang_admission_plans=${zjPlans ?? 0}, college_admission_data(浙江)=${legacy ?? 0}`)
