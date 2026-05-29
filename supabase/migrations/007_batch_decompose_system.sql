-- =============================================================================
-- 大批量拆题系统 · 建表脚本（Supabase SQL Editor 可直接执行）
-- =============================================================================
-- 字段来源：teacher-api/api/batch/*.js → server/batch/batchTaskStore.js
--
-- batch_decompose_tasks
--   INSERT : batch_id, teacher_id, file_name, subject, grade, status,
--            total_items, completed_items, total_questions, imported_questions,
--            meta, updated_at
--   UPDATE : status, completed_items, total_questions, imported_questions,
--            error_message, updated_at
--   SELECT : 上述字段 + created_at（listBatchTasksByTeacher 排序）
--
-- batch_decompose_items
--   INSERT : batch_id, item_index, status, chunk_text, question_count, result, updated_at
--   UPDATE : status, question_count, result, error_message, updated_at
--   SELECT : id, batch_id, item_index, status, chunk_text, question_count, result,
--            error_message, created_at, updated_at
--
-- 线上已有旧表时，请再执行 008_batch_decompose_schema_sync.sql 做全量对齐。
-- =============================================================================

-- ── 1. batch_decompose_tasks ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.batch_decompose_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id TEXT NOT NULL UNIQUE,
  teacher_id TEXT NOT NULL,
  file_name TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '数学',
  grade TEXT NOT NULL DEFAULT '八年级',
  status TEXT NOT NULL DEFAULT 'pending'
    CONSTRAINT batch_decompose_tasks_status_check
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

CREATE UNIQUE INDEX IF NOT EXISTS batch_tasks_batch_id_idx
  ON public.batch_decompose_tasks (batch_id);

CREATE INDEX IF NOT EXISTS batch_tasks_teacher_idx
  ON public.batch_decompose_tasks (teacher_id);

CREATE INDEX IF NOT EXISTS batch_tasks_status_idx
  ON public.batch_decompose_tasks (status);

CREATE INDEX IF NOT EXISTS batch_tasks_created_at_idx
  ON public.batch_decompose_tasks (created_at DESC);

-- ── 2. batch_decompose_items ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.batch_decompose_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id TEXT NOT NULL
    REFERENCES public.batch_decompose_tasks (batch_id) ON DELETE CASCADE,
  item_index INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CONSTRAINT batch_decompose_items_status_check
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  chunk_text TEXT NOT NULL DEFAULT '',
  question_count INT NOT NULL DEFAULT 0,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT batch_decompose_items_batch_item_unique UNIQUE (batch_id, item_index)
);

CREATE INDEX IF NOT EXISTS batch_items_batch_idx
  ON public.batch_decompose_items (batch_id);

CREATE INDEX IF NOT EXISTS batch_items_status_idx
  ON public.batch_decompose_items (status);

CREATE INDEX IF NOT EXISTS batch_items_batch_status_idx
  ON public.batch_decompose_items (batch_id, status);

CREATE INDEX IF NOT EXISTS batch_items_batch_item_index_idx
  ON public.batch_decompose_items (batch_id, item_index);

-- ── 3. batch_question_bank（progress?withQuestions=true 查询拆题结果） ─────────
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

CREATE INDEX IF NOT EXISTS batch_qb_teacher_idx
  ON public.batch_question_bank (teacher_id);

CREATE INDEX IF NOT EXISTS batch_qb_batch_idx
  ON public.batch_question_bank (batch_id);

CREATE INDEX IF NOT EXISTS batch_qb_batch_teacher_idx
  ON public.batch_question_bank (batch_id, teacher_id);

CREATE INDEX IF NOT EXISTS batch_qb_sort_idx
  ON public.batch_question_bank (batch_id, sort_order);

-- ── RLS：仅 service_role API 访问 ────────────────────────────────────────────
ALTER TABLE public.batch_decompose_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_decompose_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_question_bank ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_direct_batch_tasks" ON public.batch_decompose_tasks;
CREATE POLICY "deny_direct_batch_tasks"
  ON public.batch_decompose_tasks FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_direct_batch_items" ON public.batch_decompose_items;
CREATE POLICY "deny_direct_batch_items"
  ON public.batch_decompose_items FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_direct_batch_qb" ON public.batch_question_bank;
CREATE POLICY "deny_direct_batch_qb"
  ON public.batch_question_bank FOR ALL USING (false) WITH CHECK (false);
