-- 全科目专题分类字段扩展（topic_group / topic_tag 已存在则跳过）
ALTER TABLE public.teacher_question_bank
  ADD COLUMN IF NOT EXISTS topic_group TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS topic_tag TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_tqb_subject_topic_group
  ON public.teacher_question_bank (subject, topic_group)
  WHERE topic_group <> '';

CREATE INDEX IF NOT EXISTS idx_tqb_subject_topic_tag
  ON public.teacher_question_bank (subject, topic_tag)
  WHERE topic_tag <> '';

COMMENT ON COLUMN public.teacher_question_bank.topic_group IS '一级专题分组（全学段全科目标准体系）';
COMMENT ON COLUMN public.teacher_question_bank.topic_tag IS '二级考点标签（全学段全科目标准体系）';

-- 标准专题参考表（可选，运行时以 shared/topicTaxonomy.json 为准）
CREATE TABLE IF NOT EXISTS public.subject_topic_taxonomy (
  id BIGSERIAL PRIMARY KEY,
  taxonomy_key TEXT NOT NULL,
  subject TEXT NOT NULL,
  grade_band TEXT NOT NULL DEFAULT '',
  group_name TEXT NOT NULL,
  tag_name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE (taxonomy_key, group_name, tag_name)
);

CREATE INDEX IF NOT EXISTS idx_subject_topic_taxonomy_key
  ON public.subject_topic_taxonomy (taxonomy_key);
