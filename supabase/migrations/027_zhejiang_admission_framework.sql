-- 027: 浙江省高考志愿填报 — 投档数据表 + 方案字段扩展
-- 暂不对接一分一段表，预留 score_segment 接入位

-- ============================================================
-- 1. 浙江省院校专业投档计划表（标准数据源）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.zhejiang_admission_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_code TEXT NOT NULL DEFAULT '',
  college_name TEXT NOT NULL,
  major_code TEXT NOT NULL DEFAULT '',
  major_name TEXT NOT NULL,
  exam_year INTEGER NOT NULL,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('物理类', '历史类')),
  batch_segment TEXT NOT NULL CHECK (batch_segment IN ('一段', '二段')),
  batch_type TEXT NOT NULL DEFAULT '普通类',
  subject_requirement TEXT NOT NULL DEFAULT '不限',
  enrollment_plan INTEGER,
  min_score NUMERIC,
  avg_score NUMERIC,
  min_rank INTEGER,
  avg_rank INTEGER,
  historical_stats JSONB NOT NULL DEFAULT '[]'::jsonb,
  ext_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (college_code, major_code, exam_year, subject_type, batch_segment)
);

COMMENT ON TABLE public.zhejiang_admission_plans IS '浙江省院校专业投档计划 — 浙江专属数据源（含代码、选科、位次/分数、计划数）';
COMMENT ON COLUMN public.zhejiang_admission_plans.college_code IS '院校代码（省考试院）';
COMMENT ON COLUMN public.zhejiang_admission_plans.major_code IS '专业代码';
COMMENT ON COLUMN public.zhejiang_admission_plans.batch_segment IS '浙江批次：一段/二段';
COMMENT ON COLUMN public.zhejiang_admission_plans.historical_stats IS '历年数组 [{year,min_rank,avg_rank,min_score,avg_score,enrollment}]';
COMMENT ON COLUMN public.zhejiang_admission_plans.ext_json IS '扩展：投档规则备注、院校层次等';

CREATE INDEX IF NOT EXISTS idx_zj_admission_year ON public.zhejiang_admission_plans (exam_year DESC);
CREATE INDEX IF NOT EXISTS idx_zj_admission_batch ON public.zhejiang_admission_plans (batch_segment, subject_type);
CREATE INDEX IF NOT EXISTS idx_zj_admission_college ON public.zhejiang_admission_plans (college_name);
CREATE INDEX IF NOT EXISTS idx_zj_admission_rank ON public.zhejiang_admission_plans (min_rank);

-- ============================================================
-- 2. 一分一段表（预留，暂不灌数）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.zhejiang_score_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_year INTEGER NOT NULL,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('物理类', '历史类')),
  score NUMERIC NOT NULL,
  segment_count INTEGER NOT NULL DEFAULT 0,
  cumulative_rank INTEGER NOT NULL,
  ext_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (exam_year, subject_type, score)
);

COMMENT ON TABLE public.zhejiang_score_segments IS '浙江一分一段表（预留，接入后用于分数↔位次精确换算）';
CREATE INDEX IF NOT EXISTS idx_zj_score_seg_lookup
  ON public.zhejiang_score_segments (exam_year, subject_type, score DESC);

-- ============================================================
-- 3. 扩展 college_admission_data（兼容现有算法）
-- ============================================================
ALTER TABLE public.college_admission_data
  ADD COLUMN IF NOT EXISTS college_code TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS major_code TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS batch_segment TEXT NOT NULL DEFAULT '一段',
  ADD COLUMN IF NOT EXISTS exam_year INTEGER;

UPDATE public.college_admission_data
SET exam_year = year
WHERE exam_year IS NULL AND year IS NOT NULL;

UPDATE public.college_admission_data
SET batch_segment = '一段'
WHERE province = '浙江' AND (batch_segment IS NULL OR batch_segment = '');

-- ============================================================
-- 4. 扩展志愿方案表
-- ============================================================
ALTER TABLE public.volunteer_schemes
  ADD COLUMN IF NOT EXISTS exam_year INTEGER,
  ADD COLUMN IF NOT EXISTS batch_segment TEXT NOT NULL DEFAULT '一段';

COMMENT ON COLUMN public.volunteer_schemes.exam_year IS '高考年份';
COMMENT ON COLUMN public.volunteer_schemes.batch_segment IS '浙江批次：一段/二段';

-- ============================================================
-- 5. 示例投档数据（从现有 seed 映射，便于联调）
-- ============================================================
INSERT INTO public.zhejiang_admission_plans (
  college_code, college_name, major_code, major_name, exam_year, subject_type,
  batch_segment, subject_requirement, enrollment_plan, min_score, avg_score, min_rank, avg_rank, historical_stats
)
SELECT
  COALESCE(ext_json->>'collegeCode', ''),
  college_name,
  COALESCE(ext_json->>'majorCode', ''),
  major_name,
  year,
  subject_type,
  CASE WHEN batch_type IN ('二段', '专科') THEN '二段' ELSE '一段' END,
  subject_requirement,
  enrollment_count,
  min_score,
  avg_score,
  min_rank,
  avg_rank,
  jsonb_build_array(jsonb_build_object(
    'year', year, 'min_rank', min_rank, 'avg_rank', avg_rank,
    'min_score', min_score, 'avg_score', avg_score, 'enrollment', enrollment_count
  ))
FROM public.college_admission_data
WHERE province = '浙江'
ON CONFLICT (college_code, major_code, exam_year, subject_type, batch_segment) DO NOTHING;
