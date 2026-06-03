-- =============================================================================
-- 华祺云师AI · Supabase 手动合并迁移（一键执行版）
-- =============================================================================
-- 使用方式：Supabase Dashboard → SQL Editor → 粘贴本文件 → Run
-- 说明：各段使用 IF NOT EXISTS / DROP IF EXISTS，重复执行一般安全。
-- 建议：执行前在 Settings → Database 做一次备份；执行后核对末尾「验证查询」。
-- 对应功能：题库公域、后台管理、学生诊断/规划、拍照搜题
-- 生成日期：2026-06-03
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A. 题库可见性（讲义/辅导书/拍照搜题公域匹配依赖 visibility = 'public'）
-- 来源：supabase/migrations/013_question_visibility.sql
-- -----------------------------------------------------------------------------
ALTER TABLE public.teacher_question_bank ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'private';
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'private';

CREATE INDEX IF NOT EXISTS idx_teacher_question_bank_visibility ON public.teacher_question_bank(visibility);
CREATE INDEX IF NOT EXISTS idx_batch_question_bank_visibility ON public.batch_question_bank(visibility);

-- 兼容旧迁移 012 的 personal → private
UPDATE public.teacher_question_bank SET visibility = 'private' WHERE visibility IS NULL OR visibility = 'personal';
UPDATE public.batch_question_bank SET visibility = 'private' WHERE visibility IS NULL OR visibility = 'personal';

COMMENT ON COLUMN public.teacher_question_bank.visibility IS '题目可见性: private=个人题库, public=公域题库（拍照搜题可匹配）';
COMMENT ON COLUMN public.batch_question_bank.visibility IS '题目可见性: private=个人题库, public=公域题库（拍照搜题可匹配）';

-- -----------------------------------------------------------------------------
-- B. 后台管理（admin 角色、会员、收入）
-- 来源：supabase/migrations/014_admin_system.sql
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('teacher', 'student', 'admin'));

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE TABLE IF NOT EXISTS public.user_memberships (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  membership_type TEXT NOT NULL DEFAULT 'free'
    CHECK (membership_type IN ('free', 'teacher_monthly', 'teacher_yearly', 'student_per_use', 'student_yearly')),
  expires_at TIMESTAMPTZ,
  subscription_start TIMESTAMPTZ,
  per_use_diagnosis_credits INT NOT NULL DEFAULT 0,
  has_used_free_diagnosis BOOLEAN NOT NULL DEFAULT false,
  exam_generations_used INT NOT NULL DEFAULT 0,
  diagnosis_used INT NOT NULL DEFAULT 0,
  last_usage_reset_month TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_memberships_expires_idx ON public.user_memberships (expires_at);

CREATE TABLE IF NOT EXISTS public.payment_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  amount_cents INT NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  plan_id TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_records_created_idx ON public.payment_records (created_at DESC);

ALTER TABLE public.user_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin() OR auth.uid() = id);

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (public.is_admin());

DROP POLICY IF EXISTS "Users can view own membership" ON public.user_memberships;
CREATE POLICY "Users can view own membership"
  ON public.user_memberships FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage memberships" ON public.user_memberships;
CREATE POLICY "Admins manage memberships"
  ON public.user_memberships FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins manage payment records" ON public.payment_records;
CREATE POLICY "Admins manage payment records"
  ON public.payment_records FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- C. 学生端诊断与规划（趋势图、班级对比、任务勾选进度）
-- 来源：supabase/migrations/013_student_diagnosis_planning.sql
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.diagnosis_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id TEXT NOT NULL,
  student_name TEXT,
  exam_type TEXT,
  subject TEXT,
  score NUMERIC,
  full_score NUMERIC,
  grade_rank INTEGER,
  class_rank INTEGER,
  percentile NUMERIC DEFAULT 0,
  report_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diagnosis_records_user ON public.diagnosis_records(student_user_id);
