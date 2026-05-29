-- =============================================================================
-- 批量拆题表结构一次性同步（Supabase SQL Editor 直接执行，可重复运行）
-- =============================================================================
-- 字段来源：teacher-api/api/batch/*.js → server/batch/batchTaskStore.js
--
-- batch_decompose_tasks 代码引用：
--   batch_id, teacher_id, file_name, subject, grade, status,
--   total_items, completed_items, total_questions, imported_questions,
--   meta, error_message, created_at, updated_at
--
-- batch_decompose_items 代码引用：
--   batch_id, item_index, status, chunk_text, question_count,
--   result, error_message, created_at, updated_at, id
-- =============================================================================

-- ---------- batch_decompose_tasks ----------
ALTER TABLE public.batch_decompose_tasks ADD COLUMN IF NOT EXISTS batch_id TEXT;
ALTER TABLE public.batch_decompose_tasks ADD COLUMN IF NOT EXISTS teacher_id TEXT;
ALTER TABLE public.batch_decompose_tasks ADD COLUMN IF NOT EXISTS file_name TEXT DEFAULT '';
ALTER TABLE public.batch_decompose_tasks ADD COLUMN IF NOT EXISTS subject TEXT NOT NULL DEFAULT '数学';
ALTER TABLE public.batch_decompose_tasks ADD COLUMN IF NOT EXISTS grade TEXT NOT NULL DEFAULT '八年级';
ALTER TABLE public.batch_decompose_tasks ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE public.batch_decompose_tasks ADD COLUMN IF NOT EXISTS total_items INT NOT NULL DEFAULT 0;
ALTER TABLE public.batch_decompose_tasks ADD COLUMN IF NOT EXISTS completed_items INT NOT NULL DEFAULT 0;
ALTER TABLE public.batch_decompose_tasks ADD COLUMN IF NOT EXISTS total_questions INT NOT NULL DEFAULT 0;
ALTER TABLE public.batch_decompose_tasks ADD COLUMN IF NOT EXISTS imported_questions INT NOT NULL DEFAULT 0;
ALTER TABLE public.batch_decompose_tasks ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.batch_decompose_tasks ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.batch_decompose_tasks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.batch_decompose_tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ---------- batch_decompose_items ----------
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS batch_id TEXT;
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS item_index INT;
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS chunk_text TEXT NOT NULL DEFAULT '';
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS question_count INT NOT NULL DEFAULT 0;
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS result JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ---------- 约束与索引（status 须含 partial；旧表可能缺 processing 等） ----------
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

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'batch_decompose_items_status_check'
      AND conrelid = 'public.batch_decompose_items'::regclass
  ) THEN
    ALTER TABLE public.batch_decompose_items DROP CONSTRAINT batch_decompose_items_status_check;
  END IF;
END $$;

ALTER TABLE public.batch_decompose_items
  ADD CONSTRAINT batch_decompose_items_status_check
  CHECK (status IN ('pending', 'processing', 'completed', 'failed'));

CREATE UNIQUE INDEX IF NOT EXISTS batch_tasks_batch_id_idx ON public.batch_decompose_tasks (batch_id);
CREATE INDEX IF NOT EXISTS batch_tasks_teacher_idx ON public.batch_decompose_tasks (teacher_id);
CREATE INDEX IF NOT EXISTS batch_tasks_status_idx ON public.batch_decompose_tasks (status);
CREATE INDEX IF NOT EXISTS batch_items_batch_idx ON public.batch_decompose_items (batch_id);
CREATE INDEX IF NOT EXISTS batch_items_status_idx ON public.batch_decompose_items (status);
