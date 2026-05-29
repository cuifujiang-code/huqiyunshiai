-- =============================================================================
-- 【仅需执行一次】batch_question_bank 补全字段
-- 在 Supabase Dashboard → SQL Editor 中粘贴并运行本脚本
-- =============================================================================

ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS batch_id TEXT;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS teacher_id TEXT;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS item_id UUID;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS grade TEXT;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS knowledge_point TEXT DEFAULT '未分类';
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS question_type TEXT DEFAULT '应用题';
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT '中等';
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS options JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS answer TEXT DEFAULT '暂无';
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS analysis TEXT DEFAULT '暂无';
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS geometry_desc TEXT DEFAULT '';
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS latex_blocks JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS source TEXT DEFAULT '批量拆题';
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 1;
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS question_number TEXT DEFAULT '';
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.batch_question_bank SET knowledge_point = COALESCE(NULLIF(knowledge_point, ''), '未分类');
UPDATE public.batch_question_bank SET question_type = COALESCE(NULLIF(question_type, ''), '应用题');
UPDATE public.batch_question_bank SET difficulty = COALESCE(NULLIF(difficulty, ''), '中等');
UPDATE public.batch_question_bank SET options = COALESCE(options, '[]'::jsonb);
UPDATE public.batch_question_bank SET answer = COALESCE(NULLIF(answer, ''), '暂无');
UPDATE public.batch_question_bank SET analysis = COALESCE(NULLIF(analysis, ''), '暂无');
UPDATE public.batch_question_bank SET geometry_desc = COALESCE(geometry_desc, '');
UPDATE public.batch_question_bank SET latex_blocks = COALESCE(latex_blocks, '[]'::jsonb);
UPDATE public.batch_question_bank SET source = COALESCE(NULLIF(source, ''), '批量拆题');
UPDATE public.batch_question_bank SET tags = COALESCE(tags, '{}');
UPDATE public.batch_question_bank SET sort_order = COALESCE(sort_order, 1);
UPDATE public.batch_question_bank SET question_number = COALESCE(question_number, '');

CREATE INDEX IF NOT EXISTS batch_qb_batch_idx ON public.batch_question_bank (batch_id);
CREATE INDEX IF NOT EXISTS batch_qb_batch_teacher_idx ON public.batch_question_bank (batch_id, teacher_id);
CREATE INDEX IF NOT EXISTS batch_qb_sort_idx ON public.batch_question_bank (batch_id, sort_order);
