-- 013_question_visibility.sql
-- 题库题目可见性（与 012 一致：personal / public）

ALTER TABLE public.teacher_question_bank ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'personal';
ALTER TABLE public.batch_question_bank ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'personal';

-- 若曾误写入 private，先修正再建约束
UPDATE public.teacher_question_bank SET visibility = 'personal' WHERE visibility IS NULL OR visibility = 'private';
UPDATE public.batch_question_bank SET visibility = 'personal' WHERE visibility IS NULL OR visibility = 'private';

ALTER TABLE public.teacher_question_bank DROP CONSTRAINT IF EXISTS teacher_question_bank_visibility_check;
ALTER TABLE public.batch_question_bank DROP CONSTRAINT IF EXISTS batch_question_bank_visibility_check;

ALTER TABLE public.teacher_question_bank
  ADD CONSTRAINT teacher_question_bank_visibility_check CHECK (visibility IN ('personal', 'public'));
ALTER TABLE public.batch_question_bank
  ADD CONSTRAINT batch_question_bank_visibility_check CHECK (visibility IN ('personal', 'public'));

ALTER TABLE public.teacher_question_bank ALTER COLUMN visibility SET DEFAULT 'personal';
ALTER TABLE public.batch_question_bank ALTER COLUMN visibility SET DEFAULT 'personal';

CREATE INDEX IF NOT EXISTS idx_teacher_question_bank_visibility ON public.teacher_question_bank(visibility);
CREATE INDEX IF NOT EXISTS idx_batch_question_bank_visibility ON public.batch_question_bank(visibility);

COMMENT ON COLUMN public.teacher_question_bank.visibility IS '题目可见性: personal=个人题库, public=公域题库（拍照搜题可匹配）';
COMMENT ON COLUMN public.batch_question_bank.visibility IS '题目可见性: personal=个人题库, public=公域题库（拍照搜题可匹配）';
