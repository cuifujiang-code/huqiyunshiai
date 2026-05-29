-- =============================================================================
-- 华祺云师AI · 批量拆题数据库全量对齐脚本
-- 在 Supabase Dashboard → SQL Editor 中一次性执行（可重复运行）
-- =============================================================================
-- 字段来源：teacher-api/api/batch/*.js → server/batch/batchTaskStore.js
--
-- batch_decompose_tasks  INSERT/UPDATE 字段：
--   batch_id, teacher_id, file_name, subject, grade, status,
--   total_items, completed_items, total_questions, imported_questions,
--   meta, error_message, updated_at (+ created_at 由默认值填充)
--
-- batch_decompose_items  INSERT/UPDATE 字段：
--   batch_id, item_index, status, chunk_text, question_count, result,
--   error_message, updated_at (+ id/created_at 由数据库生成)
-- =============================================================================

BEGIN;

-- ── 0. 建表（全新环境） ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.batch_decompose_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id TEXT UNIQUE NOT NULL,
  teacher_id TEXT NOT NULL,
  file_name TEXT DEFAULT '',
  subject TEXT NOT NULL DEFAULT '数学',
  grade TEXT NOT NULL DEFAULT '八年级',
  status TEXT NOT NULL DEFAULT 'pending',
  total_items INT NOT NULL DEFAULT 0,
  completed_items INT NOT NULL DEFAULT 0,
  total_questions INT NOT NULL DEFAULT 0,
  imported_questions INT NOT NULL DEFAULT 0,
  error_message TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.batch_decompose_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id TEXT NOT NULL,
  item_index INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  chunk_text TEXT NOT NULL DEFAULT '',
  question_count INT NOT NULL DEFAULT 0,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (batch_id, item_index)
);

-- ── 1. 补列（旧表可能缺字段） ────────────────────────────────────────────────
ALTER TABLE public.batch_decompose_tasks ADD COLUMN IF NOT EXISTS batch_id TEXT;
ALTER TABLE public.batch_decompose_tasks ADD COLUMN IF NOT EXISTS teacher_id TEXT;
ALTER TABLE public.batch_decompose_tasks ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE public.batch_decompose_tasks ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE public.batch_decompose_tasks ADD COLUMN IF NOT EXISTS grade TEXT;
ALTER TABLE public.batch_decompose_tasks ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE public.batch_decompose_tasks ADD COLUMN IF NOT EXISTS total_items INT;
ALTER TABLE public.batch_decompose_tasks ADD COLUMN IF NOT EXISTS completed_items INT;
ALTER TABLE public.batch_decompose_tasks ADD COLUMN IF NOT EXISTS total_questions INT;
ALTER TABLE public.batch_decompose_tasks ADD COLUMN IF NOT EXISTS imported_questions INT;
ALTER TABLE public.batch_decompose_tasks ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.batch_decompose_tasks ADD COLUMN IF NOT EXISTS meta JSONB;
ALTER TABLE public.batch_decompose_tasks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE public.batch_decompose_tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS batch_id TEXT;
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS item_index INT;
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS chunk_text TEXT;
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS question_count INT;
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS result JSONB;
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- ── 2. 遗留列迁移：chunk_index → item_index ─────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'batch_decompose_items'
      AND column_name = 'chunk_index'
  ) THEN
    UPDATE public.batch_decompose_items
    SET item_index = chunk_index
    WHERE item_index IS NULL AND chunk_index IS NOT NULL;

    ALTER TABLE public.batch_decompose_items ALTER COLUMN chunk_index DROP NOT NULL;
    ALTER TABLE public.batch_decompose_items DROP COLUMN chunk_index;
  END IF;
END $$;

-- ── 3. 回填 NULL（避免 SET NOT NULL 失败） ───────────────────────────────────
UPDATE public.batch_decompose_tasks SET file_name = COALESCE(file_name, '');
UPDATE public.batch_decompose_tasks SET subject = COALESCE(subject, '数学');
UPDATE public.batch_decompose_tasks SET grade = COALESCE(grade, '八年级');
UPDATE public.batch_decompose_tasks SET status = COALESCE(status, 'pending');
UPDATE public.batch_decompose_tasks SET total_items = COALESCE(total_items, 0);
UPDATE public.batch_decompose_tasks SET completed_items = COALESCE(completed_items, 0);
UPDATE public.batch_decompose_tasks SET total_questions = COALESCE(total_questions, 0);
UPDATE public.batch_decompose_tasks SET imported_questions = COALESCE(imported_questions, 0);
UPDATE public.batch_decompose_tasks SET meta = COALESCE(meta, '{}'::jsonb);
UPDATE public.batch_decompose_tasks SET created_at = COALESCE(created_at, NOW());
UPDATE public.batch_decompose_tasks SET updated_at = COALESCE(updated_at, NOW());

WITH numbered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY batch_id ORDER BY created_at NULLS LAST, id) - 1 AS idx
  FROM public.batch_decompose_items
  WHERE item_index IS NULL
)
UPDATE public.batch_decompose_items AS i
SET item_index = n.idx
FROM numbered AS n
WHERE i.id = n.id;

UPDATE public.batch_decompose_items SET item_index = COALESCE(item_index, 0);
UPDATE public.batch_decompose_items SET status = COALESCE(status, 'pending');
UPDATE public.batch_decompose_items SET chunk_text = COALESCE(chunk_text, '');
UPDATE public.batch_decompose_items SET question_count = COALESCE(question_count, 0);
UPDATE public.batch_decompose_items SET result = COALESCE(result, '{}'::jsonb);
UPDATE public.batch_decompose_items SET created_at = COALESCE(created_at, NOW());
UPDATE public.batch_decompose_items SET updated_at = COALESCE(updated_at, NOW());

-- ── 4. 默认值 ───────────────────────────────────────────────────────────────
ALTER TABLE public.batch_decompose_tasks ALTER COLUMN file_name SET DEFAULT '';
ALTER TABLE public.batch_decompose_tasks ALTER COLUMN subject SET DEFAULT '数学';
ALTER TABLE public.batch_decompose_tasks ALTER COLUMN grade SET DEFAULT '八年级';
ALTER TABLE public.batch_decompose_tasks ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE public.batch_decompose_tasks ALTER COLUMN total_items SET DEFAULT 0;
ALTER TABLE public.batch_decompose_tasks ALTER COLUMN completed_items SET DEFAULT 0;
ALTER TABLE public.batch_decompose_tasks ALTER COLUMN total_questions SET DEFAULT 0;
ALTER TABLE public.batch_decompose_tasks ALTER COLUMN imported_questions SET DEFAULT 0;
ALTER TABLE public.batch_decompose_tasks ALTER COLUMN meta SET DEFAULT '{}'::jsonb;
ALTER TABLE public.batch_decompose_tasks ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE public.batch_decompose_tasks ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE public.batch_decompose_items ALTER COLUMN item_index SET DEFAULT 0;
ALTER TABLE public.batch_decompose_items ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE public.batch_decompose_items ALTER COLUMN chunk_text SET DEFAULT '';
ALTER TABLE public.batch_decompose_items ALTER COLUMN question_count SET DEFAULT 0;
ALTER TABLE public.batch_decompose_items ALTER COLUMN result SET DEFAULT '{}'::jsonb;
ALTER TABLE public.batch_decompose_items ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE public.batch_decompose_items ALTER COLUMN updated_at SET DEFAULT NOW();

-- ── 5. NOT NULL 约束（与代码 INSERT 对齐） ───────────────────────────────────
ALTER TABLE public.batch_decompose_tasks ALTER COLUMN batch_id SET NOT NULL;
ALTER TABLE public.batch_decompose_tasks ALTER COLUMN teacher_id SET NOT NULL;
ALTER TABLE public.batch_decompose_tasks ALTER COLUMN subject SET NOT NULL;
ALTER TABLE public.batch_decompose_tasks ALTER COLUMN grade SET NOT NULL;
ALTER TABLE public.batch_decompose_tasks ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.batch_decompose_tasks ALTER COLUMN total_items SET NOT NULL;
ALTER TABLE public.batch_decompose_tasks ALTER COLUMN completed_items SET NOT NULL;
ALTER TABLE public.batch_decompose_tasks ALTER COLUMN total_questions SET NOT NULL;
ALTER TABLE public.batch_decompose_tasks ALTER COLUMN imported_questions SET NOT NULL;
ALTER TABLE public.batch_decompose_tasks ALTER COLUMN meta SET NOT NULL;
ALTER TABLE public.batch_decompose_tasks ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.batch_decompose_tasks ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.batch_decompose_items ALTER COLUMN batch_id SET NOT NULL;
ALTER TABLE public.batch_decompose_items ALTER COLUMN item_index SET NOT NULL;
ALTER TABLE public.batch_decompose_items ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.batch_decompose_items ALTER COLUMN chunk_text SET NOT NULL;
ALTER TABLE public.batch_decompose_items ALTER COLUMN question_count SET NOT NULL;
ALTER TABLE public.batch_decompose_items ALTER COLUMN result SET NOT NULL;
ALTER TABLE public.batch_decompose_items ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.batch_decompose_items ALTER COLUMN updated_at SET NOT NULL;

-- ── 6. CHECK 约束（含 partial / processing） ──────────────────────────────────
DO $$
DECLARE cname text;
BEGIN
  FOR cname IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
    WHERE con.conrelid = 'public.batch_decompose_tasks'::regclass
      AND con.contype = 'c'
      AND att.attname = 'status'
  LOOP
    EXECUTE format('ALTER TABLE public.batch_decompose_tasks DROP CONSTRAINT %I', cname);
  END LOOP;
END $$;

ALTER TABLE public.batch_decompose_tasks
  ADD CONSTRAINT batch_decompose_tasks_status_check
  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'partial'));

DO $$
DECLARE cname text;
BEGIN
  FOR cname IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
    WHERE con.conrelid = 'public.batch_decompose_items'::regclass
      AND con.contype = 'c'
      AND att.attname = 'status'
  LOOP
    EXECUTE format('ALTER TABLE public.batch_decompose_items DROP CONSTRAINT %I', cname);
  END LOOP;
END $$;

ALTER TABLE public.batch_decompose_items
  ADD CONSTRAINT batch_decompose_items_status_check
  CHECK (status IN ('pending', 'processing', 'completed', 'failed'));

-- ── 7. 索引 ─────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS batch_tasks_batch_id_idx ON public.batch_decompose_tasks (batch_id);
CREATE INDEX IF NOT EXISTS batch_tasks_teacher_idx ON public.batch_decompose_tasks (teacher_id);
CREATE INDEX IF NOT EXISTS batch_tasks_status_idx ON public.batch_decompose_tasks (status);
CREATE INDEX IF NOT EXISTS batch_items_batch_idx ON public.batch_decompose_items (batch_id);
CREATE INDEX IF NOT EXISTS batch_items_status_idx ON public.batch_decompose_items (status);

COMMIT;
