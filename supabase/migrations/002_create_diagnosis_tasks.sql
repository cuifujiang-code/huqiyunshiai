-- 华祺云师AI · 异步诊断任务表
-- 在 Supabase Dashboard → SQL Editor 中执行

CREATE TABLE IF NOT EXISTS public.diagnosis_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT NOT NULL UNIQUE,
  user_id TEXT,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'ocr_done', 'completed', 'failed')),
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  ocr_result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS diagnosis_tasks_task_id_idx ON public.diagnosis_tasks (task_id);
CREATE INDEX IF NOT EXISTS diagnosis_tasks_user_id_idx ON public.diagnosis_tasks (user_id);
CREATE INDEX IF NOT EXISTS diagnosis_tasks_status_idx ON public.diagnosis_tasks (status);

ALTER TABLE public.diagnosis_tasks ENABLE ROW LEVEL SECURITY;

-- 仅服务端 service_role 读写；前端通过 API 轮询，不直连表
CREATE POLICY "Service role full access on diagnosis_tasks"
  ON public.diagnosis_tasks
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE public.diagnosis_tasks IS 'AI 学习诊断异步任务（试卷解析 + OCR + DeepSeek）';
