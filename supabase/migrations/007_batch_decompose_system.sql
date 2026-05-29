-- 大批量教育题库拆题系统（多用户、异步、LaTeX/几何图形）
-- 在 Supabase Dashboard → SQL Editor 中执行

-- 1. 批量任务表
CREATE TABLE IF NOT EXISTS public.batch_decompose_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id TEXT UNIQUE NOT NULL,
  teacher_id TEXT NOT NULL,
  file_name TEXT DEFAULT '',
  subject TEXT NOT NULL DEFAULT '数学',
  grade TEXT NOT NULL DEFAULT '八年级',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'partial')),
  total_items INT NOT NULL DEFAULT 0,
  completed_items INT NOT NULL DEFAULT 0,
  total_questions INT NOT NULL DEFAULT 0,
  imported_questions INT NOT NULL DEFAULT 0,
  error_message TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS batch_tasks_teacher_idx ON public.batch_decompose_tasks (teacher_id);
CREATE INDEX IF NOT EXISTS batch_tasks_status_idx ON public.batch_decompose_tasks (status);
CREATE INDEX IF NOT EXISTS batch_tasks_batch_id_idx ON public.batch_decompose_tasks (batch_id);

-- 2. 题目明细分块表（每块对应一次 AI 处理单元，支持 100～1000 题大批量）
CREATE TABLE IF NOT EXISTS public.batch_decompose_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id TEXT NOT NULL REFERENCES public.batch_decompose_tasks (batch_id) ON DELETE CASCADE,
  item_index INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  chunk_text TEXT NOT NULL,
  question_count INT NOT NULL DEFAULT 0,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (batch_id, item_index)
);

CREATE INDEX IF NOT EXISTS batch_items_batch_idx ON public.batch_decompose_items (batch_id);
CREATE INDEX IF NOT EXISTS batch_items_status_idx ON public.batch_decompose_items (status);

-- 3. 最终题库表（含 LaTeX 公式、几何/空间图形描述）
CREATE TABLE IF NOT EXISTS public.batch_question_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id TEXT NOT NULL,
  teacher_id TEXT NOT NULL,
  item_id UUID REFERENCES public.batch_decompose_items (id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  grade TEXT NOT NULL,
  knowledge_point TEXT DEFAULT '',
  question_type TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT '中等',
  content TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  answer TEXT DEFAULT '',
  analysis TEXT DEFAULT '',
  geometry_desc TEXT DEFAULT '',
  latex_blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  source TEXT NOT NULL DEFAULT '批量拆题',
  tags TEXT[] DEFAULT '{}',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS batch_qb_teacher_idx ON public.batch_question_bank (teacher_id);
CREATE INDEX IF NOT EXISTS batch_qb_batch_idx ON public.batch_question_bank (batch_id);
CREATE INDEX IF NOT EXISTS batch_qb_subject_idx ON public.batch_question_bank (subject);

-- RLS：仅通过 service_role API 访问，多用户隔离由 teacher_id 在 API 层强制校验
ALTER TABLE public.batch_decompose_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_decompose_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_question_bank ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_batch_tasks" ON public.batch_decompose_tasks FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "deny_direct_batch_items" ON public.batch_decompose_items FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "deny_direct_batch_qb" ON public.batch_question_bank FOR ALL USING (false) WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- 结构同步（可重复执行）：CREATE TABLE IF NOT EXISTS 不会给已存在的旧表补列，
-- 若线上库缺少 file_name / imported_questions / meta 等字段，执行以下语句即可修复。
-- 完整补丁亦见 supabase/migrations/008_batch_decompose_schema_sync.sql
-- ---------------------------------------------------------------------------

ALTER TABLE public.batch_decompose_tasks ADD COLUMN IF NOT EXISTS file_name TEXT DEFAULT '';
ALTER TABLE public.batch_decompose_tasks ADD COLUMN IF NOT EXISTS total_questions INT NOT NULL DEFAULT 0;
ALTER TABLE public.batch_decompose_tasks ADD COLUMN IF NOT EXISTS imported_questions INT NOT NULL DEFAULT 0;
ALTER TABLE public.batch_decompose_tasks ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.batch_decompose_tasks ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.batch_decompose_tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS question_count INT NOT NULL DEFAULT 0;
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS result JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'batch_decompose_tasks_status_check'
      AND conrelid = 'public.batch_decompose_tasks'::regclass
  ) THEN
    ALTER TABLE public.batch_decompose_tasks DROP CONSTRAINT batch_decompose_tasks_status_check;
  END IF;
END $$;

ALTER TABLE public.batch_decompose_tasks
  ADD CONSTRAINT batch_decompose_tasks_status_check
  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'partial'));
