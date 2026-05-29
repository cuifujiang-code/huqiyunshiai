-- 批量拆题表结构同步补丁
-- 适用场景：已执行过旧版 007 或手动建表，缺少 file_name / imported_questions / meta 等字段
-- 在 Supabase Dashboard → SQL Editor 中执行（可重复执行，不会重复添加已有列）

-- ========== batch_decompose_tasks ==========
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

-- 确保 status 约束包含 partial（旧表可能缺少该枚举值）
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

CREATE UNIQUE INDEX IF NOT EXISTS batch_tasks_batch_id_idx ON public.batch_decompose_tasks (batch_id);
CREATE INDEX IF NOT EXISTS batch_tasks_teacher_idx ON public.batch_decompose_tasks (teacher_id);
CREATE INDEX IF NOT EXISTS batch_tasks_status_idx ON public.batch_decompose_tasks (status);

-- ========== batch_decompose_items ==========
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS batch_id TEXT;
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS item_index INT;
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS chunk_text TEXT NOT NULL DEFAULT '';
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS question_count INT NOT NULL DEFAULT 0;
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS result JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

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

CREATE INDEX IF NOT EXISTS batch_items_batch_idx ON public.batch_decompose_items (batch_id);
CREATE INDEX IF NOT EXISTS batch_items_status_idx ON public.batch_decompose_items (status);

-- ========== batch_question_bank（拆题入库） ==========
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS batch_id TEXT;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS teacher_id TEXT;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS item_id UUID;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS grade TEXT;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS knowledge_point TEXT DEFAULT '';
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS question_type TEXT;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS difficulty TEXT NOT NULL DEFAULT '中等';
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS options JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS answer TEXT DEFAULT '';
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS analysis TEXT DEFAULT '';
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS geometry_desc TEXT DEFAULT '';
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS latex_blocks JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT '批量拆题';
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS batch_qb_teacher_idx ON public.batch_question_bank (teacher_id);
CREATE INDEX IF NOT EXISTS batch_qb_batch_idx ON public.batch_question_bank (batch_id);
CREATE INDEX IF NOT EXISTS batch_qb_subject_idx ON public.batch_question_bank (subject);
