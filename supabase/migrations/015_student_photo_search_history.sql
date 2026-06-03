-- 学生拍照搜题历史记录
CREATE TABLE IF NOT EXISTS public.student_photo_search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  image_name TEXT DEFAULT '',
  ocr_text TEXT NOT NULL DEFAULT '',
  question TEXT NOT NULL DEFAULT '',
  answer TEXT NOT NULL DEFAULT '',
  analysis TEXT NOT NULL DEFAULT '',
  knowledge_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  source TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('bank', 'ai')),
  bank_question_id TEXT,
  bank_table TEXT,
  matched_question JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_photo_search_user_created
  ON public.student_photo_search_history (user_id, created_at DESC);

COMMENT ON TABLE public.student_photo_search_history IS '学生拍照搜题历史（OCR + 题库匹配 + DeepSeek）';

ALTER TABLE public.student_photo_search_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_direct_photo_search" ON public.student_photo_search_history;
CREATE POLICY "deny_direct_photo_search"
  ON public.student_photo_search_history FOR ALL USING (false) WITH CHECK (false);
