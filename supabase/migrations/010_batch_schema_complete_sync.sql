-- =============================================================================
-- 华祺云师AI · 批量拆题三张表「完整补字段」脚本（Supabase SQL Editor 一次性执行）
-- =============================================================================
-- 字段来源：teacher-api/server/batch/batchTaskStore.js
--            teacher-api/server/batch/batchWorker.js
--            teacher-api/api/batch/progress.js
--
-- batch_decompose_tasks
--   INSERT : batch_id, teacher_id, file_name, subject, grade, status,
--            total_items, completed_items, total_questions, imported_questions, meta, updated_at
--   UPDATE : status, completed_items, total_questions, imported_questions, error_message, updated_at
--
-- batch_decompose_items
--   INSERT : batch_id, item_index, status, chunk_text, question_count, result, updated_at
--   UPDATE : status, question_count, result, error_message, updated_at
--
-- batch_question_bank
--   INSERT : batch_id, teacher_id, item_id, subject, grade, knowledge_point,
--            question_type, difficulty, content, options, answer, analysis,
--            geometry_desc, latex_blocks, source, tags, sort_order
--   SELECT : * ORDER BY sort_order
-- =============================================================================

BEGIN;

-- ── 0. 建表（全新环境） ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.batch_decompose_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id TEXT NOT NULL UNIQUE,
  teacher_id TEXT NOT NULL,
  file_name TEXT NOT NULL DEFAULT '',
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

CREATE TABLE IF NOT EXISTS public.batch_question_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id TEXT NOT NULL,
  teacher_id TEXT NOT NULL,
  item_id UUID,
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

-- ── 1. batch_decompose_tasks 补列 ───────────────────────────────────────────
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

-- ── 2. batch_decompose_items 补列 ───────────────────────────────────────────
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS batch_id TEXT;
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS item_index INT;
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS chunk_text TEXT;
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS question_count INT;
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS result JSONB;
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE public.batch_decompose_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- ── 3. batch_question_bank 补列（Worker 写入失败常见原因） ───────────────────
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS batch_id TEXT;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS teacher_id TEXT;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS item_id UUID;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS grade TEXT;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS knowledge_point TEXT;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS question_type TEXT;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS difficulty TEXT;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS options JSONB;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS answer TEXT;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS analysis TEXT;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS geometry_desc TEXT;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS latex_blocks JSONB;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS sort_order INT;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

-- ── 4. 遗留列迁移：chunk_index → item_index ─────────────────────────────────
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

-- ── 5. 回填 NULL ─────────────────────────────────────────────────────────────
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

UPDATE public.batch_question_bank SET knowledge_point = COALESCE(knowledge_point, '');
UPDATE public.batch_question_bank SET difficulty = COALESCE(difficulty, '中等');
UPDATE public.batch_question_bank SET options = COALESCE(options, '[]'::jsonb);
UPDATE public.batch_question_bank SET answer = COALESCE(answer, '');
UPDATE public.batch_question_bank SET analysis = COALESCE(analysis, '');
UPDATE public.batch_question_bank SET geometry_desc = COALESCE(geometry_desc, '');
UPDATE public.batch_question_bank SET latex_blocks = COALESCE(latex_blocks, '[]'::jsonb);
UPDATE public.batch_question_bank SET source = COALESCE(source, '批量拆题');
UPDATE public.batch_question_bank SET tags = COALESCE(tags, '{}');
UPDATE public.batch_question_bank SET sort_order = COALESCE(sort_order, 0);
UPDATE public.batch_question_bank SET created_at = COALESCE(created_at, NOW());

-- ── 6. 默认值 ───────────────────────────────────────────────────────────────
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

ALTER TABLE public.batch_question_bank ALTER COLUMN knowledge_point SET DEFAULT '';
ALTER TABLE public.batch_question_bank ALTER COLUMN difficulty SET DEFAULT '中等';
ALTER TABLE public.batch_question_bank ALTER COLUMN options SET DEFAULT '[]'::jsonb;
ALTER TABLE public.batch_question_bank ALTER COLUMN answer SET DEFAULT '';
ALTER TABLE public.batch_question_bank ALTER COLUMN analysis SET DEFAULT '';
ALTER TABLE public.batch_question_bank ALTER COLUMN geometry_desc SET DEFAULT '';
ALTER TABLE public.batch_question_bank ALTER COLUMN latex_blocks SET DEFAULT '[]'::jsonb;
ALTER TABLE public.batch_question_bank ALTER COLUMN source SET DEFAULT '批量拆题';
ALTER TABLE public.batch_question_bank ALTER COLUMN tags SET DEFAULT '{}';
ALTER TABLE public.batch_question_bank ALTER COLUMN sort_order SET DEFAULT 0;
ALTER TABLE public.batch_question_bank ALTER COLUMN created_at SET DEFAULT NOW();

