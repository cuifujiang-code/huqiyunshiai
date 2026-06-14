/**
 * 023 · 题目学情统计 + 教材版本 + 全文检索辅助字段
 */

-- 教材版本（筛选维度）
ALTER TABLE public.teacher_question_bank
  ADD COLUMN IF NOT EXISTS textbook_version TEXT NOT NULL DEFAULT '';

ALTER TABLE public.batch_question_bank
  ADD COLUMN IF NOT EXISTS textbook_version TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN public.teacher_question_bank.textbook_version IS '教材版本：人教版/北师大版/苏教版等';

-- 全文检索辅助（题干+选项+答案+解析 合并，应用层维护）
ALTER TABLE public.teacher_question_bank
  ADD COLUMN IF NOT EXISTS search_text TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS tqb_search_text_gin
  ON public.teacher_question_bank USING gin (to_tsvector('simple', coalesce(search_text, '')));

-- 学情统计（按题目聚合）
CREATE TABLE IF NOT EXISTS public.question_stats (
  question_id UUID PRIMARY KEY REFERENCES public.teacher_question_bank(id) ON DELETE CASCADE,
  total_attempts INT NOT NULL DEFAULT 0,
  error_rate NUMERIC(6, 4),
  avg_score_rate NUMERIC(6, 4),
  common_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS question_stats_error_rate_idx
  ON public.question_stats (error_rate DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS question_stats_avg_score_idx
  ON public.question_stats (avg_score_rate ASC NULLS LAST);

COMMENT ON TABLE public.question_stats IS '题目学情：答题次数、错误率、得分率、常见错答';
COMMENT ON COLUMN public.question_stats.common_errors IS '常见错误 JSON 数组，如 [{"option":"B","count":12}]';

ALTER TABLE public.question_stats ENABLE ROW LEVEL SECURITY;

-- 回填 search_text（已有题目）
UPDATE public.teacher_question_bank q
SET search_text = trim(
  coalesce(q.content, '') || E'\n' ||
  coalesce(q.answer, '') || E'\n' ||
  coalesce(q.analysis, '') || E'\n' ||
  coalesce(q.options::text, '')
)
WHERE search_text = '' OR search_text IS NULL;
