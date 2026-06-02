-- 013_question_visibility.sql
-- 题库题目可见性字段（个人 / 公域）

ALTER TABLE public.teacher_question_bank ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'private';
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'private';

CREATE INDEX IF NOT EXISTS idx_teacher_question_bank_visibility ON public.teacher_question_bank(visibility);
CREATE INDEX IF NOT EXISTS idx_batch_question_bank_visibility ON public.batch_question_bank(visibility);

UPDATE public.teacher_question_bank SET visibility = 'private' WHERE visibility IS NULL;
UPDATE public.batch_question_bank SET visibility = 'private' WHERE visibility IS NULL;

COMMENT ON COLUMN public.teacher_question_bank.visibility IS '题目可见性: private=个人题库, public=公域题库';
COMMENT ON COLUMN public.batch_question_bank.visibility IS '题目可见性: private=个人题库, public=公域题库';
