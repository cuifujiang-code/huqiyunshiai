/**
 * 021 · 题库元数据标准化 + 知识点关联 + 解析字段文本化说明
 */

-- ═══ analysis 字段：Markdown/LaTeX 纯文本（不再存储图片链接） ═══
COMMENT ON COLUMN public.teacher_question_bank.analysis IS '题目解析：Markdown/LaTeX 纯文本，行内 $...$、块级 $$...$$，由 KaTeX 渲染';
COMMENT ON COLUMN public.batch_question_bank.analysis IS '题目解析：Markdown/LaTeX 纯文本，行内 $...$、块级 $$...$$，由 KaTeX 渲染';

-- ═══ 知识点 UUID 数组关联 ═══
ALTER TABLE public.teacher_question_bank
  ADD COLUMN IF NOT EXISTS knowledge_point_ids UUID[] NOT NULL DEFAULT '{}';

ALTER TABLE public.batch_question_bank
  ADD COLUMN IF NOT EXISTS knowledge_point_ids UUID[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS tqb_knowledge_point_ids_gin
  ON public.teacher_question_bank USING GIN (knowledge_point_ids);

CREATE INDEX IF NOT EXISTS bqb_knowledge_point_ids_gin
  ON public.batch_question_bank USING GIN (knowledge_point_ids);

COMMENT ON COLUMN public.teacher_question_bank.knowledge_point_ids IS '关联 knowledge_points 表（可多选考点）';
COMMENT ON COLUMN public.batch_question_bank.knowledge_point_ids IS '关联 knowledge_points 表（可多选考点）';

-- ═══ 元数据字段（source / difficulty 已存在，补充语义与新字段） ═══
COMMENT ON COLUMN public.teacher_question_bank.source IS '题源/出处，如 2024年高考数学全国卷I';
COMMENT ON COLUMN public.batch_question_bank.source IS '题源/出处，如 2024年高考数学全国卷I';

COMMENT ON COLUMN public.teacher_question_bank.difficulty IS '难度：基础/中等/拔高/压轴';
COMMENT ON COLUMN public.batch_question_bank.difficulty IS '难度：基础/中等/拔高/压轴';

ALTER TABLE public.teacher_question_bank
  ADD COLUMN IF NOT EXISTS ability_dimension TEXT NOT NULL DEFAULT '';

ALTER TABLE public.batch_question_bank
  ADD COLUMN IF NOT EXISTS ability_dimension TEXT NOT NULL DEFAULT '';

ALTER TABLE public.teacher_question_bank
  ADD COLUMN IF NOT EXISTS suitable_stage TEXT NOT NULL DEFAULT '';

ALTER TABLE public.batch_question_bank
  ADD COLUMN IF NOT EXISTS suitable_stage TEXT NOT NULL DEFAULT '';

ALTER TABLE public.teacher_question_bank
  ADD COLUMN IF NOT EXISTS estimated_time INT;

ALTER TABLE public.batch_question_bank
  ADD COLUMN IF NOT EXISTS estimated_time INT;

COMMENT ON COLUMN public.teacher_question_bank.ability_dimension IS '能力维度：逻辑推理/运算求解/直观想象等';
COMMENT ON COLUMN public.batch_question_bank.ability_dimension IS '能力维度：逻辑推理/运算求解/直观想象等';

COMMENT ON COLUMN public.teacher_question_bank.suitable_stage IS '适用阶段：高三一轮复习/高考冲刺等';
COMMENT ON COLUMN public.batch_question_bank.suitable_stage IS '适用阶段：高三一轮复习/高考冲刺等';

COMMENT ON COLUMN public.teacher_question_bank.estimated_time IS '预估答题时间（秒）';
COMMENT ON COLUMN public.batch_question_bank.estimated_time IS '预估答题时间（秒）';

-- 放宽 difficulty 取值（应用层校验，数据库不做硬 CHECK 以兼容历史数据）
UPDATE public.teacher_question_bank SET difficulty = '中等' WHERE difficulty IS NULL OR difficulty = '';
UPDATE public.batch_question_bank SET difficulty = '中等' WHERE difficulty IS NULL OR difficulty = '';

-- 历史 analysis 中的 <img> 标签转为文本占位（一次性迁移）
UPDATE public.teacher_question_bank
SET analysis = regexp_replace(
  regexp_replace(COALESCE(analysis, ''), '<img[^>]*>', '[图片已移除，请改用 LaTeX/Markdown 描述]', 'gi'),
  '!\[[^\]]*\]\([^)]+\)', '[图片已移除，请改用 LaTeX/Markdown 描述]', 'g'
)
WHERE analysis ~* '<img|!\[';

UPDATE public.batch_question_bank
SET analysis = regexp_replace(
  regexp_replace(COALESCE(analysis, ''), '<img[^>]*>', '[图片已移除，请改用 LaTeX/Markdown 描述]', 'gi'),
  '!\[[^\]]*\]\([^)]+\)', '[图片已移除，请改用 LaTeX/Markdown 描述]', 'g'
)
WHERE analysis ~* '<img|!\[';
