/**
 * 本机环境变量检查（不打印密钥值）
 * 用法：node _scripts/env-audit-local.mjs
 */
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnvFile(rel) {
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

const env = {
  ...loadEnvFile('.env'),
  ...loadEnvFile('.env.local'),
  ...loadEnvFile('teacher-api/.env'),
  ...loadEnvFile('teacher-api/.env.local'),
  ...process.env,
}

function check(name, level = 'must') {
  const val = env[name]?.trim()
  if (val) {
    console.log(`✅ ${name}`)
    return true
  }
  if (level === 'must') {
    console.log(`❌ ${name}（必填，缺失）`)
    return false
  }
  if (level === 'suggest') {
    console.log(`⚠️  ${name}（建议配置）`)
  } else {
    console.log(`○  ${name}（可选，未配置）`)
  }
  return level !== 'must'
}

console.log('\n========== 本机 / 根目录 .env ==========\n')
let ok = true
ok = check('VITE_SUPABASE_URL') && ok
ok = check('VITE_SUPABASE_ANON_KEY') && ok
ok = check('SUPABASE_SERVICE_ROLE_KEY') && ok
ok = check('DEEPSEEK_API_KEY') && ok
check('ALIBABA_ACCESS_KEY_ID', 'suggest')
check('ALIBABA_ACCESS_KEY_SECRET', 'suggest')
check('VITE_TEACHER_API_URL', 'suggest')

console.log('\n========== 拆题 / 拍照搜题（本地联调 teacher-api）==========\n')
check('TEACHER_API_URL', 'suggest')
check('DECOMPOSE_PROCESS_URL', 'suggest')

console.log('\n说明：')
console.log('- 本机 npm run dev 默认走 server/index.js（拆题路径为 /api/teacher/decompose-*）')
console.log('- 与线上一致测试：另开终端 cd teacher-api && node server.js，并设 VITE_TEACHER_API_URL=http://127.0.0.1:3001')
console.log(ok ? '\n结论：本机必填项齐全。' : '\n结论：请补全 .env 或 .env.local 后重试。')

process.exit(ok ? 0 : 1)
