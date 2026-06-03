import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('未配置 Supabase 环境变量，将使用本地模拟登录模式')
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
)

export type UserRole = 'teacher' | 'student' | 'admin'

export interface Profile {
  id: string
  phone: string
  role: UserRole
  created_at: string
}
