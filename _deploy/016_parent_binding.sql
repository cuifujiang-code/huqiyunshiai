-- 家长绑定（执行一次）— 与 supabase/migrations/016_parent_binding.sql 相同

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('teacher', 'student', 'admin', 'parent'));

CREATE TABLE IF NOT EXISTS public.student_invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_invite_codes_student ON public.student_invite_codes(student_id);
CREATE INDEX IF NOT EXISTS idx_student_invite_codes_code ON public.student_invite_codes(code);

CREATE TABLE IF NOT EXISTS public.student_parent_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, parent_id)
);

CREATE INDEX IF NOT EXISTS idx_bindings_student ON public.student_parent_bindings(student_id);
CREATE INDEX IF NOT EXISTS idx_bindings_parent ON public.student_parent_bindings(parent_id);

ALTER TABLE public.student_invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_parent_bindings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_direct_invite_codes" ON public.student_invite_codes;
CREATE POLICY "deny_direct_invite_codes" ON public.student_invite_codes FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_direct_parent_bindings" ON public.student_parent_bindings;
CREATE POLICY "deny_direct_parent_bindings" ON public.student_parent_bindings FOR ALL USING (false) WITH CHECK (false);
