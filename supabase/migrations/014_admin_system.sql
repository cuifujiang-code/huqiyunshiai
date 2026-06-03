-- 华祺云师AI · 后台管理权限与会员数据

-- 1. profiles.role 增加 admin
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('teacher', 'student', 'admin'));

-- 2. 判断当前用户是否为管理员
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

-- 3. 用户会员表（服务端与管理员维护）
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

-- 4. 收入记录（用于统计今日收入）
CREATE TABLE IF NOT EXISTS public.payment_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  amount_cents INT NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  plan_id TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_records_created_idx ON public.payment_records (created_at DESC);

-- 5. RLS
ALTER TABLE public.user_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_records ENABLE ROW LEVEL SECURITY;

-- profiles：管理员可查看全部用户
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin() OR auth.uid() = id);

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (public.is_admin());

-- user_memberships：用户只看自己，管理员可管理
DROP POLICY IF EXISTS "Users can view own membership" ON public.user_memberships;
CREATE POLICY "Users can view own membership"
  ON public.user_memberships FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage memberships" ON public.user_memberships;
CREATE POLICY "Admins manage memberships"
  ON public.user_memberships FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- payment_records：仅管理员
DROP POLICY IF EXISTS "Admins manage payment records" ON public.payment_records;
CREATE POLICY "Admins manage payment records"
  ON public.payment_records FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
