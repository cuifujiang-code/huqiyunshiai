-- 修复 visibility 约束错误（23514: private 不在 CHECK 允许列表中）
-- Supabase SQL Editor 整段粘贴执行

UPDATE public.teacher_question_bank SET visibility = 'personal' WHERE visibility = 'private' OR visibility IS NULL;
UPDATE public.batch_question_bank SET visibility = 'personal' WHERE visibility = 'private' OR visibility IS NULL;

ALTER TABLE public.teacher_question_bank DROP CONSTRAINT IF EXISTS teacher_question_bank_visibility_check;
ALTER TABLE public.batch_question_bank DROP CONSTRAINT IF EXISTS batch_question_bank_visibility_check;

ALTER TABLE public.teacher_question_bank
  ADD CONSTRAINT teacher_question_bank_visibility_check CHECK (visibility IN ('personal', 'public'));
ALTER TABLE public.batch_question_bank
  ADD CONSTRAINT batch_question_bank_visibility_check CHECK (visibility IN ('personal', 'public'));

ALTER TABLE public.teacher_question_bank ALTER COLUMN visibility SET DEFAULT 'personal';
ALTER TABLE public.batch_question_bank ALTER COLUMN visibility SET DEFAULT 'personal';

-- 验证
SELECT visibility, COUNT(*) FROM public.teacher_question_bank GROUP BY visibility;
SELECT visibility, COUNT(*) FROM public.batch_question_bank GROUP BY visibility;
