-- 教师题库保存公式片段，供列表/详情渲染 【公式】 占位符
ALTER TABLE public.teacher_question_bank
  ADD COLUMN IF NOT EXISTS latex_blocks JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.teacher_question_bank.latex_blocks IS 'LaTeX 片段数组，与题干中【公式】占位符按序对应';