-- ── 7. NOT NULL（与 Worker INSERT 对齐） ─────────────────────────────────────
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

ALTER TABLE public.batch_question_bank ALTER COLUMN batch_id SET NOT NULL;
ALTER TABLE public.batch_question_bank ALTER COLUMN teacher_id SET NOT NULL;
ALTER TABLE public.batch_question_bank ALTER COLUMN subject SET NOT NULL;
ALTER TABLE public.batch_question_bank ALTER COLUMN grade SET NOT NULL;
ALTER TABLE public.batch_question_bank ALTER COLUMN question_type SET NOT NULL;
ALTER TABLE public.batch_question_bank ALTER COLUMN content SET NOT NULL;
ALTER TABLE public.batch_question_bank ALTER COLUMN knowledge_point SET NOT NULL;
ALTER TABLE public.batch_question_bank ALTER COLUMN difficulty SET NOT NULL;
ALTER TABLE public.batch_question_bank ALTER COLUMN options SET NOT NULL;
ALTER TABLE public.batch_question_bank ALTER COLUMN answer SET NOT NULL;
ALTER TABLE public.batch_question_bank ALTER COLUMN analysis SET NOT NULL;
ALTER TABLE public.batch_question_bank ALTER COLUMN geometry_desc SET NOT NULL;
ALTER TABLE public.batch_question_bank ALTER COLUMN latex_blocks SET NOT NULL;
ALTER TABLE public.batch_question_bank ALTER COLUMN source SET NOT NULL;
ALTER TABLE public.batch_question_bank ALTER COLUMN tags SET NOT NULL;
ALTER TABLE public.batch_question_bank ALTER COLUMN sort_order SET NOT NULL;
ALTER TABLE public.batch_question_bank ALTER COLUMN created_at SET NOT NULL;

-- ── 8. 外键 item_id → batch_decompose_items ───────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'batch_question_bank_item_id_fkey'
  ) THEN
    ALTER TABLE public.batch_question_bank
      ADD CONSTRAINT batch_question_bank_item_id_fkey
      FOREIGN KEY (item_id) REFERENCES public.batch_decompose_items (id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 9. CHECK 约束（含 partial / processing） ─────────────────────────────────
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

-- ── 10. 索引 ────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS batch_tasks_batch_id_idx ON public.batch_decompose_tasks (batch_id);
CREATE INDEX IF NOT EXISTS batch_tasks_teacher_idx ON public.batch_decompose_tasks (teacher_id);
CREATE INDEX IF NOT EXISTS batch_tasks_status_idx ON public.batch_decompose_tasks (status);
CREATE INDEX IF NOT EXISTS batch_tasks_created_at_idx ON public.batch_decompose_tasks (created_at DESC);

CREATE INDEX IF NOT EXISTS batch_items_batch_idx ON public.batch_decompose_items (batch_id);
CREATE INDEX IF NOT EXISTS batch_items_status_idx ON public.batch_decompose_items (status);
CREATE INDEX IF NOT EXISTS batch_items_batch_status_idx ON public.batch_decompose_items (batch_id, status);
CREATE INDEX IF NOT EXISTS batch_items_batch_item_index_idx ON public.batch_decompose_items (batch_id, item_index);

CREATE INDEX IF NOT EXISTS batch_qb_teacher_idx ON public.batch_question_bank (teacher_id);
CREATE INDEX IF NOT EXISTS batch_qb_batch_idx ON public.batch_question_bank (batch_id);
CREATE INDEX IF NOT EXISTS batch_qb_batch_teacher_idx ON public.batch_question_bank (batch_id, teacher_id);
CREATE INDEX IF NOT EXISTS batch_qb_sort_idx ON public.batch_question_bank (batch_id, sort_order);

-- ── 11. RLS ─────────────────────────────────────────────────────────────────
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

COMMIT;
