-- 教师题库 + 批量拆题题库 确保存在（Supabase SQL Editor 可重复执行）
-- 教师题库结构见 supabase/migrations/005_teacher_tools.sql
-- 批量拆题完整对齐见 supabase/migrations/010_batch_schema_complete_sync.sql

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. teacher_question_bank（手动录入 / 批量同步写入）
-- ═══════════════════════════════════════════════════════════════════════════
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

ALTER TABLE public.teacher_question_bank ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_direct_tqb" ON public.teacher_question_bank;
CREATE POLICY "deny_direct_tqb" ON public.teacher_question_bank FOR ALL USING (false) WITH CHECK (false);

-- 若表为空，插入一条示例题（请将 teacher_id 替换为实际登录教师 ID）
INSERT INTO public.teacher_question_bank (
  teacher_id,
  subject,
  grade,
  knowledge_point,
  question_type,
  difficulty,
  content,
  options,
  answer,
  analysis,
  source,
  tags
)
SELECT
  'REPLACE_WITH_YOUR_TEACHER_ID',
  '物理',
  '八年级',
  '牛顿第一定律',
  '选择题',
  '中等',
  '下列关于惯性说法正确的是（  ）',
  '["A. 物体运动才有惯性", "B. 物体静止才有惯性", "C. 一切物体都有惯性", "D. 只有受力物体才有惯性"]'::jsonb,
  'C',
  '惯性是物体的固有属性，与运动状态无关。',
  '手动录入',
  ARRAY['示例', '力学']
WHERE NOT EXISTS (SELECT 1 FROM public.teacher_question_bank LIMIT 1);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. batch_question_bank（Worker insertBatchQuestions 写入，partial 状态查看题目）
--    INSERT 字段：batch_id, teacher_id, item_id, subject, grade, knowledge_point,
--    question_type, difficulty, content, options, answer, analysis,
--    geometry_desc, latex_blocks, source, tags, sort_order
-- ═══════════════════════════════════════════════════════════════════════════
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

CREATE INDEX IF NOT EXISTS batch_qb_teacher_idx ON public.batch_question_bank (teacher_id);
CREATE INDEX IF NOT EXISTS batch_qb_batch_idx ON public.batch_question_bank (batch_id);
CREATE INDEX IF NOT EXISTS batch_qb_batch_teacher_idx ON public.batch_question_bank (batch_id, teacher_id);
CREATE INDEX IF NOT EXISTS batch_qb_sort_idx ON public.batch_question_bank (batch_id, sort_order);

ALTER TABLE public.batch_question_bank ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_direct_batch_qb" ON public.batch_question_bank;
CREATE POLICY "deny_direct_batch_qb"
  ON public.batch_question_bank FOR ALL USING (false) WITH CHECK (false);
