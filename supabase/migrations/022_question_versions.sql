/**
 * 022 · 题目版本历史（保存前快照 content / answer / analysis）
 */

CREATE TABLE IF NOT EXISTS public.question_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.teacher_question_bank(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  answer TEXT NOT NULL DEFAULT '',
  analysis TEXT NOT NULL DEFAULT '',
  editor_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (question_id, version_number)
);

CREATE INDEX IF NOT EXISTS question_versions_question_id_idx
  ON public.question_versions (question_id);

CREATE INDEX IF NOT EXISTS question_versions_question_created_idx
  ON public.question_versions (question_id, created_at DESC);

COMMENT ON TABLE public.question_versions IS '题库题目历史版本快照';
COMMENT ON COLUMN public.question_versions.editor_id IS '保存前版本的编辑者 teacher_id';
COMMENT ON COLUMN public.question_versions.version_number IS '同一题目内递增版本号，从 1 开始';

ALTER TABLE public.question_versions ENABLE ROW LEVEL SECURITY;