CREATE INDEX IF NOT EXISTS idx_diagnosis_records_subject ON public.diagnosis_records(student_user_id, subject);
CREATE INDEX IF NOT EXISTS idx_diagnosis_records_created ON public.diagnosis_records(created_at DESC);

CREATE TABLE IF NOT EXISTS public.planning_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id TEXT,
  student_name TEXT,
  creator_user_id TEXT,
  created_by TEXT CHECK (created_by IN ('teacher', 'student')),
  report_title TEXT,
  phase_count INTEGER DEFAULT 0,
  subject TEXT,
  form_data JSONB,
  report_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planning_records_creator ON public.planning_records(creator_user_id);
CREATE INDEX IF NOT EXISTS idx_planning_records_student ON public.planning_records(student_user_id);
CREATE INDEX IF NOT EXISTS idx_planning_records_name ON public.planning_records(student_name);

CREATE TABLE IF NOT EXISTS public.planning_task_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id TEXT NOT NULL,
  student_user_id TEXT NOT NULL,
  phase_index INTEGER NOT NULL,
  task_index INTEGER NOT NULL,
  task_key TEXT NOT NULL,
  task_name TEXT DEFAULT '',
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  notes TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planning_task_progress_plan ON public.planning_task_progress(plan_id);
CREATE INDEX IF NOT EXISTS idx_planning_task_progress_user ON public.planning_task_progress(student_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_planning_task_progress_key
  ON public.planning_task_progress(plan_id, student_user_id, task_key);

-- 仅服务端 Service Role 读写（与题库表策略一致）
ALTER TABLE public.diagnosis_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planning_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planning_task_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_direct_diagnosis_records" ON public.diagnosis_records;
CREATE POLICY "deny_direct_diagnosis_records"
  ON public.diagnosis_records FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_direct_planning_records" ON public.planning_records;
CREATE POLICY "deny_direct_planning_records"
  ON public.planning_records FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_direct_planning_task_progress" ON public.planning_task_progress;
CREATE POLICY "deny_direct_planning_task_progress"
  ON public.planning_task_progress FOR ALL USING (false) WITH CHECK (false);

-- -----------------------------------------------------------------------------
-- D. 学生拍照搜题历史
-- 来源：supabase/migrations/015_student_photo_search_history.sql
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_photo_search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  image_name TEXT DEFAULT '',
  ocr_text TEXT NOT NULL DEFAULT '',
  question TEXT NOT NULL DEFAULT '',
  answer TEXT NOT NULL DEFAULT '',
  analysis TEXT NOT NULL DEFAULT '',
  knowledge_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  source TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('bank', 'ai')),
  bank_question_id TEXT,
  bank_table TEXT,
  matched_question JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_photo_search_user_created
  ON public.student_photo_search_history (user_id, created_at DESC);

COMMENT ON TABLE public.student_photo_search_history IS '学生拍照搜题历史（OCR + 题库匹配 + DeepSeek）';

ALTER TABLE public.student_photo_search_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_direct_photo_search" ON public.student_photo_search_history;
CREATE POLICY "deny_direct_photo_search"
  ON public.student_photo_search_history FOR ALL USING (false) WITH CHECK (false);

-- =============================================================================
-- 验证查询（执行后应均有结果，无报错即可）
-- =============================================================================
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'teacher_question_bank' AND column_name = 'visibility';
-- SELECT COUNT(*) AS admin_profiles FROM public.profiles WHERE role = 'admin';
-- SELECT to_regclass('public.diagnosis_records') AS diagnosis_records,
--        to_regclass('public.planning_task_progress') AS planning_task_progress,
--        to_regclass('public.student_photo_search_history') AS photo_search_history;

-- =============================================================================
-- 首次配置管理员（按需取消注释，替换为真实用户 UUID）
-- =============================================================================
-- UPDATE public.profiles SET role = 'admin' WHERE phone = '+8613800138000';
-- 或：UPDATE public.profiles SET role = 'admin' WHERE id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
