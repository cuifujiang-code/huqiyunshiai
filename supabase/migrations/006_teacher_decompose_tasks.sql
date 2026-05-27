-- 教师端试卷拆题异步任务表
CREATE TABLE IF NOT EXISTS public.teacher_decompose_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id TEXT UNIQUE NOT NULL,
  teacher_id TEXT,
  status TEXT NOT NULL DEFAULT 'processing',
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS teacher_decompose_tasks_task_id_idx ON public.teacher_decompose_tasks (task_id);
CREATE INDEX IF NOT EXISTS teacher_decompose_tasks_teacher_id_idx ON public.teacher_decompose_tasks (teacher_id);

ALTER TABLE public.teacher_decompose_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_decompose_tasks"
  ON public.teacher_decompose_tasks FOR ALL USING (false) WITH CHECK (false);
