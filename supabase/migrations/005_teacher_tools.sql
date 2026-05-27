-- 华祺云师AI · 教师端工具链数据表
-- 在 Supabase Dashboard → SQL Editor 中执行

-- 个人题库
CREATE TABLE IF NOT EXISTS public.teacher_question_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  grade TEXT NOT NULL,
  knowledge_point TEXT DEFAULT '',
  question_type TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT '中等',
  content TEXT NOT NULL,
  options JSONB DEFAULT '[]'::jsonb,
  answer TEXT DEFAULT '',
  analysis TEXT DEFAULT '',
  source TEXT NOT NULL DEFAULT '手动录入',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tqb_teacher_id_idx ON public.teacher_question_bank (teacher_id);
CREATE INDEX IF NOT EXISTS tqb_subject_idx ON public.teacher_question_bank (subject);
CREATE INDEX IF NOT EXISTS tqb_grade_idx ON public.teacher_question_bank (grade);
CREATE INDEX IF NOT EXISTS tqb_question_type_idx ON public.teacher_question_bank (question_type);

-- 备课方案
CREATE TABLE IF NOT EXISTS public.lesson_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id TEXT NOT NULL,
  title TEXT NOT NULL,
  objectives TEXT DEFAULT '',
  question_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lesson_plans_teacher_id_idx ON public.lesson_plans (teacher_id);

-- 讲义
CREATE TABLE IF NOT EXISTS public.handouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id TEXT NOT NULL,
  title TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('school', 'tutoring', 'targeted')),
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  student_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS handouts_teacher_id_idx ON public.handouts (teacher_id);

-- 辅导书
CREATE TABLE IF NOT EXISTS public.books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id TEXT NOT NULL,
  title TEXT NOT NULL,
  grade TEXT DEFAULT '',
  level TEXT DEFAULT '基础',
  chapters JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS books_teacher_id_idx ON public.books (teacher_id);

-- RLS：前端通过 API + service_role 访问
ALTER TABLE public.teacher_question_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_tqb" ON public.teacher_question_bank FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "deny_direct_lp" ON public.lesson_plans FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "deny_direct_handouts" ON public.handouts FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "deny_direct_books" ON public.books FOR ALL USING (false) WITH CHECK (false);
