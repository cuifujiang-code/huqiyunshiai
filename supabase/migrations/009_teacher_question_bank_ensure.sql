-- 教师题库表确保存在 + 可选示例数据（Supabase SQL Editor 可重复执行）
-- 表结构见 supabase/migrations/005_teacher_tools.sql

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
