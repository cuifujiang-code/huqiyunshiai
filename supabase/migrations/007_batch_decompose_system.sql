-- 大批量教育题库拆题系统（多用户、异步、LaTeX/几何图形）
-- 在 Supabase Dashboard → SQL Editor 中执行
--
-- 字段与 teacher-api/server/batch/batchTaskStore.js 及 api/batch/*.js 对齐。
-- 线上已有旧表时，请再执行 008_batch_decompose_schema_sync.sql 做全量对齐。

-- =============================================================================
-- 1. batch_decompose_tasks（批量任务主表）
-- =============================================================================
-- 代码 INSERT/UPDATE 字段：
--   batch_id, teacher_id, file_name, subject, grade, status,
--   total_items, completed_items, total_questions, imported_questions,
--   meta, error_message, updated_at
-- 扩展字段：
--   file_size（上传文件字节数，可与 meta.textLength 对应）
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.batch_decompose_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id TEXT UNIQUE NOT NULL,
  teacher_id TEXT NOT NULL,
  file_name TEXT NOT NULL DEFAULT '',
  file_size INT NOT NULL DEFAULT 0,
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

CREATE UNIQUE INDEX IF NOT EXISTS batch_tasks_batch_id_idx ON public.batch_decompose_tasks (batch_id);
CREATE INDEX IF NOT EXISTS batch_tasks_teacher_idx ON public.batch_decompose_tasks (teacher_id);
CREATE INDEX IF NOT EXISTS batch_tasks_status_idx ON public.batch_decompose_tasks (status);

-- =============================================================================
-- 2. batch_decompose_items（分块拆题明细表）
-- =============================================================================
-- 代码 INSERT/UPDATE 字段：
--   batch_id, item_index, status, chunk_text, question_count,
--   result, error_message, updated_at
-- 注意：代码使用 item_index，非遗留列 chunk_index
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.batch_decompose_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id TEXT NOT NULL REFERENCES public.batch_decompose_tasks (batch_id) ON DELETE CASCADE,
  item_index INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  chunk_text TEXT NOT NULL DEFAULT '',
  question_count INT NOT NULL DEFAULT 0,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (batch_id, item_index)
);

CREATE INDEX IF NOT EXISTS batch_items_batch_idx ON public.batch_decompose_items (batch_id);
CREATE INDEX IF NOT EXISTS batch_items_status_idx ON public.batch_decompose_items (status);

-- =============================================================================
-- 3. batch_question_bank（拆题结果题库，供进度查询 withQuestions 使用）
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.batch_question_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id TEXT NOT NULL,
  teacher_id TEXT NOT NULL,
  item_id UUID REFERENCES public.batch_decompose_items (id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  grade TEXT NOT NULL,
  knowledge_point TEXT NOT NULL DEFAULT '',
  question_type TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT '中等',
  content TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  answer TEXT NOT NULL DEFAULT '',
  analysis TEXT NOT NULL DEFAULT '',
  geometry_desc TEXT NOT NULL DEFAULT '',
  latex_blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  source TEXT NOT NULL DEFAULT '批量拆题',
  tags TEXT[] NOT NULL DEFAULT '{}',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS batch_qb_teacher_idx ON public.batch_question_bank (teacher_id);
CREATE INDEX IF NOT EXISTS batch_qb_batch_idx ON public.batch_question_bank (batch_id);
CREATE INDEX IF NOT EXISTS batch_qb_subject_idx ON public.batch_question_bank (subject);

-- =============================================================================
-- RLS：仅通过 service_role API 访问，多用户隔离由 teacher_id 在 API 层强制校验
-- =============================================================================
ALTER TABLE public.batch_decompose_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_decompose_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_question_bank ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_direct_batch_tasks" ON public.batch_decompose_tasks;
CREATE POLICY "deny_direct_batch_tasks" ON public.batch_decompose_tasks FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_direct_batch_items" ON public.batch_decompose_items;
CREATE POLICY "deny_direct_batch_items" ON public.batch_decompose_items FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_direct_batch_qb" ON public.batch_question_bank;
CREATE POLICY "deny_direct_batch_qb" ON public.batch_question_bank FOR ALL USING (false) WITH CHECK (false);
