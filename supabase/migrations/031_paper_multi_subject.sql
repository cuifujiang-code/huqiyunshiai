-- 031: 试卷模块全学科拓展 — subject 索引、联合索引、存量数据补全

CREATE INDEX IF NOT EXISTS idx_paper_subject ON public.paper(subject);

CREATE INDEX IF NOT EXISTS idx_paper_subject_grade_term_category
  ON public.paper(subject, grade, term, category_id);

-- 存量试卷默认补全为数学（幂等）
UPDATE public.paper
SET subject = '数学', updated_at = now()
WHERE subject IS NULL
   OR trim(subject) = ''
   OR subject NOT IN ('语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理');

COMMENT ON COLUMN public.paper.subject IS '学科：语文/数学/英语/物理/化学/生物/历史/地理';

NOTIFY pgrst, 'reload schema';
